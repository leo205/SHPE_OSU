-- ============================================================================
--  Protected resume submissions — reservation, private upload, pending queue
-- ============================================================================
--  STATUS: NOT YET APPLIED.
--
--  Rollout stage 1 of 3. Apply AFTER attendance-submit.sql (which creates the
--  shared service-only rate limiter). This migration is additive: the current
--  browser upload remains functional until submit-resume and its frontend are
--  deployed. Apply resume-lockdown.sql immediately after that smoke test.
--
--  A reservation is created before Storage is touched. It binds one public
--  retry UUID to an exact SHA-256 fingerprint and a server-generated object
--  path. Exact retries converge; changed payloads cannot overwrite that path.
--  New submissions always enter a separate pending row, so an unverified email
--  claim can never de-list an already-approved resume.
-- ============================================================================

BEGIN;

DO $bucket_check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'resumes') THEN
    RAISE EXCEPTION 'The private resumes Storage bucket does not exist.';
  END IF;
END;
$bucket_check$;

-- Keep the old 250 KB browser flow working during the short overlap, but make
-- Storage independently enforce the same upper bound and MIME type as Edge.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 256000,
    allowed_mime_types = ARRAY['application/pdf']::text[]
WHERE id = 'resumes';

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS submission_id uuid,
  ADD COLUMN IF NOT EXISTS submission_fingerprint text;

DO $constraint_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'resumes_submission_fingerprint_shape'
      AND conrelid = 'public.resumes'::regclass
  ) THEN
    ALTER TABLE public.resumes
      ADD CONSTRAINT resumes_submission_fingerprint_shape
      CHECK (
        submission_fingerprint IS NULL
        OR submission_fingerprint ~ '^[0-9a-f]{64}$'
      );
  END IF;
END;
$constraint_check$;

CREATE UNIQUE INDEX IF NOT EXISTS resumes_submission_id_unique_idx
  ON public.resumes (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resumes_normalized_email_idx
  ON public.resumes (pg_catalog.lower(pg_catalog.btrim(email)));

-- Fail closed instead of silently choosing between two recruiter-visible rows.
-- If this raises, an admin must review the duplicate PDFs before rerunning.
DO $approved_duplicate_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.resumes
    WHERE approved = true
    GROUP BY pg_catalog.lower(pg_catalog.btrim(email))
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate approved resume emails must be resolved before rollout.';
  END IF;
END;
$approved_duplicate_check$;

DO $resume_path_duplicate_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.resumes
    GROUP BY resume_path
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate resume paths must be resolved before rollout.';
  END IF;
END;
$resume_path_duplicate_check$;

CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_approved_email_idx
  ON public.resumes (pg_catalog.lower(pg_catalog.btrim(email)))
  WHERE approved = true;

CREATE UNIQUE INDEX IF NOT EXISTS resumes_resume_path_unique_idx
  ON public.resumes (resume_path);

CREATE TABLE IF NOT EXISTS public.resume_submission_reservations (
  submission_id          uuid PRIMARY KEY,
  submission_started_at  bigint NOT NULL,
  submission_fingerprint text NOT NULL,
  resume_path             text NOT NULL UNIQUE,
  status                  text NOT NULL DEFAULT 'reserved',
  created_at              timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  queued_at               timestamptz,
  CONSTRAINT resume_reservation_fingerprint_shape
    CHECK (submission_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT resume_reservation_path_shape
    CHECK (
      resume_path ~ '^submissions/[0-9]{13}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    ),
  CONSTRAINT resume_reservation_status_values
    CHECK (status IN ('reserved', 'queued', 'superseded'))
);

ALTER TABLE public.resume_submission_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resume_submission_reservations
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS resume_submission_reservations_created_idx
  ON public.resume_submission_reservations (created_at);

CREATE OR REPLACE FUNCTION public.reserve_resume_submission(
  p_submission_id uuid,
  p_submission_started_at bigint,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing public.resume_submission_reservations%ROWTYPE;
  v_now_ms bigint := (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000)::bigint;
  v_path text;
BEGIN
  IF p_submission_id IS NULL
     OR p_submission_started_at IS NULL
     OR p_submission_started_at < v_now_ms - 86400000
     OR p_submission_started_at > v_now_ms + 300000
     OR p_fingerprint IS NULL
     OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'resume_path', NULL);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_submission_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.resume_submission_reservations
  WHERE submission_id = p_submission_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.submission_fingerprint <> p_fingerprint
       OR v_existing.submission_started_at <> p_submission_started_at
       OR v_existing.status = 'superseded' THEN
      RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'resume_path', NULL);
    END IF;

    IF v_existing.status = 'queued' THEN
      IF EXISTS (
        SELECT 1
        FROM public.resumes
        WHERE submission_id = p_submission_id
          AND submission_fingerprint = p_fingerprint
          AND resume_path = v_existing.resume_path
      ) THEN
        IF EXISTS (
          SELECT 1
          FROM storage.objects
          WHERE bucket_id = 'resumes' AND name = v_existing.resume_path
        ) THEN
          RETURN pg_catalog.jsonb_build_object(
            'status', 'accepted',
            'resume_path', v_existing.resume_path
          );
        END IF;

        -- Repair an out-of-band missing object through the same exact,
        -- fingerprint-bound path instead of falsely reporting success.
        RETURN pg_catalog.jsonb_build_object(
          'status', 'reserved',
          'resume_path', v_existing.resume_path
        );
      END IF;
      RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'resume_path', NULL);
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'reserved',
      'resume_path', v_existing.resume_path
    );
  END IF;

  -- The client supplies the timestamp/idempotency UUID, but never controls the
  -- object UUID. That makes the path unguessable even while the legacy anon
  -- upload policy is still present during this staged rollout.
  v_path := 'submissions/' || p_submission_started_at::text || '_'
    || pg_catalog.gen_random_uuid()::text || '.pdf';

  INSERT INTO public.resume_submission_reservations (
    submission_id,
    submission_started_at,
    submission_fingerprint,
    resume_path
  ) VALUES (
    p_submission_id,
    p_submission_started_at,
    p_fingerprint,
    v_path
  );

  RETURN pg_catalog.jsonb_build_object('status', 'reserved', 'resume_path', v_path);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_resume_submission(uuid, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resume_submission(uuid, bigint, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.queue_resume_submission(
  p_submission_id uuid,
  p_fingerprint text,
  p_full_name text,
  p_email text,
  p_major text,
  p_graduation_year text,
  p_resume_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.resume_submission_reservations%ROWTYPE;
  v_name text := pg_catalog.btrim(p_full_name);
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_major text := pg_catalog.btrim(p_major);
  v_current_year integer := extract(year FROM CURRENT_DATE)::integer;
BEGIN
  IF pg_catalog.left(v_major, 8) = 'Other – ' THEN
    v_major := 'Other – ' || pg_catalog.btrim(pg_catalog.substr(v_major, 9));
  END IF;

  IF p_submission_id IS NULL
     OR p_fingerprint IS NULL
     OR p_fingerprint !~ '^[0-9a-f]{64}$'
     OR v_name IS NULL OR v_name = '' OR pg_catalog.length(v_name) > 200
     OR v_name ~ '[[:cntrl:]]'
     OR v_email IS NULL OR pg_catalog.length(v_email) > 254
     OR v_email !~ '^[^@[:space:]]+@(osu\.edu|alumni\.osu\.edu|buckeyemail\.osu\.edu)$'
     OR v_major IS NULL OR pg_catalog.length(v_major) > 158
     OR p_graduation_year IS NULL
     OR p_resume_path IS NULL
     OR p_resume_path !~ '^submissions/[0-9]{13}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$' THEN
    RETURN 'invalid_submission';
  END IF;

  IF NOT (
    v_major = ANY (ARRAY[
      'Aerospace Engineering',
      'Biomedical Engineering',
      'Chemical Engineering',
      'Civil Engineering',
      'Computer Science & Engineering',
      'Computer & Information Science',
      'Data Analytics',
      'Electrical and Computer Engineering',
      'Engineering Physics',
      'Environmental Engineering',
      'Food, Agricultural, & Biological Engineering',
      'Industrial & Systems Eng.',
      'Materials Science Engineering',
      'Mechanical Engineering',
      'Welding Engineering'
    ]::text[])
    OR (
      pg_catalog.left(v_major, 8) = 'Other – '
      AND pg_catalog.length(pg_catalog.btrim(pg_catalog.substr(v_major, 9)))
            BETWEEN 1 AND 150
      AND pg_catalog.btrim(pg_catalog.substr(v_major, 9)) !~ '[[:cntrl:]]'
    )
  ) THEN
    RETURN 'invalid_submission';
  END IF;

  IF p_graduation_year <> 'Alumni' THEN
    IF p_graduation_year !~ '^[0-9]{4}$' THEN
      RETURN 'invalid_submission';
    END IF;
    IF p_graduation_year::integer < v_current_year - 1
       OR p_graduation_year::integer > v_current_year + 6 THEN
      RETURN 'invalid_submission';
    END IF;
  END IF;

  -- Queue and approval take the normalized-email lock before any row locks.
  -- Keeping one order avoids a reservation/approval deadlock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-email:' || v_email, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_submission_id::text, 0)
  );

  SELECT * INTO v_reservation
  FROM public.resume_submission_reservations
  WHERE submission_id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'invalid_submission';
  END IF;
  IF v_reservation.status = 'superseded'
     OR v_reservation.submission_fingerprint <> p_fingerprint
     OR v_reservation.resume_path <> p_resume_path THEN
    RETURN 'conflict';
  END IF;

  IF v_reservation.status = 'queued' THEN
    IF EXISTS (
      SELECT 1
      FROM public.resumes
      WHERE submission_id = p_submission_id
        AND submission_fingerprint = p_fingerprint
        AND resume_path = p_resume_path
    ) AND EXISTS (
      SELECT 1
      FROM storage.objects
      WHERE bucket_id = 'resumes' AND name = p_resume_path
    ) THEN
      RETURN 'accepted';
    END IF;
    RETURN 'conflict';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'resumes' AND name = p_resume_path
  ) THEN
    RETURN 'invalid_submission';
  END IF;

  INSERT INTO public.resumes (
    full_name,
    email,
    major,
    graduation_year,
    resume_path,
    uploaded_at,
    approved,
    submission_id,
    submission_fingerprint
  ) VALUES (
    v_name,
    v_email,
    v_major,
    p_graduation_year,
    p_resume_path,
    pg_catalog.clock_timestamp(),
    false,
    p_submission_id,
    p_fingerprint
  );

  UPDATE public.resume_submission_reservations
  SET status = 'queued', queued_at = pg_catalog.clock_timestamp()
  WHERE submission_id = p_submission_id;

  RETURN 'accepted';
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_resume_submission(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_resume_submission(uuid, text, text, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.approve_resume_submission(p_resume_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_target public.resumes%ROWTYPE;
  v_updated integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO v_email
  FROM public.resumes
  WHERE id = p_resume_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-email:' || v_email, 0)
  );

  SELECT * INTO v_target
  FROM public.resumes
  WHERE id = p_resume_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(v_target.email)) <> v_email THEN
    RETURN 'conflict';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'resumes' AND name = v_target.resume_path
  ) THEN
    RETURN 'missing_file';
  END IF;

  -- Lock every version before changing recruiter visibility. The old approved
  -- row remains visible until this transaction atomically approves the target
  -- and retires its sibling metadata.
  PERFORM 1
  FROM public.resumes
  WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_email
  FOR UPDATE;

  UPDATE public.resume_submission_reservations
  SET status = 'superseded'
  WHERE submission_id IN (
    SELECT submission_id
    FROM public.resumes
    WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_email
      AND id <> p_resume_id
      AND uploaded_at <= v_target.uploaded_at
      AND submission_id IS NOT NULL
  );

  DELETE FROM public.resumes
  WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_email
    AND id <> p_resume_id
    AND uploaded_at <= v_target.uploaded_at;

  UPDATE public.resumes
  SET approved = true
  WHERE id = p_resume_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'resume_approval_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN 'accepted';
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_resume_submission(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_resume_submission(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_resume_submission(p_resume_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_initial_email text;
  v_initial_submission_id uuid;
  v_target public.resumes%ROWTYPE;
  v_deleted integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(email)), submission_id
  INTO v_initial_email, v_initial_submission_id
  FROM public.resumes
  WHERE id = p_resume_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-email:' || v_initial_email, 0)
  );
  IF v_initial_submission_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_initial_submission_id::text, 0)
    );
  END IF;

  SELECT * INTO v_target
  FROM public.resumes
  WHERE id = p_resume_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(v_target.email)) <> v_initial_email
     OR v_target.submission_id IS DISTINCT FROM v_initial_submission_id THEN
    RETURN pg_catalog.jsonb_build_object('status', 'conflict');
  END IF;

  IF v_target.submission_id IS NOT NULL THEN
    UPDATE public.resume_submission_reservations
    SET status = 'superseded'
    WHERE submission_id = v_target.submission_id;
  END IF;

  DELETE FROM public.resumes WHERE id = p_resume_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'resume_delete_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'deleted',
    'resume_path', v_target.resume_path
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_resume_submission(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_resume_submission(uuid)
  TO authenticated;

COMMIT;

-- Verify before deploying submit-resume:
--   * anon cannot execute reserve_resume_submission or queue_resume_submission
--   * service_role can reserve, upload, queue, and exactly retry
--   * a changed fingerprint for the same submission UUID returns conflict
--   * a new submission for an already-approved email creates a second PENDING
--     row and leaves the approved row unchanged
--   * an authenticated non-admin cannot approve_resume_submission

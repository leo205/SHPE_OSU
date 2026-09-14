-- ============================================================================
-- Durable cleanup for retired private resume files
-- ============================================================================
-- Apply AFTER resume-edge-submit.sql and BEFORE deploying cleanup-resume-files.
-- This file is the authoritative extension to the approval/deletion lifecycle:
-- its BEFORE DELETE trigger queues the exact retired path in the SAME
-- transaction used by approve_resume_submission/delete_resume_submission.
-- Existing rows/files are not removed or backfilled by this migration.
--
-- Only the authenticated-admin Edge worker may call the service-only claim and
-- finish RPCs. The worker deletes objects using the Supabase Storage API, never
-- by deleting storage.objects rows. Failed/interrupted work remains retryable.
-- Completed rows are permanent path tombstones; do not truncate/prune this
-- table, because reference guards rely on it to prohibit retired-path reuse.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.resume_file_cleanup (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  resume_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'completed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT resume_cleanup_lease_state CHECK (
    (status = 'leased' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'leased' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

ALTER TABLE public.resume_file_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resume_file_cleanup
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS resume_file_cleanup_pending_idx
  ON public.resume_file_cleanup (next_attempt_at, created_at)
  WHERE status <> 'completed';

CREATE OR REPLACE FUNCTION public.guard_resume_file_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Paths belong to immutable server-generated reservations. Metadata changes
  -- such as major edits and approval still work without changing the path.
  IF TG_OP = 'UPDATE' AND NEW.resume_path IS DISTINCT FROM OLD.resume_path THEN
    RAISE EXCEPTION 'resume_path_immutable' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-file:' || NEW.resume_path, 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.resume_file_cleanup WHERE resume_path = NEW.resume_path
  ) THEN
    RAISE EXCEPTION 'resume_path_retired' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_resume_file_reference()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS resumes_guard_file_reference ON public.resumes;
CREATE TRIGGER resumes_guard_file_reference
  BEFORE INSERT OR UPDATE OF resume_path ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.guard_resume_file_reference();

CREATE OR REPLACE FUNCTION public.guard_resume_reservation_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.resume_path IS DISTINCT FROM OLD.resume_path THEN
      RAISE EXCEPTION 'resume_path_immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
      RAISE EXCEPTION 'resume_reservation_retired' USING ERRCODE = '23514';
    END IF;
    -- Retirement must remain possible after the delete trigger has queued the
    -- path. A superseded reservation cannot reserve/queue/upload it again.
    IF NEW.status = 'superseded' THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-file:' || NEW.resume_path, 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.resume_file_cleanup WHERE resume_path = NEW.resume_path
  ) THEN
    RAISE EXCEPTION 'resume_path_retired' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_resume_reservation_reference()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS resume_reservations_guard_reference
  ON public.resume_submission_reservations;
CREATE TRIGGER resume_reservations_guard_reference
  BEFORE INSERT OR UPDATE ON public.resume_submission_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_resume_reservation_reference();

CREATE OR REPLACE FUNCTION public.enqueue_retired_resume_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-file:' || OLD.resume_path, 0)
  );
  INSERT INTO public.resume_file_cleanup (resume_path)
  VALUES (OLD.resume_path)
  ON CONFLICT (resume_path) DO NOTHING;

  -- Use the authoritative path as well as the existing lifecycle RPC's
  -- submission-id retirement, so a legacy metadata row cannot leave an active
  -- reservation pointing to an object scheduled for deletion.
  UPDATE public.resume_submission_reservations
  SET status = 'superseded'
  WHERE resume_path = OLD.resume_path AND status <> 'superseded';
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_retired_resume_file()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS resumes_enqueue_file_cleanup ON public.resumes;
CREATE TRIGGER resumes_enqueue_file_cleanup
  BEFORE DELETE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_retired_resume_file();

CREATE OR REPLACE FUNCTION public.claim_resume_file_cleanup(p_limit integer DEFAULT 5)
RETURNS TABLE (id uuid, resume_path text, lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT q.id
    FROM public.resume_file_cleanup AS q
    WHERE (
      (q.status = 'pending' AND q.next_attempt_at <= v_now)
      OR (q.status = 'leased' AND q.lease_expires_at <= v_now)
      -- An in-flight upload can finish after an earlier cleanup. Retaining
      -- tombstones and rechecking object existence makes that late object
      -- retryable too, without permitting the metadata to be resurrected.
      OR (q.status = 'completed' AND EXISTS (
        SELECT 1 FROM storage.objects AS o
        WHERE o.bucket_id = 'resumes' AND o.name = q.resume_path
      ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.resumes AS r WHERE r.resume_path = q.resume_path
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.resume_submission_reservations AS s
      WHERE s.resume_path = q.resume_path AND s.status <> 'superseded'
    )
    ORDER BY q.next_attempt_at, q.created_at, q.id
    LIMIT greatest(1, least(coalesce(p_limit, 5), 5))
    FOR UPDATE OF q SKIP LOCKED
  )
  UPDATE public.resume_file_cleanup AS q
  SET status = 'leased',
      attempts = q.attempts + 1,
      lease_token = pg_catalog.gen_random_uuid(),
      lease_expires_at = v_now + interval '2 minutes',
      completed_at = NULL
  FROM eligible
  WHERE q.id = eligible.id
  RETURNING q.id, q.resume_path, q.lease_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_resume_file_cleanup(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_resume_file_cleanup(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_resume_file_cleanup(
  p_cleanup_id uuid,
  p_lease_token uuid,
  p_success boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target public.resume_file_cleanup%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_target
  FROM public.resume_file_cleanup
  WHERE id = p_cleanup_id
    AND status = 'leased'
    AND lease_token = p_lease_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'stale_lease';
  END IF;

  IF p_success IS TRUE THEN
    UPDATE public.resume_file_cleanup
    SET status = 'completed', completed_at = v_now,
        lease_token = NULL, lease_expires_at = NULL
    WHERE id = p_cleanup_id;
    RETURN 'completed';
  END IF;

  UPDATE public.resume_file_cleanup
  SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
      next_attempt_at = v_now + pg_catalog.make_interval(
        secs => least(3600, 30 * (2 ^ least(v_target.attempts - 1, 7))::integer)
      )
  WHERE id = p_cleanup_id;
  RETURN 'retry_scheduled';
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_resume_file_cleanup(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_resume_file_cleanup(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pending_resume_file_cleanup_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.count(*)::integer
  FROM public.resume_file_cleanup AS q
  WHERE q.status <> 'completed' OR EXISTS (
    SELECT 1 FROM storage.objects AS o
    WHERE o.bucket_id = 'resumes' AND o.name = q.resume_path
  );
$function$;

REVOKE ALL ON FUNCTION public.pending_resume_file_cleanup_count()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_resume_file_cleanup_count()
  TO service_role;

COMMIT;

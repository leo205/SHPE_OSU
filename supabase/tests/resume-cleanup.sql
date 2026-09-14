-- Transactional regression suite for an ISOLATED local PostgreSQL/PGlite DB.
-- Prerequisites: schema/auth/storage fixtures, resume-edge-submit.sql,
-- resume-cleanup.sql, and SET shpe.test_database = 'true'. Never use --linked.
-- These tests create synthetic metadata only and roll every change back.
BEGIN;

DO $local_only$
BEGIN
  IF pg_catalog.current_setting('shpe.test_database', true) IS DISTINCT FROM 'true'
     OR EXISTS (SELECT 1 FROM public.resume_file_cleanup) THEN
    RAISE EXCEPTION 'Run resume cleanup tests only in an empty isolated test database';
  END IF;
END;
$local_only$;

SELECT pg_catalog.set_config(
  'request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true
);

DO $regressions$
DECLARE
  v_old_id uuid := pg_catalog.gen_random_uuid();
  v_target_id uuid := pg_catalog.gen_random_uuid();
  v_newer_id uuid := pg_catalog.gen_random_uuid();
  v_old_submission uuid := pg_catalog.gen_random_uuid();
  v_target_submission uuid := pg_catalog.gen_random_uuid();
  v_newer_submission uuid := pg_catalog.gen_random_uuid();
  v_started bigint := (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000)::bigint;
  v_old_path text;
  v_target_path text;
  v_newer_path text;
  v_reserved_path text;
  v_email text := 'cleanup-' || pg_catalog.gen_random_uuid()::text || '@osu.edu';
  v_fingerprint text := pg_catalog.repeat('a', 64);
  v_claim record;
  v_retry record;
  v_delete jsonb;
  v_result text;
  v_count integer;
BEGIN
  v_old_path := 'submissions/' || v_started::text || '_' || v_old_id::text || '.pdf';
  v_target_path := 'submissions/' || v_started::text || '_' || v_target_id::text || '.pdf';
  v_newer_path := 'submissions/' || v_started::text || '_' || v_newer_id::text || '.pdf';
  v_reserved_path := 'submissions/' || v_started::text || '_'
    || pg_catalog.gen_random_uuid()::text || '.pdf';

  INSERT INTO public.resume_submission_reservations (
    submission_id, submission_started_at, submission_fingerprint, resume_path, status
  ) VALUES
    (v_old_submission, v_started, v_fingerprint, v_old_path, 'queued'),
    (v_target_submission, v_started, v_fingerprint, v_target_path, 'queued'),
    (v_newer_submission, v_started, v_fingerprint, v_newer_path, 'queued');

  INSERT INTO public.resumes (
    id, full_name, email, major, graduation_year, resume_path, uploaded_at,
    approved, submission_id, submission_fingerprint
  ) VALUES
    (v_old_id, 'Cleanup Fixture', v_email, 'Mechanical Engineering', 'Alumni',
      v_old_path, pg_catalog.clock_timestamp() - interval '2 days', true,
      v_old_submission, v_fingerprint),
    (v_target_id, 'Cleanup Fixture', pg_catalog.upper(v_email), 'Mechanical Engineering', 'Alumni',
      v_target_path, pg_catalog.clock_timestamp() - interval '1 day', false,
      v_target_submission, v_fingerprint),
    (v_newer_id, 'Cleanup Fixture', v_email, 'Mechanical Engineering', 'Alumni',
      v_newer_path, pg_catalog.clock_timestamp(), false,
      v_newer_submission, v_fingerprint);

  -- The already missing old object exercises idempotent missing-file cleanup.
  -- Only the new approved target needs an object for the approval precondition.
  INSERT INTO storage.objects (bucket_id, name) VALUES ('resumes', v_target_path);

  v_result := public.approve_resume_submission(v_target_id);
  IF v_result <> 'accepted' THEN RAISE EXCEPTION 'approval failed: %', v_result; END IF;
  IF EXISTS (SELECT 1 FROM public.resumes WHERE id = v_old_id)
     OR NOT EXISTS (SELECT 1 FROM public.resumes WHERE id = v_target_id AND approved)
     OR NOT EXISTS (SELECT 1 FROM public.resumes WHERE id = v_newer_id AND NOT approved)
     OR NOT EXISTS (
       SELECT 1 FROM public.resume_file_cleanup WHERE resume_path = v_old_path
     )
     OR EXISTS (
       SELECT 1 FROM public.resume_file_cleanup
       WHERE resume_path IN (v_target_path, v_newer_path)
     ) THEN
    RAISE EXCEPTION 'replacement must retire only older versions and preserve active/newer files';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.resume_submission_reservations
    WHERE submission_id = v_old_submission AND status = 'superseded'
  ) THEN RAISE EXCEPTION 'retired reservation remained active'; END IF;

  SELECT * INTO v_claim FROM public.claim_resume_file_cleanup(5);
  IF v_claim.id IS NULL OR v_claim.resume_path <> v_old_path THEN
    RAISE EXCEPTION 'claim did not select only the retired path';
  END IF;
  SELECT pg_catalog.count(*) INTO v_count FROM public.claim_resume_file_cleanup(5);
  IF v_count <> 0 THEN RAISE EXCEPTION 'unexpired lease was claimed twice'; END IF;
  IF public.finish_resume_file_cleanup(v_claim.id, pg_catalog.gen_random_uuid(), true)
       <> 'stale_lease' THEN
    RAISE EXCEPTION 'unknown lease was accepted';
  END IF;
  IF public.finish_resume_file_cleanup(v_claim.id, v_claim.lease_token, false)
       <> 'retry_scheduled' THEN
    RAISE EXCEPTION 'failure was not scheduled for retry';
  END IF;
  SELECT pg_catalog.count(*) INTO v_count FROM public.claim_resume_file_cleanup(5);
  IF v_count <> 0 OR public.pending_resume_file_cleanup_count() <> 1 THEN
    RAISE EXCEPTION 'retry backoff or pending count is incorrect';
  END IF;

  UPDATE public.resume_file_cleanup
  SET next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
  WHERE id = v_claim.id;
  SELECT * INTO v_retry FROM public.claim_resume_file_cleanup(5);
  IF v_retry.lease_token = v_claim.lease_token THEN
    RAISE EXCEPTION 'retry reused its previous lease';
  END IF;
  UPDATE public.resume_file_cleanup
  SET lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
  WHERE id = v_claim.id;
  SELECT * INTO v_claim FROM public.claim_resume_file_cleanup(5);
  IF v_claim.lease_token = v_retry.lease_token
     OR public.finish_resume_file_cleanup(v_retry.id, v_retry.lease_token, true)
       <> 'stale_lease' THEN
    RAISE EXCEPTION 'expired worker could acknowledge the replacement lease';
  END IF;
  -- Separate statements match the worker's separate RPCs. The count function
  -- is STABLE and must not share an expression snapshot with the mutation.
  v_result := public.finish_resume_file_cleanup(v_claim.id, v_claim.lease_token, true);
  IF v_result <> 'completed' OR public.pending_resume_file_cleanup_count() <> 0 THEN
    RAISE EXCEPTION 'missing-file success was not completed';
  END IF;
  SELECT pg_catalog.count(*) INTO v_count FROM public.claim_resume_file_cleanup(5);
  IF v_count <> 0 THEN RAISE EXCEPTION 'absent completed object was reclaimed'; END IF;

  -- Path tombstones survive success: neither metadata nor a fresh reservation
  -- can attach to the object after a worker has decided it is safe to remove.
  BEGIN
    INSERT INTO public.resumes (full_name, email, major, graduation_year, resume_path)
    VALUES ('Unexpected Reuse', v_email, 'Mechanical Engineering', 'Alumni', v_old_path);
    RAISE EXCEPTION 'retired path accepted a new metadata reference';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'resume_path_retired' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.resumes SET resume_path = v_old_path WHERE id = v_newer_id;
    RAISE EXCEPTION 'metadata path could be reassigned';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'resume_path_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.resume_submission_reservations
    SET status = 'reserved' WHERE submission_id = v_old_submission;
    RAISE EXCEPTION 'superseded reservation was reopened';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'resume_reservation_retired' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.resume_submission_reservations (
      submission_id, submission_started_at, submission_fingerprint, resume_path
    ) VALUES (pg_catalog.gen_random_uuid(), v_started, v_fingerprint, v_old_path);
    RAISE EXCEPTION 'retired path accepted a new reservation';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'resume_path_retired' THEN RAISE; END IF;
  END;
  IF public.reserve_resume_submission(v_old_submission, v_started, v_fingerprint)->>'status'
       <> 'conflict' THEN
    RAISE EXCEPTION 'old upload retry could reserve a retired object';
  END IF;

  -- An upload already in flight at retirement may finish after a worker. It
  -- still cannot reattach, and its completed tombstone must make cleanup retry.
  INSERT INTO storage.objects (bucket_id, name) VALUES ('resumes', v_old_path);
  IF public.pending_resume_file_cleanup_count() <> 1 THEN
    RAISE EXCEPTION 'late object was omitted from pending cleanup';
  END IF;
  SELECT * INTO v_claim FROM public.claim_resume_file_cleanup(5);
  IF v_claim.resume_path <> v_old_path THEN
    RAISE EXCEPTION 'late object did not become retryable';
  END IF;

  -- A failed approval/deletion transaction must roll its cleanup record back.
  BEGIN
    PERFORM public.delete_resume_submission(v_target_id);
    RAISE EXCEPTION 'intentional transaction rollback' USING ERRCODE = 'P0002';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.resumes WHERE id = v_target_id AND approved)
     OR EXISTS (SELECT 1 FROM public.resume_file_cleanup WHERE resume_path = v_target_path) THEN
    RAISE EXCEPTION 'failed lifecycle transaction left partial cleanup';
  END IF;

  v_delete := public.delete_resume_submission(v_target_id);
  IF v_delete->>'status' <> 'deleted' OR v_delete->>'resume_path' <> v_target_path
     OR NOT EXISTS (
       SELECT 1 FROM public.resume_file_cleanup WHERE resume_path = v_target_path
     )
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = v_target_path) THEN
    RAISE EXCEPTION 'delete must queue authoritative path without directly deleting Storage';
  END IF;
  IF public.delete_resume_submission(v_target_id)->>'status' <> 'not_found' THEN
    RAISE EXCEPTION 'repeated delete was not idempotent';
  END IF;

  -- Deliberately inconsistent fixture proves the worker still checks references
  -- even if future privileged maintenance bypasses normal lifecycle triggers.
  INSERT INTO public.resume_file_cleanup (resume_path) VALUES (v_newer_path);
  SELECT pg_catalog.count(*) INTO v_count
  FROM public.claim_resume_file_cleanup(5) WHERE resume_path = v_newer_path;
  IF v_count <> 0 THEN RAISE EXCEPTION 'active resume file was claimed'; END IF;

  INSERT INTO public.resume_submission_reservations (
    submission_id, submission_started_at, submission_fingerprint, resume_path
  ) VALUES (pg_catalog.gen_random_uuid(), v_started, v_fingerprint, v_reserved_path);
  INSERT INTO public.resume_file_cleanup (resume_path) VALUES (v_reserved_path);
  SELECT pg_catalog.count(*) INTO v_count
  FROM public.claim_resume_file_cleanup(5) WHERE resume_path = v_reserved_path;
  IF v_count <> 0 THEN RAISE EXCEPTION 'active upload reservation was claimed'; END IF;
END;
$regressions$;

DO $permissions$
DECLARE
  v_role text;
  v_function text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
          WHERE oid = 'public.resume_file_cleanup'::regclass) THEN
    RAISE EXCEPTION 'cleanup queue has no RLS';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'public.resume_file_cleanup',
                                      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
      RAISE EXCEPTION 'role % has direct cleanup table access', v_role;
    END IF;
    FOREACH v_function IN ARRAY ARRAY[
      'public.claim_resume_file_cleanup(integer)',
      'public.finish_resume_file_cleanup(uuid,uuid,boolean)',
      'public.pending_resume_file_cleanup_count()'
    ] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_function, 'EXECUTE')
           IS DISTINCT FROM (v_role = 'service_role') THEN
        RAISE EXCEPTION 'incorrect RPC grant: % for %', v_function, v_role;
      END IF;
    END LOOP;
  END LOOP;
END;
$permissions$;

SET LOCAL ROLE anon;
DO $anonymous_denial$
BEGIN
  BEGIN
    PERFORM public.claim_resume_file_cleanup(1);
    RAISE EXCEPTION 'anonymous cleanup claim unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$anonymous_denial$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $authenticated_denial$
BEGIN
  BEGIN
    PERFORM public.claim_resume_file_cleanup(1);
    RAISE EXCEPTION 'authenticated cleanup claim bypassed the worker';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$authenticated_denial$;
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.pending_resume_file_cleanup_count();
RESET ROLE;

ROLLBACK;

-- ============================================================================
--  Resume submission lockdown — remove every legacy anonymous write path
-- ============================================================================
--  STATUS: NOT YET APPLIED.
--
--  Rollout stage 3 of 3. Run ONLY after all of the following are verified in a
--  staging/preview deployment:
--    1. resume-edge-submit.sql is applied;
--    2. submit-resume is deployed with verify_jwt=false and server secrets;
--    3. the browser successfully queues a test PDF through submit-resume;
--    4. an admin can view/approve/delete that test submission.
--
--  This intentionally breaks the old browser implementation. Do not run it
--  while production still uploads directly to Storage or calls submit_resume.
-- ============================================================================

BEGIN;

-- Metadata must be written only by the service-only queue RPC.
DROP POLICY IF EXISTS "resumes public insert" ON public.resumes;
DROP POLICY IF EXISTS "Public can insert resumes" ON public.resumes;
REVOKE INSERT ON TABLE public.resumes FROM anon;

-- Storage must be written only by the Edge Function's server secret. Keep the
-- authenticated admin read/delete policies and sponsor approved-file read.
DROP POLICY IF EXISTS "resumes bucket public upload" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload to resumes bucket" ON storage.objects;
REVOKE INSERT ON TABLE storage.objects FROM anon;

-- This old SECURITY DEFINER upsert accepts only a claimed email and immediately
-- de-approves/replaces that email's row. Leaving EXECUTE granted would bypass
-- Turnstile, rate limits, reservations, and the safe pending-revision model.
REVOKE ALL ON FUNCTION public.submit_resume(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Assert the intended final state before committing it.
DO $lockdown_verify$
BEGIN
  IF pg_catalog.has_function_privilege(
    'anon',
    'public.submit_resume(text,text,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can still execute submit_resume';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.resumes', 'INSERT') THEN
    RAISE EXCEPTION 'anon still has INSERT on public.resumes';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'storage.objects', 'INSERT') THEN
    RAISE EXCEPTION 'anon still has INSERT on storage.objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'resumes bucket public upload',
        'Public can upload to resumes bucket'
      )
  ) THEN
    RAISE EXCEPTION 'a legacy resume Storage upload policy still exists';
  END IF;
END;
$lockdown_verify$;

COMMIT;

-- Post-lockdown smoke tests:
--   * direct anon Storage upload -> denied
--   * direct anon submit_resume(...) -> denied
--   * submit-resume exact valid request -> accepted
--   * same request/token replay -> Turnstile rejection; fresh-token exact retry
--     -> accepted without a duplicate row
--   * changed draft under the same submission UUID -> idempotency_conflict

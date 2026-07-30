-- ============================================================================
--  Sponsor logins — close the resume book
-- ============================================================================
--  STATUS: NOT YET APPLIED.
--
--  This replaces the access-code system with real Supabase Auth users, and
--  closes the exposure verified in production on 2026-07-30:
--
--    * anon could read every approved row of `resumes` (names + OSU emails)
--    * anon could read `company_access` INCLUDING every access_code
--    * anon could mint a storage signed URL and download a real resume PDF
--    * anon could INSERT a resume with approved = true, publishing straight
--      into the recruiter-visible book with no E-Board review
--
--  ⚠️  RUN SECTION 1 BEFORE ANY OTHER SECTION. Section 1 tags your existing
--  admin accounts. Every later policy depends on that tag, so applying them
--  first would lock the E-Board out of its own dashboard.
--
--  ⚠️  Deploy the matching client change at roughly the same time. Section 3
--  closes public read on `resumes`, which is what /company/dashboard currently
--  uses, so the old client stops working the moment it runs.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tag admins.  RUN THIS FIRST, THEN VERIFY, THEN CONTINUE.
-- ─────────────────────────────────────────────────────────────────────────────
--  Roles live in `raw_app_meta_data`, NOT `raw_user_meta_data`.
--
--  This distinction is the whole security of the scheme. A signed-in user can
--  rewrite their own user_metadata at will via supabase.auth.updateUser(), so a
--  role stored there could be self-granted — any sponsor could make themselves
--  an admin from the browser console. app_metadata is writable only by the
--  service role and the dashboard, never by the user.

-- List current users so you know exactly what you are about to change:
--   SELECT id, email, raw_app_meta_data FROM auth.users ORDER BY created_at;

-- Then tag each E-Board admin account. Replace the email; repeat per admin.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'REPLACE_WITH_ADMIN_EMAIL@osu.edu';

-- VERIFY before continuing — this must list every admin, and no sponsors:
--   SELECT email, raw_app_meta_data ->> 'role' AS role FROM auth.users;
--
--  NOTE: the role is baked into the JWT at sign-in, so any admin who is already
--  signed in must sign out and back in before their new role takes effect.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Role helper
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. resumes — the actual PII
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read approved resumes" ON public.resumes;
DROP POLICY IF EXISTS "Public can insert resumes"        ON public.resumes;
DROP POLICY IF EXISTS "Admins can manage resumes"        ON public.resumes;

-- Students upload without an account. approved is pinned false so a crafted
-- request cannot publish itself into the recruiter-visible book — previously
-- WITH CHECK was `true`, which allowed exactly that.
CREATE POLICY "resumes public insert"
  ON public.resumes FOR INSERT
  TO anon, authenticated
  WITH CHECK (approved = false);

-- Sponsors see approved rows only. Admins see everything, including the
-- pending queue they need in order to approve anything.
CREATE POLICY "resumes read"
  ON public.resumes FOR SELECT
  TO authenticated
  USING (approved = true OR public.is_admin());

CREATE POLICY "resumes admin write"
  ON public.resumes FOR UPDATE
  TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "resumes admin delete"
  ON public.resumes FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- NOTE: the upload form's "replace my resume" path performs an UPDATE as anon,
-- which the policies above no longer permit. That flow needs a SECURITY DEFINER
-- function keyed on the submitter's email before it will work again. Until then
-- a student replacing a resume gets the generic error and should contact the
-- E-Board. Tracked in HANDOFF.md.


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. company_access — no longer used for auth, but still readable today
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read company access"   ON public.company_access;
DROP POLICY IF EXISTS "Admins can manage company access" ON public.company_access;

CREATE POLICY "company_access admin all"
  ON public.company_access FOR ALL
  TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- The table is now vestigial. Keep it until every sponsor has a login, then
-- drop it — a table of dead credentials is only a liability.


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. storage — the PDFs themselves
-- ─────────────────────────────────────────────────────────────────────────────
--  Locking the `resumes` TABLE is not enough on its own. Signed URLs are
--  governed by policies on storage.objects, and it was the bucket-wide public
--  SELECT below that let an anonymous visitor download a real resume.
DROP POLICY IF EXISTS "Public can read resumes"            ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage resumes bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Public can upload to resumes bucket" ON storage.objects;

-- Students still upload without an account, but only into submissions/.
CREATE POLICY "resumes bucket public upload"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = 'submissions'
  );

-- A sponsor can only read the file if its row is approved. Without the EXISTS
-- check, any signed-in sponsor could fetch pending resumes by guessing paths.
CREATE POLICY "resumes bucket read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.resumes r
        WHERE r.resume_path = storage.objects.name
          AND r.approved = true
      )
    )
  );

CREATE POLICY "resumes bucket admin write"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'resumes' AND public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. attendance — already closed; restated so this file describes full intent
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read attendance" ON public.attendance;

CREATE POLICY "attendance admin read"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "attendance admin write"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- `Allow public inserts` (check-in) stays as-is. The public leaderboard is
-- served by the `leaderboard` view — see supabase/leaderboard-view.sql.


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Creating a sponsor account
-- ─────────────────────────────────────────────────────────────────────────────
--  Supabase Dashboard → Authentication → Users → Add user
--    - email:    recruiter's work address
--    - password: generate one, send it to them
--    - Auto-confirm: ON  (they will not receive a confirmation email otherwise)
--
--  Do NOT set a role on sponsor accounts. Absence of the admin tag is what
--  makes them a sponsor. Revoking access is deleting the user.


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Verify
-- ─────────────────────────────────────────────────────────────────────────────
--  Every one of these must hold before you consider this done.
--
--  Logged OUT (anon key), all of these should return zero rows or an error:
--    select * from resumes
--    select * from company_access
--    createSignedUrl on any resume path
--
--  Signed in AS A SPONSOR:
--    select * from resumes           -> approved rows only, no pending
--    select * from company_access    -> zero rows
--    select * from attendance        -> zero rows
--    createSignedUrl on an approved path   -> works
--    createSignedUrl on a pending path     -> denied
--
--  Signed in AS AN ADMIN:
--    everything above works, including the pending queue
--
--  Re-run the policy inventory and confirm no {public} SELECT remains on
--  resumes, company_access, or storage.objects for the resumes bucket:
--    SELECT schemaname, tablename, policyname, roles, cmd
--    FROM pg_policies WHERE schemaname IN ('public','storage')
--    ORDER BY tablename, cmd;

-- ============================================================================
--  SHPE OSU — Row-Level Security repair
-- ============================================================================
--  STATUS: NOT YET APPLIED. Review, then run in Supabase Dashboard → SQL Editor.
--
--  WHY THIS EXISTS
--  ---------------
--  Verified against the live project with nothing but the public anon key (the
--  same key that ships inside our JS bundle), while logged out:
--
--    * SELECT on `resumes`        -> returned every row: full_name, email,
--                                    major, graduation_year, resume_path
--    * storage.createSignedUrl()  -> GRANTED for those resume_paths, and the
--                                    resulting URL returned HTTP 200 with a
--                                    real 130 KB application/pdf
--    * SELECT on `company_access` -> returned every row INCLUDING access_code
--
--  In other words the entire resume book — real students' names, OSU emails,
--  phone numbers and addresses inside the PDFs — was downloadable by anyone,
--  and the recruiter access codes that were supposed to gate it were readable
--  by the same anonymous request.
--
--  The root cause is a category error in the old design: HANDOFF.md described
--  the `resumes` SELECT policy as "allowed if recruiter has a valid session
--  (validated client-side)". RLS runs per-row inside Postgres and cannot see
--  client-side JavaScript. A policy of `USING (true)` is simply public.
--
--  THE MODEL THIS REPLACES IT WITH
--  -------------------------------
--  Nothing sensitive is directly selectable by `anon`. Recruiters reach data
--  only through SECURITY DEFINER functions that validate their code inside the
--  database, where the check cannot be bypassed by editing sessionStorage.
--
--  ORDER OF OPERATIONS (important — read before running)
--  -----------------------------------------------------
--  Section 3 revokes the public read on `resumes`, which will break
--  /company/dashboard until the client is switched over to the RPCs in
--  section 4. Either deploy the client change in the same window, or run
--  sections 1–2 first and schedule 3–5 with the frontend release.
--
--  Section 6 (storage) CANNOT be solved in SQL alone. Read its note.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Inspect what is actually in place first.
--    Run this on its own and keep the output before changing anything.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname IN ('public', 'storage')
-- ORDER BY tablename, cmd;
--
-- This also answers the one question the client-side audit could NOT determine:
-- whether `anon` holds UPDATE/DELETE policies on attendance / resumes /
-- company_access. A PostgREST delete that matches zero rows returns success
-- whether or not a policy permits it, so it cannot be probed from outside.
-- Look for any row where `roles` includes `anon`/`public` and `cmd` is
-- UPDATE, DELETE, or ALL — each one is a hole.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Make sure RLS is actually on. (A table with RLS disabled ignores policies.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. company_access — codes must never be readable by the public.
--    Reading the code table is equivalent to holding every code.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read code"   ON public.company_access;
DROP POLICY IF EXISTS "Admins full access" ON public.company_access;

CREATE POLICY "company_access admin all"
  ON public.company_access FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);
-- Deliberately NO anon policy. Recruiters never read this table; the
-- verify_company_code() function below reads it on their behalf.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. resumes — student PII. Public INSERT stays (that's the upload form);
--    public SELECT goes away entirely.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Recruiter code select"       ON public.resumes;
DROP POLICY IF EXISTS "Allow public inserts"        ON public.resumes;
DROP POLICY IF EXISTS "Authenticated select/update" ON public.resumes;

CREATE POLICY "resumes public insert"
  ON public.resumes FOR INSERT
  TO anon, authenticated
  WITH CHECK (approved = false);
-- WITH CHECK pins approved=false so a crafted request cannot self-approve
-- straight into the recruiter-visible book.

CREATE POLICY "resumes admin all"
  ON public.resumes FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- NOTE: the upload form's "replace my resume" path performs an UPDATE as anon.
-- It is intentionally not granted here, because an anon UPDATE policy on this
-- table is very hard to scope safely (any anon could rewrite any row). Route
-- replacement through a SECURITY DEFINER function keyed on the submitter's
-- email, or require the student to contact an E-Board member. Decide before
-- deploying, and see HANDOFF.md.


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recruiter access via SECURITY DEFINER functions.
--    These run as the function owner, so they can read locked-down tables while
--    the caller cannot. The code check happens in SQL and cannot be skipped.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_company_code(p_code text)
RETURNS TABLE (company_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public          -- never omit: blocks search_path hijacking
AS $$
  SELECT ca.company_name
  FROM public.company_access ca
  WHERE ca.access_code = upper(trim(p_code))
    AND (ca.expires_at IS NULL OR ca.expires_at > now())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_resume_book(p_code text)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  major text,
  graduation_year text,
  resume_path text,
  uploaded_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.full_name, r.email, r.major,
         r.graduation_year, r.resume_path, r.uploaded_at
  FROM public.resumes r
  WHERE r.approved = true
    AND EXISTS (
      SELECT 1 FROM public.company_access ca
      WHERE ca.access_code = upper(trim(p_code))
        AND (ca.expires_at IS NULL OR ca.expires_at > now())
    )
  ORDER BY r.uploaded_at DESC;
$$;

REVOKE ALL ON FUNCTION public.verify_company_code(text) FROM public;
REVOKE ALL ON FUNCTION public.get_resume_book(text)     FROM public;
GRANT EXECUTE ON FUNCTION public.verify_company_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_resume_book(text)     TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. attendance — public read is an intentional product decision (the homepage
--    leaderboard and the Events page both render it while logged out).
--
--    Be aware of the tradeoff: RLS is row-level, not column-level, so "the
--    leaderboard only selects first_name" gives no protection — anyone can ask
--    for `select *` and receive dot numbers, pronouns, majors and the free-text
--    feedback students wrote expecting it to be private.
--
--    Recommended: keep the decision, but serve it from a view that exposes only
--    the two columns the leaderboard needs, and close the base table.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public inserts"          ON public.attendance;
DROP POLICY IF EXISTS "Admins can read attendance"    ON public.attendance;
DROP POLICY IF EXISTS "Admins can update attendance"  ON public.attendance;

CREATE POLICY "attendance public insert"
  ON public.attendance FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "attendance admin all"
  ON public.attendance FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Leaderboard source: distinct events per member, no PII beyond a first name.
-- security_invoker = off so it can read the closed base table.
CREATE OR REPLACE VIEW public.leaderboard
WITH (security_invoker = off) AS
  SELECT
    min(a.first_name)                             AS first_name,
    lower(trim(a.last_name_dotnum))               AS dotnum,
    count(DISTINCT lower(trim(a.event_name)))     AS count
  FROM public.attendance a
  WHERE a.last_name_dotnum IS NOT NULL
    AND trim(a.last_name_dotnum) <> ''
  GROUP BY lower(trim(a.last_name_dotnum));

GRANT SELECT ON public.leaderboard TO anon, authenticated;

-- Counting DISTINCT events (not raw rows) matches the client-side fix: a member
-- who double-tapped submit at one GBM should not outrank someone who attended
-- more events.
--
-- If you adopt the view, ALSO drop any public SELECT policy on the base table
-- and point PublicLeaderboard.jsx at `leaderboard` instead of `attendance`:
--   DROP POLICY IF EXISTS "<name of your public select policy>" ON public.attendance;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. STORAGE — the actual PDFs. THIS IS THE PART SQL CANNOT FINISH.
-- ─────────────────────────────────────────────────────────────────────────────
--  Locking the `resumes` TABLE is not sufficient. The verified exploit above
--  minted a signed URL directly from the storage API, which is governed by
--  policies on `storage.objects`, not by anything above.
--
--  Step 1 — close anonymous access to the bucket:
--
--    DROP POLICY IF EXISTS "<existing anon policy>" ON storage.objects;
--
--    CREATE POLICY "resumes admin read"
--      ON storage.objects FOR SELECT TO authenticated
--      USING (bucket_id = 'resumes');
--
--    CREATE POLICY "resumes public upload"
--      ON storage.objects FOR INSERT TO anon, authenticated
--      WITH CHECK (bucket_id = 'resumes'
--                  AND (storage.foldername(name))[1] = 'submissions');
--
--  Step 2 — recruiters can then no longer mint signed URLs themselves, which
--  is the point. Give them PDFs through an Edge Function that validates the
--  access code and signs the URL with the service_role key server-side:
--
--    supabase/functions/resume-url/index.ts
--      - read { code, path } from the request body
--      - select from company_access to validate code + expiry
--      - confirm `path` belongs to an approved row in `resumes`
--      - createSignedUrl(path, 60) using SUPABASE_SERVICE_ROLE_KEY
--      - return only the URL
--
--    The service_role key lives in the function's environment and never
--    reaches the browser. Do not put it in a VITE_ variable — anything
--    VITE_-prefixed is inlined into the public bundle.
--
--  Simpler alternative worth considering: drop access codes entirely and issue
--  each sponsor a real Supabase Auth user. Then `TO authenticated` covers the
--  whole problem, you get per-recruiter audit trails and revocation for free,
--  and none of the code-validation machinery above is needed.


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Verify. Re-run section 0, then confirm from a logged-out client that:
--      select * from resumes         -> 0 rows / permission denied
--      select * from company_access  -> 0 rows / permission denied
--      createSignedUrl(<any path>)   -> denied
--      rpc('get_resume_book', {p_code: '<bad code>'})  -> 0 rows
--      rpc('get_resume_book', {p_code: '<good code>'}) -> approved rows only
-- ─────────────────────────────────────────────────────────────────────────────

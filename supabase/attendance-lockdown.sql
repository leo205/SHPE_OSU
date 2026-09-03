-- ============================================================================
--  Protected attendance submission — final direct-write lockdown
-- ============================================================================
--  STATUS: NOT YET APPLIED.
--
--  RUN ONLY AFTER all of the following are true:
--    1. supabase/attendance-submit.sql is applied;
--    2. submit-attendance Edge Function is deployed with its secrets;
--    3. the production browser is verified calling that Edge Function only.
--
--  Running this early breaks the live check-in form. Leaving it unapplied after
--  the new client deploys leaves the old spam endpoint open.
-- ============================================================================

BEGIN;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- The old anonymous INSERT policy name has drifted between saved dashboard
-- queries, so inventory and remove every policy instead of guessing its name.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'attendance'
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY IF EXISTS %I ON public.attendance',
      policy_row.policyname
    );
  END LOOP;
END;
$$;

CREATE POLICY "attendance admin all"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.attendance FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO authenticated;

COMMIT;

-- Required post-deploy checks:
--
-- 1. Anonymous direct POST to /rest/v1/attendance must now be permission-denied
--    (42501), not reach a NOT NULL constraint (23502).
-- 2. Anonymous SELECT from attendance must be permission-denied (42501). The
--    public leaderboard remains readable through its two-column owner view.
-- 3. The protected Edge Function must still accept a real check-in.
-- 4. Admin SELECT and UPDATE must still work.
-- 5. This inventory should show only "attendance admin all" for attendance:
--
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_catalog.pg_policies
-- WHERE schemaname IN ('public', 'storage')
-- ORDER BY tablename, cmd;

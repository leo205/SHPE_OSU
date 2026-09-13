-- ============================================================================
--  Fix the public `leaderboard` view
-- ============================================================================
--  STATUS: APPLIED to production 2026-07-30, after the matching client deploy.
--  Verified from an anonymous client afterwards: `dotnum` and `last_name_dotnum`
--  both return 42703 (column does not exist), and the anon SELECT grant survived
--  the DROP. Re-running this file is harmless (DROP IF EXISTS + CREATE), but it
--  is not needed unless the view is changed again.
--
--  Kept in the repo as the canonical definition of the view — do not edit the
--  view through the Supabase UI without updating this file, or the next person
--  will have no way to know what it is supposed to contain.
--
--  ORIGINAL DEPLOY NOTE (historical): run AFTER deploying the matching client
--  change. Ordering is safe in that direction and unsafe in the other:
--
--    client first  -> new client selects (first_name, count), which both the
--                     old and new view provide. Nothing breaks.
--    SQL first     -> old client still selects last_name_dotnum/dotnum, which
--                     the new view no longer has. Events page errors.
--
--  WHAT WAS WRONG
--  --------------
--  The previous definition was:
--
--    SELECT max(first_name)      AS first_name,
--           max(last_name_dotnum) AS last_name_dotnum,
--           lower(last_name_dotnum) AS dotnum,
--           count(*)             AS count
--    FROM attendance
--    WHERE last_name_dotnum IS NOT NULL AND first_name IS NOT NULL
--    GROUP BY lower(last_name_dotnum);
--
--  Two problems:
--
--  1. It published OSU dot numbers. A Postgres view runs with its owner's
--     privileges by default (security_invoker = false), so this view read
--     straight through the RLS that otherwise keeps `attendance` private —
--     and `Events.jsx` rendered `last_name_dotnum` directly onto a public
--     page. The table was locked; the view was the way around it.
--
--  2. count(*) counted rows, not events. Two check-ins at the same GBM — a
--     double-tapped submit, or reopening the form — scored 2. A member could
--     outrank someone who genuinely attended more events.
--
--  The replacement exposes only what the leaderboard renders: a first name and
--  a distinct-event count. Keeping the owner's privileges is intentional; it is
--  what lets an anonymous visitor see the leaderboard without opening the
--  attendance table itself.
-- ============================================================================

-- CREATE OR REPLACE cannot drop columns from an existing view, so this must be
-- DROP + CREATE. The window is brief and only affects the leaderboard.
DROP VIEW IF EXISTS public.leaderboard;

-- security_invoker = false is stated explicitly rather than relying on the
-- Postgres default. It is what lets this view read the closed `attendance`
-- table on an anonymous visitor's behalf, so it is a security-critical property
-- and should not rest on a version default.
CREATE VIEW public.leaderboard
WITH (security_invoker = false) AS
  SELECT
    max(first_name)                                AS first_name,
    count(DISTINCT lower(btrim(event_name)))       AS count
  FROM public.attendance
  WHERE first_name IS NOT NULL
    AND last_name_dotnum IS NOT NULL
    AND btrim(last_name_dotnum) <> ''
  GROUP BY lower(btrim(last_name_dotnum));

-- DROP discards the old grants, so they must be reissued or the public
-- leaderboard silently returns nothing for logged-out visitors.
GRANT SELECT ON public.leaderboard TO anon, authenticated;

-- Records the bypass in-band, so a future maintainer adding a column here gets
-- a warning at the point of editing rather than shipping a silent leak.
COMMENT ON VIEW public.leaderboard IS
  'PUBLIC + owner-privileged: readable by anon and bypasses RLS on attendance. '
  'Adding a column here publishes it with no policy change to review. '
  'Previously exposed last_name_dotnum. Keep to first_name + count.';

-- NOTE: DROP+CREATE resets the view owner to whoever runs this. The RLS bypass
-- only works if that role is exempt from RLS on `attendance` (owns the table, or
-- is superuser/BYPASSRLS). Run it as `postgres` in the Supabase SQL editor. Run
-- it from a migration under a different role and the view silently returns zero
-- rows to everyone.

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Should list exactly two columns: first_name, count
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'leaderboard';
--
-- Should show anon with SELECT
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'leaderboard';

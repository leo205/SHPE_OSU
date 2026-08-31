# Supabase — database security model

_Documentation reviewed: 2026-08-30. The last anonymous-client verification of
the live project remains 2026-08-16._

Everything protecting student and sponsor data lives here, not in the React app.

The one idea to internalise before changing anything: **the client cannot enforce
access.** The anon key ships inside the public JS bundle on shpeosu.com, so
anyone can call PostgREST directly and skip the UI entirely. A check written in
`CompanyDashboard.jsx` decides what gets *rendered*, never what is *reachable*.
Every real vulnerability found in this project has been a variation of forgetting
that.

## Files, in run order

| File | Status | What it does |
|---|---|---|
| `leaderboard-view.sql` | **Applied** 2026-07-30 | Redefines the public `leaderboard` view as `first_name` + distinct-event `count`. It previously exposed OSU dot numbers. |
| `sponsor-auth.sql` | **Applied** 2026-08-03 | Replaced recruiter access codes with Supabase Auth logins; closed public read on `resumes`, `company_access`, and the storage bucket; re-scoped `events` so sponsors cannot edit the calendar. |
| `resume-submit.sql` | **Applied** 2026-08-03 | Moved resume submission into `submit_resume()` so replacement actually works and the OSU email check is enforced server-side. Must run **after** `sponsor-auth.sql`. |

All three are applied. They are kept as the canonical definition of the current
state — if you change a policy through the Supabase UI, update the matching file
or the next person has no way to know what the database is supposed to contain.

Verified from an anonymous client after applying, and re-verified 2026-08-16:
`resumes`, `company_access` and the storage bucket all return nothing;
`createSignedUrl` is denied; direct `INSERT` into `resumes` is refused (42501),
so submissions are RPC-only; `submit_resume()` rejects both a non-OSU email and
a path-traversal attempt; and the `leaderboard` view exposes exactly
`first_name` and `count`.

**Public signup has since been disabled** (`/auth/v1/settings` reports
`disable_signup: true`). That is defence in depth, not the control — the explicit
role gate is what actually protects the resume book, and it must stay even if
someone re-enables signup later.

## ⚠️ Saved queries in the Supabase SQL Editor

The SQL Editor sidebar keeps a history of past queries. Two of them will
**silently undo** the fixes above if anyone runs them again:

- **"Attendance Submission Table"** — the original schema. Contains
  `Public can read approved resumes`, `Public can read company access`, and
  `Public can read resumes` on storage. These three policies are the entire
  reason the resume book was downloadable by anyone.
- **"Leaderboard Attendance Aggregates"** — the old three-column view that
  published dot numbers.

Rename them to `⚠️ OLD — DO NOT RUN` or delete them. A future Digital Ops chair
will otherwise find a tidy query called "Attendance Submission Table", run it to
"set things up", and reopen everything with no error to warn them.

## Roles

Admins and sponsors are both Supabase Auth users, so `TO authenticated` does not
distinguish them. Access requires an explicit role claim read by
`public.is_admin()` or `public.is_sponsor()`.

That claim **must** live in `app_metadata`, never `user_metadata`. A signed-in
user can rewrite their own `user_metadata` via `supabase.auth.updateUser()`, so a
role stored there would be self-grantable — any sponsor could promote themselves
to admin from the browser console. `app_metadata` is writable only by the service
role and the dashboard.

No sponsor accounts exist yet. Creating one requires both steps:

1. Authentication → Users → Add user, with **Auto-confirm ON**.
2. Grant the explicit sponsor role in the SQL Editor:

   ```sql
   UPDATE auth.users
   SET raw_app_meta_data =
         coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"sponsor"}'::jsonb
   WHERE email = 'recruiter@company.com';
   ```

An authenticated account without `app_metadata.role = "sponsor"` reaches no
resume rows or files. Revoking access means deleting the user or clearing the
role. This explicit sponsor gate must stay in sync with `sponsor-auth.sql`.

The claim is baked into the JWT at sign-in, so anyone whose role changes must
sign out and back in before it takes effect.

## Views bypass RLS

A Postgres view runs with its **owner's** privileges unless `security_invoker` is
set. `public.leaderboard` relies on this deliberately: it lets an anonymous
visitor see the leaderboard without opening the `attendance` table, which holds
dot numbers, pronouns, majors, and free-text feedback students wrote expecting
privacy.

The consequence is that the view is a standing RLS bypass. **Any column added to
it becomes public with no policy change and nothing to review.** Treat edits to
that view as security changes.

## Checking the live state

This is the only reliable way to know what is actually enforced — documentation
in this repo has been wrong before:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY tablename, cmd;
```

Treat any `{public}` or `{anon}` row whose `cmd` is `UPDATE`, `DELETE`, or `ALL`
as a hole. `INSERT` and `SELECT` rows are intentional in places — check them
against the tables above.

Note what this query can and cannot settle. Read policies can be verified from
outside with the anon key. `UPDATE`/`DELETE` **cannot** — PostgREST returns
success for a statement matching zero rows whether or not a policy permits it, so
a "successful" delete against a fake ID proves nothing. This query is the only
honest answer for those.

## History

`policies.sql` used to live here. It described an alternative design in which
recruiters kept access codes validated by `SECURITY DEFINER` functions, plus an
Edge Function holding the service-role key to sign resume URLs. That approach was
dropped in favour of real logins: fewer moving parts, no production secret to
manage, and revocation and audit trails come free.

It was removed rather than left in place because it had begun to contradict the
files that superseded it — including a leaderboard view definition that would
have re-introduced the dot-number leak, written as `CREATE OR REPLACE`, which
cannot change a view's column list and would have aborted the script partway
while appearing to have run.

Two files describing conflicting fixes to one problem is how that class of bug
gets shipped. Keep one answer per question.

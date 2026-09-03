# Supabase — database and public-submission security

_State reviewed on branch `security/harden-public-submissions`: 2026-09-03._

Everything that authorizes access to attendance, resumes, sponsor data, or
uploaded PDFs must be enforced by Supabase or another trusted server. The anon
key is present in the public JavaScript bundle, so a React check controls what is
rendered, never what an attacker can call directly.

## Production truth versus this branch

This branch contains a staged replacement for every anonymous public-write
path. **None of the new migrations or Edge Functions in the table below has
been applied or deployed from this branch.** Production has not changed merely
because these files exist.

Historical production facts and current branch state are deliberately separate:

| File or component | Production/live status | Current branch meaning |
|---|---|---|
| `leaderboard-view.sql` | The two-column privacy revision was **applied 2026-07-30** and verified as exactly `first_name` plus distinct-event `count`; dot numbers were removed. | The new database-level top-ten cap is **NOT APPLIED**. It preserves the same two public columns but prevents direct callers from requesting the rest of the aggregate rows. |
| `sponsor-auth.sql` | An earlier revision was **applied 2026-08-03** to replace recruiter access codes with Auth roles, close anonymous reads of `resumes`, `company_access`, and resume Storage, and prevent sponsors from editing events. Public signup was later disabled. | The branch copy also avoids recreating legacy anonymous resume-upload paths. Those later edits have **not** been rerun in production. |
| `resume-submit.sql` | The original `submit_resume()` design was **applied 2026-08-03** and its validation was checked anonymously. | The branch copy is marked **SUPERSEDED** and revokes the old routine. Those retirement statements are **not applied** until the staged rollout below. Do not grant or call this routine from new browser code. |
| `attendance-submit.sql` | **NOT APPLIED.** | Additive stage: creates the shared durable limiter and service-only `submit_attendance()` RPC while leaving the legacy browser path available during cutover. |
| `attendance-lockdown.sql` | **NOT APPLIED.** | Final stage: removes all anonymous attendance-table policies and leaves authenticated admin access only. Running it before the protected client is live breaks check-in. |
| `resume-edge-submit.sql` | **NOT APPLIED.** | Additive stage: creates private-upload constraints, retry reservations, service-only queue RPCs, and authenticated admin approval/deletion RPCs. It depends on `attendance-submit.sql`. |
| `resume-lockdown.sql` | **NOT APPLIED.** | Final stage: removes anonymous resume metadata inserts, anonymous Storage uploads, and browser execution of legacy `submit_resume()`. Running it before the protected client is live breaks resume submission. |
| `submit-attendance`, `submit-resume`, `submit-sponsor-inquiry` | **NOT DEPLOYED from this branch.** | Staged Edge Functions. `supabase/config.toml` sets `verify_jwt = false` because students and prospective sponsors are not signed in; each handler enforces its own Turnstile, validation, origin, size, and durable-rate controls before privileged work. |

The last documented anonymous-client verification of that historical live
baseline was 2026-08-16: `resumes`, `company_access`, and resume Storage returned
nothing; signed-URL creation and direct resume-row insertion were denied;
`submit_resume()` rejected a non-OSU email and a path-traversal value; and the
leaderboard returned only `first_name` and `count`. This is evidence about that
date, not proof of the current live state.

Until the rollout is completed and proved against the live project, assume the
legacy anonymous attendance write and legacy resume submission/upload routes
remain reachable. Confirm with the live policy and routine-grant inventories;
do not infer production state from this repository.

After any rollout, update this table with the exact date and the evidence from
the post-deploy probes. Do not change `NOT APPLIED` to `Applied` merely because a
pull request was merged or a frontend was deployed.

## Target public-submission design

The three browser forms invoke public Edge endpoints. The Edge Functions hold
the server secret, verify the request, and use only narrowly scoped server-side
operations. There is intentionally no direct-write fallback to a public table,
Storage bucket, or EmailJS endpoint.

### Shared controls

All three functions share the code under `functions/_shared/`:

- Requests are bounded before parsing and validated again on the server.
- CORS permits exact origins only. The built-in set is
  `https://shpeosu.com`, `https://www.shpeosu.com`,
  `http://localhost:5173`, `http://127.0.0.1:5173`,
  `http://localhost:4173`, and `http://127.0.0.1:4173`.
  `PUBLIC_SITE_ORIGINS`, when present, **replaces** that set. Add a preview or
  staging origin explicitly and remove it after testing; do not use wildcards.
  Requests without an `Origin` still pass because CORS is browser containment,
  not authentication.
- Cloudflare Turnstile is verified server-side with the expected action,
  allowed hostname, token age, and client IP. The actions are
  `attendance_submit`, `resume_submit`, and `sponsor_inquiry`. Set
  `TURNSTILE_ALLOWED_HOSTNAMES` to exact hostnames without schemes.
  Official Cloudflare test secrets are accepted only with a recognized local
  `SUPABASE_URL`; a hosted function fails configuration if one is copied there.
- `attendance-submit.sql` creates
  `public.public_submission_rate_limits` and the atomic
  `consume_public_submission_rate_limit()` routine. Only 64-character HMAC
  keys are stored; raw IP addresses, dot numbers, and email addresses do not go
  into the limiter table. Both the table and function are revoked from
  `PUBLIC`, `anon`, and `authenticated`; only `service_role` may execute the
  routine.
- `RATE_LIMIT_HMAC_SECRET` must be a random server-only value of at least 32
  bytes. Never expose it through `VITE_*`. Rotating it changes every derived
  identity and effectively resets active buckets.
- Privileged REST calls use `SUPABASE_SECRET_KEYS` (the JSON `default` secret)
  when configured, with `SUPABASE_SERVICE_ROLE_KEY` retained as the legacy-key
  fallback. Neither value belongs in the browser or a committed `.env` file.
- Failures return bounded public error codes and `Cache-Control: no-store`.
  Logs must not include names, email addresses, dot numbers, resume bytes,
  Turnstile tokens, IP addresses, or sponsor messages.

The fixed-window limits are defense in depth, not identity proof. Campus users
may share one NAT, so attendance keeps a broad network ceiling and a separate
normalized-member bucket. Sponsor inquiry additionally has per-network,
per-email, per-second provider, daily, and 31-day global ceilings. Resume uses
separate edge, network, email, and global buckets. Tune limits only after
observing legitimate traffic and confirming the provider plan.

Attendance therefore still cannot prove that a visitor owns the claimed dot
number or was physically present. The canonical-event check stops arbitrary
event labels, duplicate suppression stops repeat credit for the same claimed
identity/event, and Turnstile/limits slow abuse; none is authentication. Do not
describe leaderboard integrity as solved without an approved OSU SSO,
event-scoped presence secret, or admin-review design.

### `submit-attendance`

The browser sends JSON plus a Turnstile token. The handler validates it, derives
HMAC rate keys, and calls service-only `submit_attendance()`. The RPC validates
the canonical event label against the database event, enforces all field
contracts, and serializes duplicate checks for one normalized dot-number/event
pair. A duplicate receives the same accepted result so the endpoint does not
become an attendance-presence oracle.

After `attendance-lockdown.sql`, anonymous callers must not be able to select or
insert directly into `public.attendance`. Authenticated users still require
`public.is_admin()`. The public leaderboard remains a deliberately narrow view;
it must not expose the underlying attendance row or accept writes.

### `submit-resume`

The browser sends bounded multipart form data and a PDF. The handler verifies
Turnstile and durable limits, validates the PDF and metadata, fingerprints the
exact normalized draft plus file bytes, and reserves an idempotency UUID before
Storage is touched.

`resume-edge-submit.sql` keeps the `resumes` bucket private, caps objects at
256,000 bytes, permits PDF MIME only, and creates:

- service-only `reserve_resume_submission()` and
  `queue_resume_submission()`;
- a private `resume_submission_reservations` table;
- server-generated paths shaped exactly like
  `submissions/<13-digit timestamp>_<uuid>.pdf`;
- unique submission/path constraints and at most one approved row per
  normalized email;
- authenticated `approve_resume_submission()` and
  `delete_resume_submission()` RPCs, each guarded internally by
  `public.is_admin()`.

An exact retry converges on its reservation; a changed payload under the same
submission UUID is rejected. A new upload is a separate pending revision and
does not de-list an already approved resume. Approval serializes the versions
for one email and changes recruiter-visible metadata transactionally. Deletion
returns the authoritative object path so the admin client removes that exact
private object. Turnstile limits automation, but it does **not** prove ownership
of a claimed OSU email; OSU SSO or email verification would be a separate future
identity control.

After `resume-lockdown.sql`, anonymous direct Storage upload, anonymous metadata
insert, and execution of legacy `submit_resume()` must all be denied. Sponsors
and admins remain Supabase Auth users with explicit `app_metadata.role` values.
Never authorize the resume book with `TO authenticated` alone or with
user-editable `user_metadata`.

### `submit-sponsor-inquiry`

The browser no longer sends mail through `@emailjs/browser`. It sends validated
JSON plus Turnstile to the Edge Function. After durable limits, the server makes
exactly one bounded EmailJS REST request; it never retries an ambiguous email
side effect. The following are Edge-only secrets and settings:

```text
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID
EMAILJS_PUBLIC_KEY
EMAILJS_PRIVATE_KEY
SPONSOR_INQUIRY_DAILY_LIMIT
SPONSOR_INQUIRY_MONTHLY_LIMIT
```

There is an external cutover blocker that code cannot solve: in the EmailJS
dashboard, enable the setting that requires the private key for API requests,
keep the template's recipient as a fixed trusted address rather than a
browser-supplied variable, and render `inquiry_id` in the admin-visible message
for correlation after an ambiguous delivery. Then prove that the old
public-key-only REST request fails while the Edge request succeeds. Supplying
`accessToken` from Edge does not by itself disable an already-public browser
route. **Do not call sponsor inquiry hardened or remove the old path from
production until that dashboard control has been enabled and tested.**

If EmailJS delivery times out, it may already have sent. Keep the result
`delivery_unconfirmed`, do not automatically retry, and direct the user to the
published chapter email rather than restoring browser-side EmailJS credentials.

## Emergency attendance fallback quarantine

The Google Form is an outage-only path shown after two actual availability
failures. Its URL builder strips every existing `entry.*` answer and may prefill
only the canonical `M/D - title` event label. The event question's real Google
Forms entry ID is currently unknown, so the mapping is intentionally blank and
students select the event on Google. Never place names, dot numbers, year,
demographics, or feedback in a query string.

Responses land in a separate Google Sheet. That Sheet is **quarantined input**:

- there is no automatic import, synchronization, or leaderboard feed;
- never connect it directly to `attendance` or the public leaderboard;
- an admin must verify that the event label exists, the person attended, and
  the row is not a duplicate before entering a record through a reviewed path;
- preserve the exact `M/D - title` label contract if a manual reconciliation is
  later approved.

This fallback helps when Supabase is unavailable but the internet still works.
For a venue-wide network outage, use a paper sheet and apply the same manual
verification before reconciliation.

## Staged deployment and rollback order

Use a staging Supabase project and a preview deployment first. Take a schema,
policy, grant, bucket, and relevant-row inventory before changing anything.
Apply one numbered stage at a time and record its evidence.

1. Run the local gates: `npm test`, `npm run check:edge`,
   `npm run lint`, `npm run build`, and `git diff --check`.
2. In staging, inventory duplicate approved resume emails, duplicate resume
   paths, historical attendance duplicates, current policies, routine grants,
   bucket privacy, and file sizes. Resolve data conflicts manually; neither
   migration auto-deletes historical duplicates.
3. Apply `leaderboard-view.sql` and verify anonymous reads return no more than
   ten rows, in descending distinct-event order, with exactly `first_name` and
   `count`. Then apply `attendance-submit.sql`. Probe that `anon` and
   `authenticated` cannot
   execute either service-only RPC, while the service secret can consume a
   limit and submit a valid attendance row.
4. Apply `resume-edge-submit.sql`. Probe reservation, exact retry, changed-draft
   conflict, private upload, pending revision behavior, non-admin denial, and
   admin approve/delete. Confirm existing approved resumes remain readable only
   to authorized roles.
5. Configure staging Edge secrets from `functions/.env.example`. Use exact
   preview origins and Turnstile hostnames. Complete and prove the EmailJS
   private-key requirement before sponsor cutover.
6. Deploy all three Edge Functions with the staged `config.toml`. Probe rejected
   origin, malformed/oversized body, bad and replayed Turnstile token, exhausted
   rate bucket, provider failure, and one valid request for each function.
   Confirm no sensitive values enter logs.
7. Deploy the matching browser build to preview and click-test attendance,
   resume upload, admin approval/deletion, sponsor inquiry, and the emergency
   fallback. Confirm browser code performs no direct public write or EmailJS
   request.
8. Repeat additive SQL, secrets, and Edge deployment in production. Deploy the
   browser only after the live Edge probes pass. Submit one real browser request
   through each flow and verify the database/Storage/email result.
9. Immediately apply `attendance-lockdown.sql`, then probe direct anonymous
   attendance `SELECT` and `INSERT` denial, protected Edge acceptance, admin
   access, and the two-column public leaderboard.
10. Apply `resume-lockdown.sql`, then probe direct anonymous Storage upload,
    metadata insert, and legacy `submit_resume()` denial. Re-probe protected
    upload, private-file access, pending review, approval, and deletion.
11. Remove temporary preview origins, review EmailJS and rate-limit usage, and
    update the status table above with dates and probe results.

Before either lockdown, rollback is straightforward: restore the previous
browser/function deployment and leave the additive SQL in place while the cause
is fixed. Do not run the lockdown for a flow that has not passed its browser
smoke test.

After a lockdown, never roll back only the browser: the old browser depends on
the anonymous permission that was intentionally removed. Prefer a roll-forward
fix or temporarily disable that form. If a database rollback is unavoidable,
restore only the exact policies and grants captured in the pre-deploy inventory,
then re-run anonymous probes; do not improvise a broad `TO anon USING (true)`
policy. If sponsor delivery fails, keep browser EmailJS disabled and use the
published manual email route.

Each SQL file uses a transaction, so a statement failure rolls back that file's
database changes. That does not roll back separately deployed functions,
frontend assets, EmailJS dashboard settings, or already delivered email.

## Live-state checks

Repository documentation has been wrong before. Query the project directly:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY tablename, cmd, policyname;

SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'consume_public_submission_rate_limit',
    'submit_attendance',
    'reserve_resume_submission',
    'queue_resume_submission',
    'approve_resume_submission',
    'delete_resume_submission',
    'submit_resume'
  )
ORDER BY routine_name, grantee;

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'resumes';
```

Treat unexpected `{public}` or `{anon}` write policies or grants as blockers.
PostgREST can report success when an `UPDATE` or `DELETE` matched zero rows, so a
fake-ID request does not prove a policy is safe. Inspect the catalog and test
with a controlled real row in staging.

## Saved SQL Editor queries

Two historical saved queries can silently undo the controls if rerun:

- **Attendance Submission Table** contains old public policies for resumes,
  `company_access`, and resume Storage.
- **Leaderboard Attendance Aggregates** contains the old leaderboard projection
  that published dot numbers.

Rename them to `OLD — DO NOT RUN` or delete them. A tidy old query is not a
canonical migration.

## Roles and historical design

Admins and sponsors are both Supabase Auth users. Access requires an explicit
claim read by `public.is_admin()` or `public.is_sponsor()`. The claim must live in
`app_metadata`, which a user cannot rewrite, never `user_metadata`, which they
can. No sponsor accounts existed at the last documented review. To provision
one, create and auto-confirm the Auth user, then set the server-controlled claim:

```sql
UPDATE auth.users
SET raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || '{"role":"sponsor"}'::jsonb
WHERE email = 'recruiter@company.com';
```

The role is baked into the JWT, so the user must sign out and back in after a
change. Public signup being disabled is defense in depth; the explicit role
checks must remain if that dashboard setting changes.

The public leaderboard intentionally uses an owner-privileged view to expose an
aggregate without opening the underlying attendance table. That is a standing
RLS bypass: every added output column becomes public without another policy
change. Keep the projection to `first_name` and distinct-event `count`.

The discarded `policies.sql` design used recruiter access codes and an Edge
Function to sign resume URLs. It was removed in favor of Auth roles because
conflicting security definitions are dangerous. Preserve historical files only
when they are unambiguously marked, revoked, and subordinate to one canonical
rollout.

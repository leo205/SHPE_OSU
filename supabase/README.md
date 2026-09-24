# Supabase — database and public-submission security

_Production backend state reviewed and probed: 2026-09-14. Successful browser
acceptance tests for this follow-up are still pending._

Everything that authorizes access to attendance, resumes, sponsor data, or
uploaded PDFs must be enforced by Supabase or another trusted server. The anon
key is present in the public JavaScript bundle, so a React check controls what is
rendered, never what an attacker can call directly.

## Admin-managed sponsors — local-only release 1

Implemented on `feature/admin-managed-sponsors` from `4778478`, 2026-09-23.
**Not applied or deployed to the hosted project.** This adds public sponsor
branding management, not recruiter accounts, billing, or new public submissions.
Existing inquiry, attendance, and resume boundaries are unchanged.

| Component | Contract |
|---|---|
| `sponsors-admin.sql` | Additive tables, validated fields, RLS/column grants, audit/version triggers, asset registry/cleanup RPCs, restricted public branding bucket, repeat-safe five-company seed |
| `public.sponsors` | Public `SELECT` of published rows only; explicit admin role required for drafts and writes; no browser deletion; optimistic version checks |
| `public.sponsor_audit` | Admin-readable, trigger-written history including before/after values; not editable through the API |
| `public.sponsor_assets` | Admin-readable registry; service-only mutations; verified immutable paths and permanent cleanup tombstones |
| `manage-sponsor-assets` | Own admin bearer verification through Auth; bounded static raster decode/PNG normalization; immutable upload; leased cleanup without client-selected paths |
| `sponsor-assets` bucket | Public branding, 2 MiB cap; direct browser upload/overwrite/delete denied, including admin-browser writes |

Service-only asset RPCs are `reserve_sponsor_asset`, `complete_sponsor_asset`,
`claim_sponsor_asset_cleanup`, `finish_sponsor_asset_cleanup`, and
`pending_sponsor_asset_cleanup_count`. Browser metadata changes still go through
RLS, not the service key. Draft/archived *rows* are private, but their logo URLs
are public. Never upload private branding or contracts to this bucket.

Only the five exact migrated `/photos/sponsors/` paths or ready registered
`logos/<UUID>.<extension>` assets may be saved. Cleanup skips saved and audited
references, waits 24 hours for abandoned uploads, leases small batches, and
retains tombstones. Database row locking protects attachment versus cleanup,
including stale repeatable-read transactions. Cleanup is an explicit admin action,
not a scheduler, and will not erase retained logo history.

### Isolated local verification

README documents `npm run local:sponsors:setup`, `local:sponsors:functions`, and
`local:sponsors:dev`. They use the Docker project `shpe-sponsors-local`, API
`http://127.0.0.1:55431`, database port `55432`, and ignored `.sponsor-local/`
runtime files. The Docker network explicitly binds ports to loopback and setup
checks the resulting bindings. No production `.env` value is used or changed.
Local supporting tables are empty; the admin fixture is disposable.

`supabase/local/sponsor-review-bootstrap.sql` is **local fixtures only**, not a
production migration. Never apply it to the hosted project or rerun all SQL as
a bundle. Synthetic API/Storage checks run with:

```bash
node scripts/smoke-sponsors.mjs
node scripts/smoke-sponsor-assets.mjs
```

Automated evidence includes real React DOM interaction tests, PostgreSQL/PGlite
role/constraint tests, actual local REST editing and authorization checks, local
Edge decoding of PNG/JPEG/WebP, Storage metadata/denial/cleanup checks, and
two-session PostgreSQL attachment/cleanup races. Synthetic smoke fixtures are
removed; asset tombstones remain intentionally. Browser access was not approved,
so visual desktop/mobile and production-header acceptance remain outstanding.

### Later rollout, only after approval

1. Review the local UI, then inventory/back up target sponsor tables, policies,
   Storage settings, and existing public branding. Confirm the five-company seed
   still matches what should be published. Do not change unrelated policies.
2. Apply **only** `sponsors-admin.sql` transactionally after confirming the
   existing `public.is_admin()` and Storage schema. Its repeat seed never
   overwrites edits or resurrects archived rows. Inspect resulting grants/RLS.
3. Deploy `manage-sponsor-assets` with its pinned `deno.json`. Gateway
   `verify_jwt = false` does not make it public: the handler verifies Auth and the
   server-owned admin role before request-body, registry, or Storage work.
   Existing Supabase server credentials and exact `PUBLIC_SITE_ORIGINS` are
   required. No new `VITE_` variable, Turnstile, or EmailJS key is needed.
4. Verify admin uploads and actual Storage behavior, anonymous/recruiter denial,
   and all five public listings before deploying the matching frontend. Test
   publish/edit/archive/restore and version conflicts with approved disposable
   fixtures. Recheck recruiter access and inquiry delivery separately.
5. Release the frontend only after approval. Verify actual deployed assets,
   security headers, mobile layout, and public reads. A Git revert does not
   revert content: retain the additive tables and constraints on rollback and
   review the old static roster because it may be stale. Never reopen browser
   Storage writes or drop user-edited listings as a recovery shortcut.

## Production state

The protected public-submission rollout was completed on **2026-09-13** against
Supabase project `ekuaqbelulybowihmact`, followed by controlled browser smoke
tests and anonymous denial probes. Repository files still are not proof of live
state; query the catalog and endpoint behavior after every future change.

| File or component | Production/live status | Verified evidence |
|---|---|---|
| `leaderboard-view.sql` | **Applied 2026-09-13.** | Anonymous result is capped at ten rows, exposes exactly `first_name`, a SQL-derived one-character `last_initial`, and distinct-event `count`, and grants public roles `SELECT` only; raw attendance remains private. |
| `sponsor-auth.sql` | **Applied 2026-08-03.** | Recruiter codes were replaced by explicit Auth roles; anonymous resume/company reads and public resume-file reads remain closed. Public signup is disabled. |
| `resume-submit.sql` | **Superseded.** | The historical browser RPC remains defined for migration compatibility, but anonymous/authenticated execution was revoked by `resume-lockdown.sql`. |
| `attendance-submit.sql` | **Applied 2026-09-13.** | The shared durable limiter and service-only `submit_attendance()` RPC are live; a rolled-back service probe returned `accepted`. |
| `attendance-lockdown.sql` | **Applied 2026-09-13.** | Direct anonymous attendance insertion is denied with PostgreSQL `42501`; the protected form succeeded again after lockdown and admin access remained available. |
| `resume-edge-submit.sql` | **Applied 2026-09-13.** | A live PDF completed upload, private admin view, approval, and deletion; the test row and object were removed afterward. |
| `resume-lockdown.sql` | **Applied 2026-09-13.** | Anonymous resume metadata insertion has no grant, legacy RPC execution returns `42501`, direct resume-bucket upload is denied by Storage RLS, and no anonymous Storage INSERT policy remains. |
| `submit-attendance`, `submit-resume`, `submit-sponsor-inquiry` | **Deployed and active 2026-09-13** with `verify_jwt = false`. | Turnstile-protected attendance succeeded; resume lifecycle succeeded; sponsor inquiry reached EmailJS and delivered. Each endpoint performs its own validation, exact-origin handling, action check, and durable limits. |
| September 14 security fixes | **Backend and matching frontend deployed 2026-09-14; user acceptance pending.** | Cleanup SQL applied; all four Edge Functions active. Live rejected-token probes left quota counters, records, reservations, and files unchanged; private-data and cleanup authorization denial checks passed. Frontend assets match the approved build. Successful browser submissions are not yet re-verified for this follow-up. |

The rollout used transaction-wrapped migrations, catalog inventories, controlled
production smoke tests, and cleanup because the account's Free plan did not
permit a second Supabase project. A disposable staging project remains preferred
for future security changes. Network/IP buckets are still defense in depth: the
gateway's handling of conflicting caller-supplied forwarding headers has not
been proved in a separate staging environment.

## September 14 security follow-up — deployed, user acceptance pending

This focused change fixes invalid-token shared-Wi-Fi lockouts, magic-only PDF
validation, and files left behind when a resume is replaced. It does not add
identity verification, MFA, or a scheduled cleanup job.

Local release gates recorded September 14: **36 test files / 290 tests passed**,
along with lint, all four Edge bundles, the frontend build, `git diff --check`,
and zero findings in both dependency audits. The earlier resume validation work
also passed an actual Deno typecheck/runtime probe with a
synthetic native Quartz PDF of about 19 KB and rejection of a fake PDF. The
production-header preview is running at <http://127.0.0.1:4173>. Its original
build lacked `VITE_TURNSTILE_SITE_KEY`; localhost is not configured for real
submission testing. The release comparison build uses the already-public live
site key only in its build process, without changing `.env` or any secrets.
Production must rebuild from Git with Vercel's production variables. Browser
automation was unavailable; the owner will test attendance after frontend
release. No successful production check-in, email, or upload was created here.

A production inventory before applying the migration found 209 attendance rows,
10 approved resumes, 10 metadata rows, 10 private objects, zero orphaned objects,
and no cleanup extension. After applying only `resume-cleanup.sql`, those counts
were unchanged; existing policies and lifecycle routine definitions/grants were
identical. The new queue has RLS, no policies, and only the owner has direct
table privileges. Its three worker RPCs grant execution only to the owner and
`service_role`; all six new functions are owner-controlled security definers
with an empty search path, and all three lifecycle triggers are present.

Deployed versions on project `ekuaqbelulybowihmact`: `submit-attendance` **5**,
`submit-resume` **5**, `submit-sponsor-inquiry` **8**, and `cleanup-resume-files`
**1**, all `ACTIVE` with `verify_jwt = false`. Resume has the explicit pinned
`deno.json` import map; cleanup verifies admin Auth inside the handler.

Post-deploy live checks passed: exact production-origin preflight succeeds;
near-match origins are rejected; missing/invalid cleanup bearers return 401;
two invalid-token requests per public form return `verification_failed`/403.
The quota-table fingerprint and counts for attendance, resumes, reservations,
cleanup, and private files were unchanged across those probes. Anonymous raw
attendance and cleanup reads are denied; resume metadata and private-bucket
listing reveal zero rows. The public leaderboard returns exactly ten rows with
only `first_name`, `last_initial`, and `count`.

Temporary rollback source and aggregate/schema inventories were captured outside
Git during deployment. They were short-lived deployment evidence, not a durable
backup; use Git/Vercel version history and freshly downloaded deployed sources
for future rollback preparation. The previous protected frontend remains
compatible with the additive schema.

The matching application commit `3c0215a` (including security commit `749ac0e`)
was pushed to `main` and rebuilt by Vercel using production variables. The live
entry `/assets/index-BkPTcLwI.js`, three lazy JS chunks, and CSS all match the
comparison build byte-for-byte by SHA-256; production HTML returns 200 with
the configured security headers. These HTTP/asset checks are not browser
interaction tests. Real attendance acceptance, sponsor delivery, and the new
successful PDF replacement/cleanup lifecycle still require verification. The
owner is testing attendance; no successful synthetic submission was made here.
The final post-rollout cleanup queue and orphan counts were both zero.

Preserve this sequence for subsequent redeployment:

1. Run the normal gates. `npm test` includes `resume-cleanup.test.js`, which
   executes the actual lifecycle/cleanup SQL in isolated PostgreSQL through
   PGlite using synthetic data; it does not contact production.
2. Inventory the target's current lifecycle functions, grants, resume references,
   and private bucket. Apply **only `resume-cleanup.sql`** after the already-live
   `resume-edge-submit.sql`. The new migration adds transactional delete
   triggers, reference guards, and the private queue without deleting or
   backfilling existing rows/files. The old frontend remains compatible: its
   approval/deletion RPCs now queue retired paths automatically.
3. Deploy `submit-attendance`, `submit-resume`, `submit-sponsor-inquiry`, and
   `cleanup-resume-files`. `submit-resume/deno.json` pins its backend parser
   dependencies. Cleanup uses `verify_jwt = false` at the legacy gateway but
   requires a real admin bearer verified through Supabase Auth inside the
   handler. Verify anonymous/non-admin cleanup denial, invalid-token rejection
   without quota writes, and the current private-data denial checks.
4. Deploy the matching frontend only after SQL and the cleanup endpoint are
   ready. It delegates deletion retries to the server queue instead of relying
   on a browser-held path. With authorized disposable data, verify a normal PDF
   upload, replacement approval, retained new file, removed old file, and retry
   feedback on cleanup failure. Confirm legitimate forms still work.
5. Record deployment dates and live evidence above. Do not infer a completed
   production rollout from passing local tests or a frontend push alone.

Keep the existing lockdowns active. The cleanup migration is additive; a
frontend rollback can retain it and the worker. Never truncate/prune cleanup
tombstones or restore anonymous upload/write permissions to roll back.

## Current public-submission design

The following describes the code contract, including the deployed follow-up
above. The production table is the authority for what has been deployed.

The three browser forms invoke public Edge endpoints. The Edge Functions hold
the server secret, verify the request, and use only narrowly scoped server-side
operations. There is intentionally no direct-write fallback to a public table,
Storage bucket, or EmailJS endpoint.

### Shared controls

All three public-submission functions share the code under
`functions/_shared/`:

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

All shared-IP, identity/email, and global quota writes occur **after successful
server-side Turnstile verification**. Rejected or unavailable verification
performs no database/quota work. The former pre-verification `*:edge:*` buckets
are no longer consumed, so random invalid tokens cannot exhaust an entire campus
NAT's allowance. No per-token database buckets replace them. This removes the
application's pre-Siteverify throttle: volumetric request/Siteverify protection
must come from the hosting gateway and remains a separate operational concern.

The fixed-window limits are defense in depth, not identity proof. Campus users
may share one NAT, so attendance keeps a broad network ceiling and a separate
normalized-member bucket. Sponsor inquiry additionally has per-network,
per-email, per-second provider, daily, and 31-day global ceilings. Resume uses
separate network, email, and global buckets. Verified abuse can still consume
these allowances. Tune limits only after
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

The browser sends bounded multipart form data and a PDF. Cheap size, MIME,
header, and metadata checks precede Turnstile. After successful verification and
durable limits, the handler structurally screens the PDF, fingerprints the
exact normalized draft plus file bytes, and reserves an idempotency UUID before
Storage is touched.

`pdf-inspection.ts` uses backend-only, pinned `pdf-lib` 1.17.1 and `pako` 2.1.0.
It requires a complete PDF envelope, catalog, and valid page tree, accepts one
through ten pages, and rejects encrypted files, scripts, active actions, attachments,
interactive forms, and unsupported stream filters. Ordinary HTTP(S)/mailto links
remain supported. The existing 10–250 KB input cap remains; parsing additionally
caps expanded streams at 8 MB, objects at 3,000, parsed nodes at 30,000, nesting
at 64, and streams at 256. Parsed work is capped at 32 MB, dictionaries at 1,000
entries, and text tokens at 64 KB. Images are limited to 10,000 pixels per dimension and
20 million pixels. This is structural/active-content screening for a static
resume subset, **not antivirus, a renderer, or a guarantee of file safety**.
Rejected files receive a message asking for a fresh static PDF export. No
existing uploaded file is rewritten or rescanned by this change.

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
still returns the authoritative object path for compatibility with the older
admin client. `resume-cleanup.sql` adds a BEFORE DELETE trigger that queues every
retired path in the same transaction, including older siblings removed during
approval, and supersedes reservations by path. Failed approval/deletion rolls
back that cleanup intent too.

The private `resume_file_cleanup` queue and its claim/finish/count RPCs are
inaccessible to ordinary browser roles. The authenticated-admin
`cleanup-resume-files` endpoint validates the bearer through Auth, checks
server-controlled `app_metadata.role`, claims at most five server-selected
detached paths, and deletes through the Storage API. The request body cannot
choose paths or buckets. Two-minute leases and lease tokens make interrupted or
concurrent passes retryable; failures back off from 30 seconds to one hour.
Metadata/reservation guards prohibit path replacement or resurrection. Completed
queue rows are permanent tombstones; a late in-flight upload makes its tombstone
eligible for cleanup again.

The admin page requests one bounded cleanup pass on visits, successful
approval/deletion, and **Retry file cleanup**. It shows pending work when removal
cannot be confirmed. Retry time is eligibility, not a scheduler: **there is no
cron/background worker**, so another admin visit/action is required. Do not
truncate tombstones or auto-backfill unrelated existing orphan files.

Turnstile limits automation, but it does **not** prove ownership
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
EMAILJS_PRIVATE_KEY (optional when the account does not expose this feature)
SPONSOR_INQUIRY_DAILY_LIMIT
SPONSOR_INQUIRY_MONTHLY_LIMIT
```

The current EmailJS Free account does not expose private-key enforcement. Keep
the template's recipient as a fixed trusted address rather than a
browser-supplied variable, and render `inquiry_id` in the admin-visible message
for correlation after an ambiguous delivery. During the coordinated browser
cutover, rotate the EmailJS public key, immediately replace
`EMAILJS_PUBLIC_KEY` in Edge secrets, and prove the old key fails while the Edge
request succeeds. The replacement key must never enter Vite, Git, logs, or chat.
If the account later exposes private-key enforcement, configure
`EMAILJS_PRIVATE_KEY`, enable the requirement, and repeat both probes.

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

## Safe redeployment and rollback order

The sequence below combines the completed 2026-09-13 production cutover with the
deployed September 14 cleanup follow-up and must be preserved if the boundary is
rebuilt. Prefer a staging Supabase project and preview deployment first. Take a
schema, policy, grant, bucket, and relevant-row inventory before changing
anything. Apply one numbered stage at a time and record its evidence; do not
rerun every historical SQL file as an unordered bundle.

1. Run the local gates: `npm test`, `npm run check:edge`,
   `npm run lint`, `npm run build`, and `git diff --check`.
2. In staging, inventory duplicate approved resume emails, duplicate resume
   paths, historical attendance duplicates, current policies, routine grants,
   bucket privacy, and file sizes. Resolve data conflicts manually; neither
   migration auto-deletes historical duplicates.
3. Apply `leaderboard-view.sql` and verify anonymous reads return no more than
   ten rows, in descending distinct-event order, with exactly `first_name`,
   `last_initial`, and `count`. Then apply `attendance-submit.sql`. Probe that `anon` and
   `authenticated` cannot
   execute either service-only RPC, while the service secret can consume a
   limit and submit a valid attendance row.
4. Apply `resume-edge-submit.sql`. Probe reservation, exact retry, changed-draft
   conflict, private upload, pending revision behavior, non-admin denial, and
   admin approve/delete. Confirm existing approved resumes remain readable only
   to authorized roles. Then apply `resume-cleanup.sql`; verify its private
   queue, reference guards, lifecycle triggers, owner/service-only worker grants,
   and that applying it did not backfill or delete rows or files.
5. Configure staging Edge secrets from `functions/.env.example`. Use exact
   preview origins and Turnstile hostnames. Prepare the EmailJS public-key
   rotation, or private-key enforcement when the account supports it, before
   sponsor cutover.
6. Deploy all four Edge Functions with the reviewed `config.toml`. Probe rejected
   origin, malformed/oversized body, bad and replayed Turnstile token, exhausted
   rate bucket, provider failure, and one valid request for each public form.
   Verify anonymous and non-admin cleanup requests are denied, then exercise the
   authorized cleanup path with disposable data. Confirm no sensitive values
   enter logs.
7. Deploy the matching browser build to preview and click-test attendance,
   resume upload, admin approval/deletion, sponsor inquiry, and the emergency
   fallback. Confirm browser code performs no direct public write or EmailJS
   request.
8. Repeat the additive SQL (including `resume-cleanup.sql`), secrets, and all
   four Edge deployments in production. Deploy the browser only after the live
   Edge probes pass. Submit one real browser request through each public flow and
   verify the database/Storage/email result; verify cleanup with authorized
   disposable resume data.
9. Immediately apply `attendance-lockdown.sql`, then probe direct anonymous
   attendance `SELECT` and `INSERT` denial, protected Edge acceptance, admin
   access, and the privacy-limited public leaderboard.
10. Apply `resume-lockdown.sql`, then probe direct anonymous Storage upload,
    metadata insert, and legacy `submit_resume()` denial. Re-probe protected
    upload, private-file access, pending review, approval, and deletion.
11. Remove temporary preview origins, review EmailJS and rate-limit usage, and
    update the production-status table above with dates and probe results.

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
    'claim_resume_file_cleanup',
    'finish_resume_file_cleanup',
    'pending_resume_file_cleanup_count',
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
can. No sponsor accounts existed as of 2026-09-13. To provision
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
change. Keep the projection to `first_name`, the SQL-derived one-character
`last_initial`, and distinct-event `count`. Never project the stored
`last_name_dotnum` or internal member key.

The discarded `policies.sql` design used recruiter access codes and an Edge
Function to sign resume URLs. It was removed in favor of Auth roles because
conflicting security definitions are dangerous. Preserve historical files only
when they are unambiguously marked, revoked, and subordinate to one canonical
rollout.

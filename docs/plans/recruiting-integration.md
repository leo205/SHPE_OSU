# Connected recruiting integration

Prepared November 17, updated November 18, 2026 on
`codex/resume-company-interests-preview`. The owner-authorized hosted backend
rollout is complete: the additive migration and upload function version 6 passed
disposable live tests. The owner subsequently authorized publishing the frontend
to main; [the production release](recruiting-frontend-release.md) is now verified.
See [the backend record](recruiting-backend-rollout.md) for backend rollback proof.
A successful fresh production browser/Turnstile upload and actual desktop/mobile
browser acceptance remain pending. The subsequent
[Fall E-Board release](eboard-red-polo-release.md) preserved the recruiting code
and provides the latest documented frontend deployment evidence.

Normal operations use the deployed `/resume-upload`, `/company`, and `/admin`
routes. Local review ports are 4173 for a production-configured preview, 5175
for the isolated connected fixture, and 5174 for the fictional comparison when
their respective servers are started. Localhost does not establish production
challenge/origin acceptance. The checks and rollout sequence below are dated
implementation evidence, not instructions to reapply completed production SQL.

## Implemented behavior

- `/resume-upload` uses actual PDF files, the existing protected `submit-resume`
  endpoint, optional LinkedIn, and multiple real catalog choices. Missing catalog
  data has retry/error handling and blocks submission rather than silently
  clearing preferences. There are no demo controls or browser-stored resume data.
- `/admin?tab=resume` uses the real, completely loaded resume dataset and the
  existing approval, revocation, deletion, and retired-file cleanup lifecycle.
  **Approved & public** precedes **Pending review**. **View PDF** opens a blank
  tab synchronously and then navigates to a private, 60-second signed URL.
- **Resume book** and **Recruiting companies** are sidebar items directly below
  **Resume**, with mobile access below the four primary navigation tabs.
  Admins can preview a company's directory, manage company choices, and assign
  existing recruiter accounts to companies. New accounts/emails are not created.
- `/company/dashboard` derives its company from the authenticated user's private
  assignment. Recruiters can see their interested students and all approved
  students, search, filter graduation year, open the private PDF, and open an
  optional LinkedIn profile. There is no company picker or admin navigation.
- Authentication identity/role changes remount private views and cancel older
  loads. Membership inventory refreshes reject stale responses. Errors do not
  publish a partial directory, pretend a failed save succeeded, or substitute
  fictional records.

## Data and compatibility

`supabase/recruiting-interests.sql` is additive after the already-existing
`resume-edge-submit.sql` and `resume-cleanup.sql` lifecycle. It adds:

- An optional, validated `resumes.linkedin_url`.
- `recruiting_companies`, with public reads of active choices and admin-only
  creation/availability changes. This is separate from public sponsor branding.
- Private per-revision `resume_company_interests` and field-presence metadata.
  Recruiter projections expose only their own company's `interested` flag.
- Private `recruiting_memberships`, admin-only assignment RPCs, and paginated
  company-scoped directory/context functions. Multiple users can share a company.
- Service-only `queue_resume_submission_v2`, which saves the extension data in
  the same transaction as the pending revision.

Omitted extension fields retain the exact legacy fingerprint and queue RPC.
Insert inheritance and approval-time rebasing preserve the currently approved
metadata when an old tab submits a replacement. Explicit empty LinkedIn/choices
clear them only when that new revision is approved. New fingerprints bind
normalized LinkedIn and sorted/deduplicated company IDs. Invalid/hidden choices
require review of the refreshed catalog. No version silently falls back from a
missing v2 RPC to the legacy writer.

Approval still switches one normalized email's revision atomically and retires
older files through the existing leased cleanup/tombstone flow. Entering an email
does not prove ownership. Turnstile, verified-only durable quotas, structural PDF
screening, immutable private paths, and current role gates are preserved.

Hiding a company affects new choices only. Disabling a company assignment blocks
the new company-specific context; **it does not revoke the existing sponsor-role
entitlement to approved resumes/PDFs**. Remove the account's server-controlled
sponsor role to revoke that access. User-editable metadata grants nothing.

## Run the connected application locally

Docker/Colima is required. This creates a separate, loopback-only project named
`shpe-recruiting-local`, not a clone or modification of the hosted project or the
existing sponsor-review database. Runtime files/keys are ignored beneath
`.recruiting-local/`; the scripts never read `.env` or use `--linked`.

```bash
npm run local:recruiting:setup
npm run local:recruiting:functions  # leave running
```

In another terminal:

```bash
npm run local:recruiting:smoke
npm run local:recruiting:dev       # leave running
```

Open <http://127.0.0.1:5175/admin/login> or
<http://127.0.0.1:5175/company>. Fixture logins are recorded in
`.recruiting-local/review-login.txt`. The admin fixture is
`recruiting-admin@example.test`, and recruiter fixtures include
`recruiting-a@example.test` and `recruiting-b@example.test`; their disposable
password is `LocalRecruitingReview2026!`. These credentials work only with this
local fixture project. The form is <http://127.0.0.1:5175/resume-upload>.

The API uses port 55531, DB 55532, mail 55534, and Edge inspector 8095. Setup uses
fictional accounts/companies only. The smoke run leaves two approved fictional
students and one pending submission for manual review. It also persists its safe
outcome in `.recruiting-local/smoke-result.json`.

The [official Cloudflare dummy response](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) does not contain the production action
claim. An explicitly guarded, ignored localhost entry adapts that response only
for the isolated rehearsal. Production verification is unchanged. The rehearsal
therefore proves local Auth/REST/RLS, real upload handling, SQL, Storage, and
lifecycle behavior; live challenge hostname/action acceptance and visual browser
behavior are separate checks.

## Dated rehearsal checks and release evidence

The local API/Edge rehearsal passed actual uploads, exact retries, changed-draft
conflicts, stale choices, raw-preference/role/company-scope denials, admin-only
pending PDF signing, approved recruiter PDF download, approval/replacement,
legacy inheritance, explicit clearing, assignment/catalog changes, and physical
retired-object cleanup. Isolated PostgreSQL tests cover migration reruns, grants,
RLS, paging, field validation, and revision semantics. Connected UI/client tests
cover failures, actual private-path callbacks, no fake fallbacks, and account
switch/late-response privacy regressions. Independent security/code review found
two frontend stale-response issues; both were fixed and regression-tested.

At the connected rehearsal stage, the full suite passed **603 tests in 57 files**. Lint, the normal and separate
comparison builds, all five Edge bundles, and whitespace checks passed. The
connected application's six representative routes served the main app entry
with HTTP 200. Browser automation was unavailable; real desktop/mobile visual
review and native new-tab PDF interaction remain unverified.

The November 18 release production-dependency audit reported zero findings. The
full audit reported **15 development-tool findings (13 high, two moderate)** in
`@vitest/mocker`, `anymatch`, `chokidar`, `fast-glob`, `fdir`, `micromatch`,
`picomatch`, `postcss-selector-parser`, `readdirp`, `source-map-js`, `sucrase`,
`tailwindcss`, `tinyglobby`, `vite`, and `vitest`. Dependency versions/lockfile
were not changed by this feature. These remain documented maintenance findings;
review compatible toolchain patches as maintenance rather than running a forced
major upgrade inside the feature. The owner authorized publication after these
findings were disclosed. The local servers bind only to loopback;
the deployed static application does not run the Vite development server.

Before the authorized rollout, read-only hosted checks requested **zero student rows**: the existing resume
endpoint responded 200, while the new company table and context RPC returned
`PGRST205` and `PGRST202`. The November 18 approved rollout then added that
setup, verified disposable lifecycle operations, and removed its test resources;
see the linked release record. No actual student rows/files or original roles
were changed, and no emails were sent.

## Historical hosted rollout order and remaining acceptance

The following order was used for the owner-authorized rollout. Backend setup,
disposable API/lifecycle checks, and frontend publication are complete; do not
replay these steps against production without a new scoped change and approval.
The review-stage browser checks in step 5 were not completed and remain separate
post-deployment acceptance work. Eight then-published sponsor names were copied
once into the independent company catalog; recruiter provisioning/assignments
remain an admin operation, separate from sponsor publication.

1. Inventory the actual target schema, lifecycle definitions, grants/RLS, and
   private bucket. Back up the existing function/policy definitions and inventory
   counts privately without committing student data. Re-run the release gates.
2. Apply only `supabase/recruiting-interests.sql` to the intended hosted project.
   It has no company/account seed and does not alter the existing sponsor-role
   book policies. Do not run a local bootstrap or replay historical migrations.
3. Deploy only the updated `submit-resume` with its existing gateway/secrets and
   protected production verifier. Keep the compatible old client working.
4. Through authorized admin actions, add the actual participating companies and
   map existing recruiter accounts. Do not infer access from sponsor publication
   or seed the demo companies. New account provisioning is separate.
5. Connect this branch's local frontend to the hosted publishable configuration
   for authenticated review. Run an explicitly authorized disposable
   upload/approval/replacement/private-PDF/cleanup check, inspect the real
   approved directory, and check desktop/mobile layouts and live Turnstile.
6. Only after those checks and separate merge/deploy authorization, ship the
   frontend to `main`. Backend SQL and Edge must precede the new frontend.

The owner approved and completed the backend rollout/disposable test on November
18. The owner subsequently authorized main/frontend publication; it is now
deployed and verified in the frontend release record. A fresh production Turnstile upload
and browser visual review remain separate checks. Do not describe API lifecycle
success as that browser acceptance or alter existing students/roles during tests.

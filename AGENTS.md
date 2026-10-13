# SHPE OSU — Project and Agent Guidelines

_Last updated: October 12, 2026._

Read this before working on the repository. These instructions apply to human
contributors and coding agents regardless of provider or model.

## Project

This is the SHPE chapter website at The Ohio State University, hosted on Vercel
at <https://www.shpeosu.com>. Production deploys from `main`.

The stack is React, Vite, Tailwind, React Router, and Supabase Postgres/Auth/
Storage/Edge Functions. Browser code is JavaScript; Edge code is TypeScript.
Use `package.json` and `package-lock.json` for current runtime/dependency versions.
Node must satisfy the `engines` requirement in `package.json`.

Serve prospective students, current members, recruiters, and the E-Board.
Weekly content management must be available to non-developers through the admin
interface, not require a source-code edit.

## Working rules

- Work on a focused branch from an up-to-date `main` unless the owner explicitly
  permits working directly on `main`. A one-task exception does not change the
  default for future work.
- A request to edit, review, or commit is not permission to push, merge, deploy,
  change production settings, run migrations, or write production data.
- Preserve unrelated/uncommitted contributor changes. Do not delete or overwrite
  files outside the approved scope. Prefer recoverable changes.
- Inspect the relevant code and surrounding behavior before editing. Use shared
  helpers rather than duplicating data formatting or event loading.
- Keep fixes focused. Do not refactor working code solely for stylistic preference.
- Never print or commit secrets or student data. Ordinary local `.env` values
  can point to production; use isolated fixtures for mutation testing.
- Document what was actually checked. Passing tests/build does not prove browser
  behavior, current live database state, or production deployment.
- For UI changes, click the affected controls and check desktop/mobile behavior
  when permitted. Report unavailable verification rather than claiming success.

## Security and data contracts

- Browser checks are presentation, not authorization. Enforce access in
  Postgres RLS/service-only RPCs and authenticated Edge handlers.
- Attendance, resume uploads, and sponsor inquiries must use
  `submit-attendance`, `submit-resume`, and `submit-sponsor-inquiry`.
  Never restore anonymous direct database/Storage writes or browser EmailJS.
- Verify action-bound Turnstile server-side before consuming durable
  shared-network, identity/email, or global quotas. Invalid-token traffic must
  not exhaust campus Wi-Fi users' allowance. Fail closed on unavailable controls.
- Treat IP limits as defense in depth until gateway header provenance is proved.
  Turnstile does not verify attendee identity, presence, or email ownership.
- The public leaderboard is limited in Postgres to ten entries and exactly
  `first_name`, one-character `last_initial`, and distinct-event `count`.
  Full surnames, dot numbers, and raw attendance stay private.
- Exclude E-Board member keys through private `leaderboard_exclusions` before
  ranking and the ten-row cap. Keep real roster identifiers out of Git/browser
  code. Exclusion changes must not delete attendance or alter admin reporting.
- Resume PDFs remain private. Preserve bounded structural/active-content
  screening, the 10–250 KiB size range, and one-to-ten-page static subset.
  Screening is not antivirus or proof that a file is harmless.
- Replacements keep approved resumes available until a new revision is approved.
  Use authenticated admin lifecycle RPCs. Queue retired paths transactionally;
  delete Storage objects only through authorized cleanup with leases and
  permanent tombstones. Do not delete Storage catalog rows directly.
- Sponsor emails make one server-side provider attempt. A timeout is ambiguous;
  never automatically resend it. Keep provider values and recipients server-side.
- Sponsor listings and recruiter access are separate. Only published branding
  is public; publication must not grant resume access. An empty sponsor query
  stays empty; do not add a hardcoded roster fallback.
- Sponsor logos use the admin-only `manage-sponsor-assets` endpoint. Preserve
  registry validation, optimistic version checks, retained audit history, upload
  recovery, leased cleanup, and permanent tombstones. Draft/archived logo URLs
  are public branding, not confidential assets.
- Preserve the exact attendance label `${M}/${D} - ${title}` stored in
  `attendance.event_name` and the en dash in `Other – x` major values.
- The Google attendance backup may prefill only a canonical event label, never
  attendee data. Its responses require manual validation/de-duplication and must
  never automatically feed attendance or the leaderboard.

See [the security runbook](supabase/README.md) for exact policy, RPC, validation,
rollout-order, and deployment-evidence requirements.

## Product behavior to preserve

- Calendar and check-in events use `src/lib/events.js`; the bundled
  `src/data/events.js` list is the intentional fallback, not a second reader.
- Check-in offers local-today and future events only. Past meetings remain in
  the public calendar and admin reporting.
- Calendar exports represent Columbus time explicitly. Do not change stored
  event labels or dates as a side effect of presentation work.
- Missing/failed event artwork uses the real SHPE logo. Show full flyers without
  cropping, provide the full-size link, and keep long event dialogs usable.
- E-Board cards/headshots have matching modest curves and no hover animation.
- Admin navigation, controls, tables, and sponsor editing remain mobile usable.
  Keep horizontal table scrolling inside containers, not across the whole page.
- Preserve lazy loading for admin, recruiter, and professional-development routes.
- Keep sponsor package pricing, benefits, packet, and protected inquiry behavior
  separate from the database-managed listing directory.
- Keep the approved original GroupMe destination synchronized on Home, Footer,
  and first-attendance success. New invite URLs, QR codes, or equivalent join
  routes require explicit owner approval.
- Preserve the approved Google Classroom resource link.
- The October 1 public-site redesign experiment was rejected and archived locally;
  the original `main` design is the baseline. Do not reintroduce that experiment.

## Browser pitfalls

- Do not use `scrollTo({ behavior: 'instant' })`; older Safari can throw.
  Use supported scrolling options, and avoid global smooth scrolling that
  animates route resets or interferes with back/forward restoration.
- Open user-requested popup tabs synchronously before awaiting work, or browsers
  may block them. A `noopener` window can legitimately return `null`; do not
  interpret that alone as a failed open or create a duplicate tab.

## Verification

For implementation/release checks, run the relevant checks and record results:

```bash
npm run lint
npm test
npm run check:edge
npm run build
npm audit --omit=dev
npm audit
git diff --check
```

Use `npm run dev` at <http://localhost:5173> for ordinary UI review.
Use `npm run build` then `npm run preview` at <http://localhost:4173>
for the production-header/CSP preview. A local build without production frontend
configuration is not the deployed artifact; never insert server secrets into
`VITE_` variables to make it work.

Check the specific form, export, modal, or lifecycle changed, including failure
and retry paths. Live tests that submit attendance, upload/delete files, send
emails, or modify records require explicit approval and disposable targets.
Before release, read the preflight/security guidance and verify actual target
state and migration order. After an authorized deployment, verify live assets,
headers, and routes; keep real-form acceptance separate from HTTP checks.

## Documentation and review roles

| Document | Purpose |
|---|---|
| [README.md](README.md) | Installation, local development, and project overview |
| [HANDOFF.md](HANDOFF.md) | Engineering operations and historical release evidence |
| [supabase/README.md](supabase/README.md) | Authoritative security and backend rollout runbook |
| [REWRITE.md](REWRITE.md) | Proposed architecture work and persistent data contracts |
| [docs/plans/sponsor-admin.md](docs/plans/sponsor-admin.md) | Sponsor-management architecture and rollout |
| [docs/agents/README.md](docs/agents/README.md) | Provider-neutral review-role usage |

Use [code-reviewer](docs/agents/code-reviewer.md) for implementation correctness,
[security-auditor](docs/agents/security-auditor.md) after security/Supabase changes
and before release, and [deploy-preflight](docs/agents/deploy-preflight.md) before
an authorized production push. These roles are read-only; they report findings
and never implement or deploy fixes.

Release logs in HANDOFF and the security runbook are dated evidence, not a live
inventory. Re-check unresolved form/browser acceptance, gateway header provenance,
upcoming event content, and recruiter onboarding when relevant. Identity/presence
verification and the attendance-form lock remain deferred pending owner approval.

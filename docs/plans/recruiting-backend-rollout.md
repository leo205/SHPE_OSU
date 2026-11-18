# Recruiting backend rollout — November 18, 2026

The owner explicitly authorized the additive migration, updated upload-function
deployment, and a disposable live test. The work remains on
`codex/resume-company-interests-preview`. **Main and the deployed frontend were
not changed.** Both the local main ref and public frontend asset URLs were
compared with their pre-rollout baseline and remained unchanged.

## Applied and verified

- Applied only `supabase/recruiting-interests.sql`, transactionally, with a
  three-second lock timeout and 60-second statement timeout. Reviewed source
  SHA-256: `665aadbddf8c4a7fffb9f743aec8e076491714aadf7c565a696a1ed8f2446928`.
- Deployed only **submit-resume version 6**, previously version 5. It remains
  active with `verify_jwt=false`; the real production Turnstile verifier and
  existing server secrets were retained. The other four deployed functions'
  metadata remained identical.
- Downloaded the deployed source and verified exact hashes against the reviewed
  upload entry, validation, fingerprint, handler, PDF screen, request controls,
  production verifier, and pinned import configuration.
- Original counts and record/path fingerprints stayed intact: **10 approved
  student records, 10 private resume PDFs, four original Auth users**. Original
  reservation and durable-quota fingerprints also matched their baseline.
  Existing RLS policies, lifecycle definitions/grants, unique indexes, bucket
  settings, and public leaderboard definition were preserved.

## Disposable hosted checks

`scripts/smoke-recruiting-hosted.mjs` ran against the explicitly verified hosted
project with journaled UUIDs and unique synthetic emails/names. Its nine groups
of checks passed:

- The real Edge endpoint rejected an invalid challenge with `verification_failed`;
  no fixture row/reservation or durable quota change occurred.
- Real temporary Auth accounts enforced admin/sponsor/unrelated-user roles and
  server-owned company assignments. Cross-company directory requests failed.
- Private PDFs were uploaded through Storage and queued through the service-only
  reservation/v2 RPC. Exact retries converged; changed fingerprints conflicted.
- Admins could sign/read pending PDFs; sponsors/anonymous callers could not.
  Sponsors could sign/read approved fixture PDFs. Raw preferences stayed private.
- Approval/replacement switched the company-specific interest flags atomically,
  while pending replacements left the approved version available.
- A legacy replacement preserved preferences; explicit empty values cleared them
  at approval. Catalog hiding and assignment deactivation retained the documented
  distinction from legacy sponsor-role book entitlement.
- All test rows, four temporary Auth accounts, two temporary catalog companies,
  and four test PDFs were removed. Cleanup used canonical leases, exact owned
  paths, Storage API removal, and token-bound completion. A guarded claim aborts
  the entire statement if any unrelated path is returned. No whole-queue cleanup
  endpoint or direct Storage catalog deletion was used.

The four synthetic reservation histories and completed cleanup tombstones remain
permanently, as required by the existing lifecycle. **No pending cleanup remains.**
No actual student row/file, existing account role, public sponsor listing, mail
setting, production secret, or frontend deployment was changed.

A successful public upload with a fresh real browser Turnstile challenge was
**not verified**. The positive live checks exercised Auth/RLS/Storage/queue and
approval lifecycle directly. The local-only dummy challenge adapter was never
deployed. Browser visual/mobile review also remains pending.

## Review with real data

The branch's production-configured local preview runs at
<http://127.0.0.1:4173/admin?tab=resume>, using the existing public backend/site-key
configuration and production security headers. Sign in with a normal existing
admin account, not the isolated fixture credentials.

The admin **Resume book** now lists all approved students even before any
companies are configured. Once actual companies are added, admins can preview
each assigned company's view. No demo companies or recruiter assignments were
left on the hosted project. Add actual participating companies and map existing
recruiter accounts through the admin interface as needed.

The isolated synthetic application remains on port 5175, and the earlier
fictional comparison remains separate on port 5174. A localhost preview is not
a frontend deployment or proof of a successful production challenge.

Latest branch checks: **616 tests in 58 files**, lint, production-configured
frontend build and route/header checks, plus the preceding five Edge bundle
checks. Production dependency audit: zero findings. The 15 previously recorded
development-tool advisories remain a separate maintenance task before merge.

## November 18 review refinements

The owner requested simpler presentation and current sponsor choices. Removed
the student form's section numbers, marketing tagline and decorative upload
panel in favor of a compact **Attach resume** control. Admin submissions now
default to **Approved & public**. Student placeholder profile icons and their
reserved mobile column were removed; a supplied LinkedIn URL remains a link,
without importing a profile photo.

Copied all **eight currently published sponsor names** once into the separate
active recruiting-company catalog. Existing choices would be retained rather
than overwritten. No recruiter accounts/access, student data/PDFs, sponsor
branding, or public listings were changed. Recruiter assignments remain empty
and admin-controlled; future catalog maintenance stays independent from sponsor
publication.

The live cleanup queue was confirmed empty. The earlier message was caused by
the helper incorrectly mapping any failed check to pending files. It now reports
complete, confirmed pending, or unavailable distinctly. Technical maintenance
feedback is collapsed after the admin content; automatic cleanup and retry stay
available.

Read-only OPTIONS checks confirmed **403 for localhost port 4173** and **204 with
the expected allow-origin for `https://www.shpeosu.com`**, for both upload and
cleanup functions. No live CORS/security settings were broadened. The generic
widget screenshot did not establish its specific Cloudflare error code; the
widget now displays bounded public codes and distinguishes hostname/configuration
errors from connection errors, clears stale failures after success, and ignores
callbacks from removed widgets. Cloudflare documents [authorized hostnames](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
separately from [client-side error codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/).
Publishing alone is not proof of successful verification: a real browser upload
on an approved hostname remains an acceptance check. Production secrets,
verifiers, deployed functions, main and the deployed frontend were untouched by
this refinement. The updated local real-data build remains on port 4173.

## Rollback

The exact previously deployed upload source and metadata were downloaded before
changes, and that source was successfully bundled to prove it can be restored.
Private durable backups are outside the web project at
`../.recruiting-backend-backups/2026-11-18/2026-11-18-backup/`. They include schema,
policy, lifecycle/grant inventories, count/fingerprint baselines, a branch-source
checkpoint, and `ROLLBACK.md`. Live service credentials were held only in a
0700 private temporary directory outside the web root and removed after testing.

If necessary, stop connected new clients and restore the saved version-5 source
as a new function deployment, preserving gateway configuration and server secrets.
Main's existing frontend can continue using the legacy-compatible API.
**Retain the additive schema and collected metadata** rather than dropping data
to make the schema resemble an older commit.

Only if a new trigger itself is faulty, use the prepared trigger-specific recovery
instructions. Pause new submissions/approvals during such repair, retain all
existing reservation/cleanup guards, and reconcile any affected pending revisions
before resuming approvals. Do not restore database snapshots over real activity,
truncate tombstones, or reset the working tree to discard unrelated work.

A code rollback cannot recreate PDF files that have already been legitimately
retired and physically deleted. This rollout deleted only its disposable files;
the original ten private files remain intact.

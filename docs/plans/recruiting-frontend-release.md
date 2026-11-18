# Recruiting frontend release — November 18, 2026

The owner explicitly authorized pushing the reviewed recruiting frontend to
`main`, accepting that real browser/mobile and successful production Turnstile
upload checks will follow deployment. This supersedes the earlier branch-only
restriction recorded during backend rollout. The last pre-release main commit
is `a97281b9dc11a533d125e18d30ee918f74eefa36`.

## Deployed and verified

Code commit `1ebb210997b4985892383801a09586393dd26f35` was fast-forwarded to
`main` and pushed without force. Vercel reported **success** for production
[deployment JDrn26Cfo7ux9LMazDDCQx1RAAH7](https://vercel.com/leonardomedina05707-8965s-projects/shpe-osu/JDrn26Cfo7ux9LMazDDCQx1RAAH7).
The live frontend entry is `/assets/index-Dma6bCvf.js`.

All nine generated JavaScript/CSS files matched the production-configured local
build byte-for-byte by SHA-256. Eleven routes returned HTTP 200, referenced the
new entry, and matched all six configured security headers exactly: home,
student form, recruiter login/dashboard, admin login/submissions/book/company
queries, admin companies redirect, events, and sponsors. Independent read-only
checks confirmed the updated form copy and lazy portal assets. Protected-route
HTTP checks establish the app shell, not authenticated rendering or a completed
form submission.

The unrelated E-Board experiment's branch, HEAD and uncommitted-file status were
preserved exactly. Runtime/credential files remained excluded. Subsequent
release-note-only commits may advance main without changing the verified assets.

The reviewed source includes the connected student form, admin review/book/company
sidebar items, recruiter company-scoped interest view, private new-tab PDFs,
optional LinkedIn, and the final presentation/maintenance fixes. The separate
fictional comparison and isolated local Supabase tools remain available only
through their explicit local entry/scripts. Private runtime data and credentials
are excluded from Git; the unrelated E-Board worktree is preserved.

Fresh preflight passed 616 tests in 58 files, lint, all five Edge bundles,
whitespace checks, and a production-configured frontend build. The production
dependency audit is clean. The 15 existing development-tool findings (13 high,
two moderate) were disclosed; no forced or unrelated dependency upgrade was
included in this release. Source review and credential-pattern checks found no
blocking issue. Deployment must still be verified from the GitHub/Vercel commit
status and actual live assets/headers/routes.

The prerequisite backend is already deployed: additive recruiting migration,
active `submit-resume` version 6, eight current sponsors as independent catalog
choices, and verified disposable Auth/RLS/Storage/queue/lifecycle/cleanup tests.
No existing student record/file or account role needs to be changed by the
frontend release. See [the backend rollout/rollback record](recruiting-backend-rollout.md).

## Remaining browser acceptance

After deployment, verify a fresh real challenge and successful resume upload,
review/private-PDF/approval flow with a disposable submission, and phone-width
layout/navigation. A successful build, HTTP 200, or backend service-RPC test is
not proof of that browser acceptance. Production verification and server-side
origin controls must remain enabled.

## Rollback

If the new frontend needs to be withdrawn, restore the prior frontend source
through a reviewed revert/new deployment; do not force-push or discard unrelated
work. The already-live backend remains compatible with older clients. Keep new
schema/data and permanent cleanup history intact. Only restore the saved old
upload function if a backend defect requires it, stopping connected new clients
first so extension fields cannot be silently ignored by the older handler.

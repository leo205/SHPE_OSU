# Fall red-polo E-Board release — November 18, 2026

The owner explicitly approved publishing the reviewed E-Board design to `main`.
The release starts from production main `00b081d4007a5cf07d6d48100b3bfad881487bee`
and preserves the previously deployed recruiting implementation. No dependency,
environment, security-policy, database, or Edge Function change is required.

## Deployed and verified

Code commit `803f7a4cbd9d2d6c2da43ea943161e2c35f90952` was fast-forwarded to
`main` and pushed without force. Vercel reported success for production
[deployment AVHCGrfvssMN2g7u7FwUPwv47q9m](https://vercel.com/leonardomedina05707-8965s-projects/shpe-osu/AVHCGrfvssMN2g7u7FwUPwv47q9m).
The live entry is `/assets/index-DjxDcHB0.js`; the lazy E-Board files are
`EboardRedPolos-Co1zcIlo.js` and `EboardRedPolos-BPZj58Lp.css`.

All 18 route shells returned 200 with the new entry and the exact six configured
security headers. All 12 generated JS/CSS files and all 22 portraits matched the
production-configured local build byte-for-byte by SHA-256. An independent
read-only review confirmed deployment success, five live routes, and the entry,
E-Board JS/CSS, and hero photo hashes. These checks include the existing student,
recruiter, and admin route shells but do not establish authenticated rendering
or browser behavior. Subsequent documentation-only commits may advance main
without changing these verified runtime assets.

## Published behavior

- `/eboard` uses the lazy-loaded `src/pages/EboardRedPolos.jsx` and its CSS
  module. `/eboard-preview` redirects to `/eboard`; the prototype's comparison
  link is removed.
- `src/data/eboard.js` contains all 19 original public profiles and their
  existing names, roles, majors, year labels, internships, and Lotería labels.
  Shared portraits identify members in the owner's corrected left-to-right
  order. The original `Eboard.jsx` remains an unrouted legacy reference.
- The owner-requested badge, copy, section/card numbering, and clipped bottom
  sun are removed. The top photo is straight; the event invitation uses a
  simple bordered panel. Card hover animation remains absent.
- Exactly 22 optimized 640px/1440px WebPs ship, totaling 3,079,150 bytes. Their
  image chunks contain no EXIF/XMP metadata. Original-resolution photos remain
  outside `public` and Git-ignored.

## Verification and limits

Read-only code, security, and deploy-preflight reviews found no release blocker;
the integrated code/security reviews confirmed recruiting, protected routes,
backend files, dependencies, and deployment policy match pre-release main.
Roster equality, one occurrence per member, photo paths, image widths, and CSS
references were checked programmatically.

Fresh final checks passed 616 tests in 58 files, lint, all five Edge bundles,
whitespace, and the production-configured Vite build. Only the three approved
public frontend values were supplied; no service credentials entered the build.
All 18 route shells returned 200 from the local production-header preview with
the exact six configured headers and expected entry `/assets/index-DjxDcHB0.js`.
All 12 generated JS/CSS assets and all 22 portraits matched the built files by
SHA-256. One-off server-rendered DOM checks verified complete unique profiles,
requested removals, anchor targets, the event link, and route declarations;
server-renderer/development-server warnings are not a browser acceptance test.

The production dependency audit has zero findings. The full audit retains the
same 15 development-tool findings (13 high, two moderate) documented in the
recruiting release. These affect Vite, Vitest/mocker, Tailwind and its
glob/watcher/transformation dependencies, PostCSS selector parsing, and source
maps during development/build/test work. No dependency or lockfile changes are
included; toolchain upgrades remain separate maintenance rather than an
unreviewed major-version change in this design release. Existing mixed-import
and large-chunk build warnings remain. The separate hosted checks are recorded
above; the preceding preflight results are local evidence.

Browser control was not approved during the design work. Real desktop/mobile
rendering, clicked navigation, image-failure handling, and keyboard review remain
unverified; HTTP/DOM checks do not establish those outcomes. The owner reviewed
the local design and approved publication. Existing recruiting browser/Turnstile
acceptance remains separate and is not established by this E-Board release.

## Rollback

Restore only this release's E-Board routing/layout/data/assets through a focused
revert/new commit and a normal deployment. The original public layout is in
pre-release commit `00b081d` and retained in `src/pages/Eboard.jsx`. Reverting
the production-adoption commit `803f7a4` restores the original public route and
leaves the separate preview and recruiting release intact. Do not reset
or force-push `main`, undo the recruiting release, or remove private originals.
No backend rollback or migration is needed for this frontend-only change.

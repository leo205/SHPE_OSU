# Recruiting interests — local UI comparison

Connected follow-up: see [recruiting-integration.md](recruiting-integration.md)
for the implemented real-client flow, isolated Supabase rehearsal, and pending
hosted rollout. This document records the separate fictional comparison mode.

Branch: `codex/resume-company-interests-preview`.
Worktree: `/Users/leonardomedina/Documents/SHPE_web/shpe-recruiting-preview`.
Prepared November 17, 2026. This is a local interactive prototype with fictional
data, not a deployed company-interest feature or a new authorization boundary.

## Agreed behavior

Students can optionally select multiple recruiting companies during resume
submission. These choices express interest. Authorized recruiters can browse
all approved students and switch to **Interested in us** to see explicit matches
for their own company. An empty selection means **No preferences provided**;
it must not be presented as rejection or automatically mark all companies.

A pending resume revision and its interests remain separate from the currently
approved version. Approval switches them together. Normalized email groups
revisions, but a submission UUID identifies a version. Entering an email does
not prove ownership or grant permission to edit someone else's approved data.

Students can also supply an optional LinkedIn public-profile URL. It is reviewed
and published with the resume revision. Approved recruiter listings show name,
major, graduation year, resume action, and a LinkedIn link when supplied. Missing
profiles remain blank with a clear label; students can submit without LinkedIn.
URL checks accept bounded HTTPS LinkedIn `/in/` profiles and strip tracking data.
This checks URL format, not profile existence or ownership. Sample profile URLs
in the demo are fictional placeholders and may not resolve on LinkedIn.

## Intended connected pages and access

The local preview now uses separate role-specific paths. There is no cross-role
screen switcher or company picker. Only the admin pages show admin navigation
and a **Reset sample data** action. The recruiter page uses a fixed fictional
JPMorgan Chase account, representing a server-assigned company in production.

- **Students:** a separate submission page, extending `/resume-upload`, with
  profile details, LinkedIn, PDF, and optional company interests.
- **Recruiters:** their `/company/dashboard` after recruiter login, showing
  their assigned company's directory, interest/all-student tabs, filters,
  resume access, and LinkedIn. They cannot switch company identity or access
  review/company management.
- **Admins:** the existing admin sidebar lists **Resume**, **Resume book**, and
  **Recruiting companies** as separate items in that order. **Resume** opens
  submission review. The duplicate in-page navigation is removed. Mobile keeps
  the four primary tabs, with resume-book/company links below when Resume is
  open. The connected version must enforce the admin role in server/database
  operations as well as routing.

The local prototype intentionally uses fictional data and does not implement
these new connected permissions. Existing live authorization is unchanged.

## Run and compare

The existing dependencies are sufficient; no package versions were changed.
This worktree currently reuses the original checkout's `node_modules` through
an ignored local symlink. On another checkout, install from the lockfile.
No `.env`, Supabase keys, recruiter login, or network service is required.

```bash
npm run dev:recruiting-preview
```

- Student form: <http://127.0.0.1:5174/resume-upload>
- Recruiter portal: <http://127.0.0.1:5174/company/dashboard>
- Admin submissions: <http://127.0.0.1:5174/admin?tab=resume&section=submissions>
- Admin resume book: <http://127.0.0.1:5174/admin?tab=resume&section=book>
- Admin companies: <http://127.0.0.1:5174/admin?tab=resume&section=companies>

Direct loads and refreshes work on both the isolated Vite dev and preview
servers. `/admin/resumes` and `/admin/recruiting-companies` redirect into the
appropriate Resume subsection. Old `recruiting-preview.html?view=...` links also
redirect to the corresponding new page. A query parameter cannot change the
role screen of the dedicated student or recruiter path.

Use **Use sample details** on the student form, select companies, and submit.
The sample enters the pending queue. Open the separate admin-review URL, approve
it, then open the recruiter URL to see the counts and lists change. Recruiters
have no links or controls for switching to the student/admin screens. Real
authorization is still a separate production-integration requirement.

There are eight approved fictional students and two pending submissions at
startup. JPMorgan Chase initially has three explicit matches. One pending
submission is a revised Student A: approving it demonstrates replacing that
student's previously approved interests without inflating the student count.
The sample company names follow the provided mockups and do not establish
chapter sponsorship, active recruiter accounts, or access to actual resumes.

Submitted sample metadata and catalog changes are stored only in this browser
under the versioned `shpe-recruiting-preview:v1` key. They are shared across
these same-origin pages/tabs and expire after two hours without changes.
**Reset sample data** on an admin page restores the fixtures. Saved records are
bounded and reconstructed from known fields; corrupt/expired data resets safely.
Blocked storage falls back to in-memory operation, which cannot survive refresh
or synchronize another tab. Unfinished form drafts reset when leaving the form.
Use fictional details only: this local storage is not a security boundary and
all four URLs are unprotected previews. No File/Blob, file bytes, credentials,
or production records are stored or sent. The file picker performs local
size/MIME/header feedback only. It does not perform the production backend PDF screen.
**Use demo resume instead** permits review without selecting a personal file.
Admin pending and approved rows, the admin resume-book preview, and recruiter
listings have **View PDF** links that open directly in a new tab. There is no
intermediate dialog or text-resume option. This local prototype uses a clearly
labeled generic sample PDF. It does not open the file selected in the form;
actual bytes are still not retained. The sample PDF contains fictional
experience unrelated to the selected submission. The
connected admin page already has private signed PDF viewing; wiring the new
layout to that lifecycle is future work after this UI is approved.

The main application entry, original upload form, recruiter portal, Supabase
handlers/SQL, and E-Board worktree are untouched. The shared `AdminDashboard`
accepts an optional Resume workspace/notice used only by this preview; its
normal default still renders the existing connected table. The standalone
HTML/entry and Vite config keep the experiment out of the normal production
module graph (the public sample PDF fixture is copied as an unused public asset).
`npm run build:recruiting-preview` creates ignored `dist-recruiting-preview/`.
The usual `npm run build` still builds the original app.

The admin shell is lazy-loaded in this preview. Its transitive Supabase imports
are replaced by a preview-only Vite resolver with an inert local adapter. It
loads empty records for the other admin tabs, simulates sign-in and empty cleanup,
and rejects writes, Storage access, and other RPC/Edge actions. No credential
configuration or production network client enters the preview graph.

The dev server's role-specific paths are mapped only by
`vite.recruiting-preview.config.js`; this does not install routes or permissions
in the live application. The normal production output excludes this entry.

## Boundaries for a future connected implementation

These are follow-up requirements, not claims about the prototype's security:

1. Create a stable recruiting-company catalog maintained by admins. It can
   reference public branding, but public sponsor publication/archival must not
   provision or revoke recruiter access. Hiding a choice affects future
   selections, not saved history or account permissions.
2. Map verified recruiter Auth users to company IDs in an admin-controlled
   membership table. Multiple recruiters can belong to one company. The server
   derives the company; a browser dropdown cannot choose data-access authority.
3. Store `resume_id` / `company_id` relationships privately with unique pairs.
   Return only the current company's interest flag to a recruiter. Never add
   all selected IDs to the current recruiter-readable `resumes` projection.
   Keep raw preferences/admin review private and counts limited to approved
   unique students. Missing historical preferences remain unspecified.
4. Carry bounded, validated, sorted/deduplicated company IDs through the
   protected multipart Edge submission, fingerprint, reservation, and atomic
   queue operation. An edited selection changes draft identity. Preserve
   action-bound Turnstile, verified-only quotas, PDF screening, and private
   immutable upload paths. Do not add a direct browser database/Storage path.
   Carry the optional LinkedIn URL through server validation, fingerprinting,
   queueing, admin review, and the approved-revision projection too; older rows
   with no profile must remain compatible.
5. Publish interests with the approved revision in the same lifecycle. Pending
   replacements leave approved metadata, files, and interests available. Retired
   relationships must follow the existing revision lifecycle without bypassing
   transactional file cleanup, leases, or permanent tombstones.
6. Define compatibility for old tabs/clients without interest fields before
   changing the live endpoint. An old form must not silently erase existing
   preferences. Additive SQL and compatible Edge handling precede frontend
   rollout. Rehearse RLS, own-company-only reads, approval/replacement,
   idempotency, Storage access, and failure/retry behavior in isolated fixtures.
7. Preference-only student editing can follow a verified-email/login design.
   The current public upload does not authenticate email ownership; do not add
   email-based lookup or overwrite as a shortcut.

The UI comparison does not require production migrations, account creation,
emails, or real student uploads. Those operations need their own reviewed
implementation and target authorization after the design is accepted.

## Verification

- Sidebar follow-up: lint, both builds, and a one-off DOM integration flow
  passed. Checks covered sidebar order and single-item highlighting, mobile
  resume links, no duplicate in-page navigation, canonical/legacy URLs and
  browser Back, status-tab order, direct PDF links, approval, company management,
  and recruiter/student separation, with zero service fetches. Targeted read-only
  review found no actionable issues. Visual browser/mobile QA remains pending.
- Direct-PDF follow-up: lint, the isolated preview build, and a one-off DOM
  integration flow passed. Pending/approved admin rows, admin resume-book rows,
  and recruiter rows expose **View PDF** links with the sample PDF target,
  `target="_blank"`, and `rel="noopener noreferrer"`. No resume dialog or text
  option remains. Approval, company management, and navigation still passed;
  no service fetches occurred. Actual new-tab browser rendering was not checked.
- Admin integration follow-up: lint, all 494 tests in 50 files, the normal build,
  and the isolated preview build passed. A one-off DOM flow exercised the actual
  admin shell, legacy redirects, pending and approved viewing, sample PDF target,
  the original modal Escape/focus return, approval propagation, catalog creation/availability,
  admin company preview, and browser Back into the correct section. Student and
  recruiter screens had no admin navigation or company-identity selector; no
  service fetches occurred. Read-only review's navigation finding was fixed and
  rechecked. `/admin?tab=resume` returned HTTP 200 on the existing dev server.
- The sample PDF was rendered and visually inspected as a one-page fictional
  specimen. The original inline viewer/text alternative was subsequently removed
  in favor of direct **View PDF** links. Native browser PDF display and responsive
  visual QA remain pending.
- Separate-page follow-up passed: direct HTTP loads of all four URLs on the
  development and built-preview servers; role-specific DOM rendering; no
  student/admin navigation, company picker, or reset action on the recruiter
  page; admin-only local navigation between the initial two admin views; legacy link
  redirects; query parameters do not switch a dedicated path's screen.
- A fresh-module DOM flow verified sample submission on the student page,
  independent loading of the admin page, approval, and independent loading of
  the recruiter page with updated counts/LinkedIn. Company additions also
  reached a freshly loaded student page. No fetch calls occurred.
- Session-store assertions covered cross-instance storage events, bounded
  reconstruction, corrupt/expired state, malformed references/LinkedIn,
  duplicate approved emails, expiry, and blocked-storage fallback.
- Lint, all 494 existing tests, standalone build, and whitespace checks passed
  again after the page split. Browser visual review remains pending.
- Lint and the existing 494 tests in 50 files passed.
- The initial standalone preview build imported no production application
  module. It now reuses the admin layout with the isolated adapter described
  above; no credential-bearing Supabase client, Turnstile, EmailJS, or analytics
  enters the preview build.
- One-off React DOM checks exercised optional multi-select, submission into
  pending state, approval, updated counts, both recruiter tabs, search/no-match,
  company switching/reset, catalog addition, sample modal/Escape/focus return,
  and demo reset. They observed zero fetch calls.
- Model assertions covered normalized email grouping, active catalog
  validation, pending isolation, approval replacement, omitted/duplicate
  choices, independent resets, and company-scoped projections.
- LinkedIn follow-up checks passed: optional/missing values, accepted public
  profile URL normalization, rejected foreign/malformed URLs, revision-bound
  approval, form-to-review-to-recruiter propagation, safe new-tab links, and
  missing-profile UI. Lint, all 494 tests, and the preview build passed again.
- The local preview HTML returned HTTP 200.
- The normal frontend build, all five Edge bundle checks, and whitespace checks
  passed. Existing normal-build large-chunk/mixed-import warnings remain.
- Production dependency audit returned zero findings. The full audit reports
  five existing development-tool findings (three moderate, two high) in
  Vitest/mocker, postcss-selector-parser, source-map-js, and Vite. No dependencies
  were changed; resolving those findings remains a separate maintenance task.
- Read-only code review found a filename-extension mismatch in the mock model;
  it was corrected so a locally validated PDF is not rejected for lacking a
  `.pdf` filename suffix. Production upload behavior remains unchanged.
- Browser automation was unavailable. Real desktop/mobile visual review is
  pending; DOM/HTTP checks do not establish it. No production action occurred.

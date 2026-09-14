# SHPE OSU Website — Working Context

Read this first. It is the orientation for anyone — human or AI — picking this
project up cold.

---

## What this is, and who it serves

The website for the **Society of Hispanic Professional Engineers chapter at The
Ohio State University**. Live at <https://www.shpeosu.com>, deployed from `main`
via Vercel.

SHPE's mission is to empower the Hispanic community to realize its fullest
potential and to impact the world through STEM awareness, access, support, and
development. This site is how the chapter does that day to day. Every decision
should be weighed against whether it helps one of these four people:

| Who | What they need |
|---|---|
| **A student who has never heard of SHPE** | To find out what it is, whether they belong, and how to show up |
| **A member** | To check in at meetings, get their resume in front of recruiters, find resources |
| **A corporate recruiter** | To browse approved student resumes and sponsor the chapter |
| **The E-Board** | To run events, review resumes, and see attendance analytics — **without writing code** |

That last one matters more than it looks. The E-Board turns over every year and
its members are not developers. Anything they need weekly must be doable from
the Admin Dashboard, not by editing a file and pushing a commit.

---

## The three rules

**1. The client cannot enforce access.** The Supabase anon key ships inside the
public JS bundle. Anyone can call the database API directly and skip the
interface entirely. A check written in a React component decides what gets
*rendered*, never what is *reachable*. Every real vulnerability found in this
project has been a variation of forgetting this — most memorably a resume book
gated on a `sessionStorage` token, which meant every student's resume was
downloadable by anyone. Authorization lives in Postgres RLS/service-only RPCs;
public-write abuse controls live in Edge Functions with server-verified
Turnstile and durable database limits. See `supabase/README.md`.

**2. Some values are already written into production data.** Changing them
silently corrupts history in ways that look fine until someone runs a report.
The full list is in `REWRITE.md` §6; the two that bite most often:

- The check-in label format `` `${M}/${D} - ${title}` `` — this exact string is
  stored in `attendance.event_name` and the admin dashboard **groups by it**.
- The `Other – x` major format uses an **en dash**. It already drifted once
  (one writer used a hyphen), so any filter matching one form missed half the rows.

**3. Lint and build catch less than you think.** Both passed while the sponsor
contact form was completely broken in production, while calendar exports put
every event at 2 AM, and while "View PDF" opened a blank tab and hijacked the
current one. **Click the thing you changed.**

---

## Current state

This is the verified production baseline as of **2026-09-13**. The protected
submission rollout is complete in the Supabase project and the matching Vercel
frontend is live from `main`.

### September 14 follow-up — implemented locally, rollout pending

- All three public handlers now verify Turnstile before consuming any durable
  shared-network, identity/email, or global allowance. Invalid tokens cannot
  lock out a campus NAT; pre-Siteverify flood protection requires the hosting
  gateway. Verified submissions retain the existing durable limits.
- Resume uploads now receive bounded structural/active-content PDF screening
  after verification and quotas, before reservation/Storage. The backend-only
  parser accepts static PDFs up to ten pages within the existing 10–250 KB
  range. This is not antivirus or an identity check.
- `resume-cleanup.sql` transactionally queues paths retired by approval or
  deletion. The admin-only `cleanup-resume-files` endpoint processes private
  detached files with leases and permanent path tombstones. Retries run on
  admin visits/actions or the retry button; no cron is configured.
- `npm test` includes actual lifecycle/cleanup SQL executed in isolated
  PostgreSQL through PGlite, alongside the handler and PDF regressions.
- Apply cleanup SQL, deploy all four Edge Functions, then deploy the matching
  frontend. Existing files are not automatically deleted/backfilled. See
  `supabase/README.md` for the pending rollout and live verification checklist;
  do not label these additions live before that evidence is recorded.

### September 14 quality follow-up — implemented locally, not deployed

`fix/quality-review-followups` is stacked on security follow-up commit `749ac0e`.
This quality work introduces no backend changes; the security rollout above
remains pending and still governs deployment of the combined branch.

- Admin datasets load every counted page before replacing displayed data.
  Failed or incomplete loads show an error and retry control; reports and
  exports stay unavailable until their dataset finishes loading.
- Admin table dates reuse one formatter with the existing locale, display
  format, and browser-local timezone unchanged.
- Each same-day calendar event has its own button. An overflow control opens
  the complete day list, with focus returned when the list or event closes.
- Sponsor drafts tolerate blocked storage and malformed saved fields; optional
  draft cleanup cannot turn an accepted inquiry into an error.
- Professional-development counter timers stop on unmount and can restart
  after React StrictMode replays their effects.

### Live production baseline

- **Resume book is closed.** Was fully downloadable by anyone — verified by
  fetching a real student's PDF anonymously. Recruiters now sign in with real
  Supabase Auth accounts; access is gated on an explicit role claim, not on
  merely being signed in.
- **Sponsor contact form works through Edge.** The browser no longer contacts
  EmailJS or contains its provider key. The current EmailJS Free account does
  not provide a private key, so non-browser API access is enabled, strict/private
  key mode is off, the public key was rotated during cutover, and the replacement
  is held only in Supabase Edge secrets.
- **Resume replacement works**, for the first time. The old client issued an
  `UPDATE` no policy permitted, which under RLS affects zero rows and *returns
  success*, so students saw "Upload Successful" while nothing changed.
- **Events have one source.** Admins can add, edit, or delete them in the Admin
  Dashboard → Supabase `events` table → read by both the public calendar and the
  check-in dropdown via `src/lib/events.js`.
- **Heavy routes are code-split.** The admin dashboard, recruiter dashboard, and
  professional-development page are loaded lazily instead of being included in
  every visitor's initial bundle.
- **Vercel Web Analytics is integrated.** `src/main.jsx` mounts the React
  `Analytics` component once for site-wide page-view tracking. The Vercel project
  must have Web Analytics enabled, and data begins only after deployment and a
  production visit; localhost is for integration testing, not traffic data.
- **Sponsors** are Honda, Burns & McDonnell, Lincoln Electric, Whiting-Turner and
  Gresham Smith, grouped by the tiers the chapter actually sells.
- **Attendance, resume upload, and sponsor inquiry** enter through separate
  Supabase Edge Functions. Each verifies an action-bound Turnstile token and
  uses service-only RPCs plus HMAC-keyed durable rate limits. The browser no
  longer has a direct attendance/resume write or EmailJS provider route.
- Resume files are reserved and named server-side, remain private, and new
  revisions stay pending without de-listing an already approved resume. Admin
  approve/delete operations are atomic RPCs.
- Sponsor mail makes exactly one authenticated server-side EmailJS request.
  Provider timeouts are reported as delivery-unknown and never auto-retried.
- The Google outage fallback puts no attendee identity or demographics in its
  URL. Its Sheet is untrusted/manual-only and must never feed the leaderboard
  automatically.
- The project owner explicitly re-approved the original GroupMe invitation on
  2026-09-03. Keep its exact destination synchronized on Home, Footer, and the
  first-attendance success screen; a new destination, invite QR, or equivalent
  join route still requires explicit project-owner approval.
- React Router 7.18.3, Vite 7.3.6, and Vitest 3.2.x clear the dependency audit;
  Vite still targets Safari 14 explicitly. The automated suite covers browser,
  Edge, SQL-contract, and regression behavior, with a separate Edge bundle
  check.
- **The public leaderboard is capped at ten in Postgres**, exposes exactly
  `first_name`, a SQL-derived one-character `last_initial`, and distinct-event
  `count`, and cannot be expanded by asking the API for more rows. The stored
  surname/dot number remains private.
- **The final attendance and resume lockdowns are active.** Anonymous direct
  attendance writes, resume metadata writes, resume Storage uploads, and the
  legacy `submit_resume()` RPC are denied. Authenticated admin operations remain
  available.
- **Live smoke tests passed.** Attendance succeeded before and after lockdown;
  sponsor inquiry delivered through EmailJS; and a real resume completed the
  upload, admin view, approval, and deletion lifecycle. The disposable rows and
  file were removed afterward.

## What is open

1. **Upcoming events need to be added.** The first two Autumn 2026 events have
   passed. The E-Board will add the next dates through the Admin Dashboard; the
   bundled list in `src/data/events.js` is only the outage fallback.
2. **No sponsor accounts exist yet**, so the corporate portal is not in use.
   Creating one is two steps and people forget the second — see `HANDOFF.md` §4.
3. **Attendance identity and presence are not proved.** Turnstile, canonical
   events, duplicate suppression, and durable limits make automated poisoning
   harder, but a person can still claim another dot number or invent identities.
   Strong leaderboard integrity needs an approved identity/presence mechanism
   such as OSU SSO, an event-scoped rotating secret, or admin review. The earlier
   form-lock idea remains deliberately deferred.
4. **Resume/sponsor email ownership is not proved.** Turnstile proves a human,
   not control of the claimed address. Resume revisions stay pending and cannot
   displace an approved row automatically, but admins must still verify identity
   before approval. Full closure needs OSU SSO or an emailed OTP.
5. `PublicLeaderboard.jsx` is committed but imported nowhere. Delete or mount.
6. **Gateway client-IP provenance is not fully proved.** Network limits are
   defense in depth until a future staging environment can demonstrate which
   forwarding header Supabase overwrites and ignores when conflicting values
   are supplied.
7. `AdminDashboard.jsx` still contains five tabs in one large file. Splitting it
   remains worthwhile, but is not an emergency.

---

## Gotchas that have already cost real time

- **`vercel.json` headers only apply on Vercel.** `vite.config.js` mirrors them
  onto `npm run preview` for exactly this reason. Test header-sensitive things
  there, never on `npm run dev`.
- **Edge CORS origins are exact.** `PUBLIC_SITE_ORIGINS` must enumerate any
  approved Vercel preview URL; arbitrary `*.vercel.app` origins are rejected.
  CORS is containment, not authentication—Turnstile and server-side limits are
  still mandatory for clients that omit or spoof `Origin`.
- **Cloudflare dummy keys are local-only.** Edge rejects the official test
  secrets when `SUPABASE_URL` is hosted. Never work around that check or copy
  `dummy-key-pass` into a deployed hostname allowlist.
- **EmailJS Free has no private key in this account.** Production therefore has
  non-browser API access on and private-key/strict mode off. The public key was
  rotated at cutover, exists only in Edge secrets, and the retired browser key
  was verified invalid. If EmailJS later exposes private-key enforcement, add
  the private key and enable strict mode together.
- **The Google fallback is quarantined.** It is public and independently
  callable. Never auto-import its Sheet; manually validate the canonical event
  and de-duplicate rows. Only an event label may ever be placed in its URL.
- **The original GroupMe invitation is approved.** On 2026-09-03 the project
  owner explicitly reversed the earlier removal instruction and restored the
  original destination in three public placements. Do not silently change the
  URL or add a QR/equivalent invite route without new explicit approval.
- **Every URL returns HTTP 200** because of the SPA catch-all rewrite. To tell a
  real asset from a deleted one, check `content-type` — `text/html` means it is
  the app shell, i.e. the file is gone.
- **No global `scroll-behavior: smooth`.** It applied to the scroll-to-top on
  every route change, so navigation animated up from wherever you were. In-page
  anchors opt in via `src/lib/scroll.js` instead.
- **Never pass `behavior: 'instant'`** to a scroll call. `ScrollBehavior` is a
  WebIDL enum, an unrecognised member *throws* rather than being ignored, and
  `'instant'` only shipped in Safari 15.4. This build targets safari14 and has no
  error boundary, so a throw unmounts the whole app — a blank page on every route.
- **`window.open()` returns `null` when passed `noopener`.** Open the tab, then
  set `tab.opener = null`, then assign `tab.location`.
- **The attendance QR code is static and never expires** (`qr/`, regenerate with
  `npm run qr`). The real risk is `shpeosu.com` lapsing — it expires 2027-05-18
  and every printed code dies with it.
- **A PostgREST `DELETE`/`UPDATE` matching zero rows returns success** whether or
  not a policy permits it. Write policies cannot be probed from outside; query
  `pg_policies` instead.

---

## Layout

```
src/
├── pages/         one file per route (AdminDashboard is ~1400 lines, 5 tabs)
├── components/    Navbar, Footer, ScrollToTop, ProtectedRoute, TurnstileWidget
├── lib/           domain helpers + protected submission clients and tests
└── data/events.js bundled fallback when Supabase is unreachable
supabase/
├── functions/     three public submission handlers + admin-only file cleanup
└── *.sql          applied production definitions and historical migrations
.claude/agents/    three read-only reviewers (see below)
```

`src/lib/` is the closest thing to a domain layer and is where the rewrite starts.

## Docs

| File | For |
|---|---|
| `README.md` | What the site is and how to run it |
| `HANDOFF.md` | Operations: DB schema, onboarding sponsors/admins, semester rollover |
| `supabase/README.md` | **The security model. Authoritative.** |
| `REWRITE.md` | Plan for the ports-and-adapters rewrite, and the data contracts |

## Before pushing

**Always work on a branch unless the project owner explicitly says to work on
`main`.** Start from an up-to-date `main`, create a focused branch, and keep
production unchanged until the work has been reviewed locally and merged.

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

```bash
npm run lint     # a real gate — it was once allowed to rot to 93 errors
npm test
npm run check:edge
npm run build
npm run preview  # serves dist WITH the production security headers
npm audit --omit=dev
npm audit
```

For ordinary UI review, run `npm run dev` and open
<http://localhost:5173>. For production-header/CSP verification, use
`npm run build && npm run preview` and open the URL Vite prints (normally
<http://localhost:4173>).

Three project subagents live in `.claude/agents/` — `security-auditor`,
`code-reviewer`, `deploy-preflight`. They are read-only and preloaded with this
codebase's actual failure modes. Between them they have caught a role-gating hole
that would have left the resume book open, a check-in bug that would have
stranded an entire GBM, and a timezone error that only misfired during meeting
hours — all in work that had already been reviewed by hand and passed both gates.
Use `security-auditor` after touching Supabase and before any release.

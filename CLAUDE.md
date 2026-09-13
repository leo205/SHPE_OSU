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
downloadable by anyone. Enforcement lives in Postgres RLS. See
`supabase/README.md`.

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

Everything below is live and verified.

- **Resume book is closed.** Was fully downloadable by anyone — verified by
  fetching a real student's PDF anonymously. Recruiters now sign in with real
  Supabase Auth accounts; access is gated on an explicit role claim, not on
  merely being signed in.
- **Sponsor contact form works.** Had been silently failing — the CSP omitted
  `api.emailjs.com`, invisible locally because those headers only apply on Vercel.
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

## What is open

1. **Upcoming events need to be added.** The first two Autumn 2026 events have
   passed. The E-Board will add the next dates through the Admin Dashboard; the
   bundled list in `src/data/events.js` is only the outage fallback.
2. **No sponsor accounts exist yet**, so the corporate portal is not in use.
   Creating one is two steps and people forget the second — see `HANDOFF.md` §4.
3. **Resume ownership is not proved.** A submission is keyed on email, so someone
   who knows another student's OSU address can replace their pending entry. The
   replacement is forced back to unapproved, which bounds but does not solve it.
4. `PublicLeaderboard.jsx` is committed but imported nowhere. Delete or mount.
5. **There is no automated test suite yet.** `REWRITE.md` Phase 0 lists the
   regression tests to add before restructuring the data layer.
6. `AdminDashboard.jsx` still contains five tabs in one large file. Splitting it
   remains worthwhile, but is not an emergency.

---

## Gotchas that have already cost real time

- **`vercel.json` headers only apply on Vercel.** `vite.config.js` mirrors them
  onto `npm run preview` for exactly this reason. Test header-sensitive things
  there, never on `npm run dev`.
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
├── components/    Navbar, Footer, ScrollToTop, ProtectedRoute
├── lib/           supabase, auth, events, calendar, majors, navigation, scroll
└── data/events.js bundled fallback when Supabase is unreachable
supabase/          the database security model — READ ITS README FIRST
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
npm run build
npm run preview  # serves dist WITH the production security headers
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

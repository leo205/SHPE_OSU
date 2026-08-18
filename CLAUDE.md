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
- **Events have one source.** Admin Dashboard → Supabase `events` table → read by
  both the public calendar and the check-in dropdown via `src/lib/events.js`.
- **Sponsors** are Honda, Burns & McDonnell, Lincoln Electric, Whiting-Turner and
  Gresham Smith, grouped by the tiers the chapter actually sells.

## What is open

1. **Autumn events are not in the database.** Until someone adds them via the
   Admin Dashboard, the check-in dropdown has nothing current to select. Blocking
   for the first GBM.
2. **No sponsor accounts exist yet**, so nobody can use the corporate portal.
   Creating one is two steps and people forget the second — see `HANDOFF.md` §4.
3. **Involvement-fair landing page** — designed, not built. See below.
4. `PublicLeaderboard.jsx` is committed but imported nowhere. Delete or mount.
5. Bundle is one ~950 KB chunk; `/admin` should be code-split.

## Active work — the involvement-fair page

A page for a QR code at the involvement fair booth, aimed at someone who has
**never heard of SHPE**. Design decided, blocked on content from the E-Board.

Agreed so far:

- It is a **45-second funnel**, not a page. The reader is standing up, one-handed,
  on congested wifi, and probably never returns. Every extra thing added reduces
  the chance they do the one thing that matters.
- **Primary action: join the GroupMe.** Everything else is visually subordinate.
- **Answer "do I belong here?" above the fold** — *do I have to be Hispanic?* (no)
  and *do I have to be an engineer?* (no). That is the actual barrier, and orgs
  consistently under-answer it.
- URL should be short and sayable, e.g. `/join`.
- **The First-Year Guide is 6.6 MB.** At 2,000 scans that is ~14 GB of a 100 GB
  monthly budget, and 30–60 seconds of waiting per person. Do not make it the
  primary button; compress it if possible.
- **Code-split this route.** Every scanner currently downloads the entire app —
  including the admin dashboard and Recharts — to read one page.

Still needed from the E-Board: the one-line "what is SHPE" in their own words,
and autumn event dates.

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

```bash
npm run lint     # a real gate — it was once allowed to rot to 93 errors
npm run build
npm run preview  # serves dist WITH the production security headers
```

Three project subagents live in `.claude/agents/` — `security-auditor`,
`code-reviewer`, `deploy-preflight`. They are read-only and preloaded with this
codebase's actual failure modes. Between them they have caught a role-gating hole
that would have left the resume book open, a check-in bug that would have
stranded an entire GBM, and a timezone error that only misfired during meeting
hours — all in work that had already been reviewed by hand and passed both gates.
Use `security-auditor` after touching Supabase and before any release.

# SHPE OSU Website — Rewrite Plan

_Written 2026-08-03, against the codebase as it stands after the July–August
security work._

_Status reviewed 2026-08-30. The rewrite phases have not started. Route-level
code splitting was completed independently and should be preserved._

This is the working document for rebuilding the site on a hexagonal
(ports-and-adapters) architecture. It is written to be handed to someone starting
a fresh project with the existing UI, so it deliberately over-explains the parts
that are easy to get wrong.

---

## 0. Read this before you start

### The plan is: keep the UI, rebuild the data layer

Not a from-scratch rewrite. The presentation layer works, looks good, and
represents real design effort. The problems are all below it.

That distinction matters because **full rewrites of working software usually go
badly.** You lose every undocumented fix that accumulated in the old version, and
you find out which ones mattered when a student can't check in at a GBM. This
plan is structured so you never have a half-working site: each phase ships, and
the old code keeps running until the new path is proven.

### Is this worth doing at all?

Honestly: the site works today. Nothing here is urgent. Do it if you want the
codebase to be teachable and survivable across E-Board turnover — those are good
reasons. Don't do it because the current code is "bad." It isn't; it's just
arranged so that every page talks directly to the database.

The one measurable argument: **Supabase calls are spread across 9 files, 15 of
them in `AdminDashboard.jsx` alone.** That is the coupling this fixes.

### The single most important thing in this document

Section 6 — **Contracts That Must Not Change**. Those are the values already
written into production data. Break one and you silently corrupt history in ways
that look fine until someone runs a report. Read it before you write any code.

---

## 1. Where the code is today

### Routes (14, including the fallback)

| Route | Page | Auth |
|---|---|---|
| `/` | Home | public |
| `/events` | Events calendar | public |
| `/eboard` | E-Board roster | public |
| `/sponsors` | Sponsor tiers + contact form | public |
| `/resources` | Resource hub | public |
| `/professional-development` | Prof dev hub | public |
| `/attendance` | Student check-in | public (unlisted) |
| `/resume-upload` | Student resume upload | public (unlisted) |
| `/company` | Sponsor login | public |
| `/company/dashboard` | Resume book | sponsor |
| `/admin/login` | Admin login | public |
| `/admin` | Admin dashboard (5 tabs) | admin |
| `/admin/resumes` | redirect → `/admin?tab=resume` | admin |
| `*` | falls through to Home | — |

### File sizes — where the weight is

```
1741  pages/AdminDashboard.jsx     ← 5 tabs, 15 Supabase calls, still the main split target
 648  pages/Events.jsx
 678  pages/Sponsors.jsx
 653  pages/ProfessionalDevelopment.jsx
 599  pages/Attendance.jsx
 412  pages/Eboard.jsx
 379  pages/ResumeUpload.jsx
 373  pages/Home.jsx
 259  pages/Resources.jsx
 257  components/PublicLeaderboard.jsx   ← imported nowhere; dead
```

### Every data operation in the app

This is the complete surface the new architecture has to cover:

```
10 .from('resumes')          7  .from('events')
4  auth.signOut()            3  storage.from('resumes')
3  auth.getSession()         4  .from('attendance')
2  auth.signInWithPassword() 2  auth.onAuthStateChange()
2  .from('leaderboard')      2  .from('company_access')   ← vestigial
1  auth.updateUser()         1  .rpc('submit_resume')
```

Twelve distinct operations. That is the whole job — it is smaller than it feels.

### External services

- **Supabase** — Postgres, Auth, Storage
- **EmailJS** — sponsor contact form only
- **Vercel Web Analytics** — root-mounted React component for page views
- **Recharts** — admin analytics
- **lucide-react** + Material Symbols — icons

---

## 2. Target architecture

Hexagonal in the only sense that matters here: **the domain does not know
Supabase exists.**

```
┌─────────────────────────────────────────────────────────┐
│  UI  (React pages + components)                         │
│  Knows: hooks, props, rendering. Nothing about SQL.     │
└───────────────────────┬─────────────────────────────────┘
                        │ calls
┌───────────────────────▼─────────────────────────────────┐
│  Application  (use cases)                               │
│  submitResume() · checkIn() · listResumeBook()          │
│  Orchestrates. One function per thing a user can do.    │
└───────────────────────┬─────────────────────────────────┘
                        │ depends on PORTS (interfaces)
┌───────────────────────▼─────────────────────────────────┐
│  Domain  (pure)                                         │
│  Event · Resume · CheckIn · Member                      │
│  Validation, formatting, invariants. No I/O. Testable   │
│  with plain node, no bundler, no mocks.                 │
└───────────────────────┬─────────────────────────────────┘
                        │ implemented by ADAPTERS
┌───────────────────────▼─────────────────────────────────┐
│  Infrastructure                                          │
│  SupabaseResumeRepository · SupabaseEventRepository      │
│  EmailJsNotifier · SupabaseAuthGateway                   │
│  The ONLY files that import @supabase/supabase-js.       │
└─────────────────────────────────────────────────────────┘
```

### The test that tells you it's working

> Could you swap Supabase for a different backend by writing new files in
> `infrastructure/` and changing nothing else?

If yes, the architecture is real. If you have to touch a page, it isn't.

### Proposed structure

```
src/
├── domain/                    # PURE. No imports from outside domain/.
│   ├── event/
│   │   ├── Event.js               # shape + invariants
│   │   ├── eventLabel.js          # THE check-in label format (§6.1)
│   │   └── sortForCheckIn.js
│   ├── resume/
│   │   ├── Resume.js
│   │   ├── osuEmail.js            # domain rule, mirrored in SQL
│   │   └── fileConstraints.js     # 10KB–250KB, %PDF magic bytes
│   ├── attendance/
│   │   ├── CheckIn.js
│   │   └── major.js               # "Other – x" formatting (§6.2)
│   └── shared/
│       └── localDate.js           # local calendar date, NEVER toISOString (§6.4)
│
├── application/               # Use cases. Depends on ports, not adapters.
│   ├── ports/
│   │   ├── EventRepository.js     # interface + in-memory fake
│   │   ├── ResumeRepository.js
│   │   ├── AttendanceRepository.js
│   │   ├── FileStore.js
│   │   ├── AuthGateway.js
│   │   └── Notifier.js
│   └── usecases/
│       ├── submitResume.js
│       ├── recordCheckIn.js
│       ├── listResumeBook.js
│       ├── listEvents.js
│       └── sendSponsorInquiry.js
│
├── infrastructure/            # The ONLY place @supabase/supabase-js appears.
│   ├── supabase/
│   │   ├── client.js
│   │   ├── SupabaseEventRepository.js
│   │   ├── SupabaseResumeRepository.js
│   │   ├── SupabaseAttendanceRepository.js
│   │   ├── SupabaseFileStore.js
│   │   └── SupabaseAuthGateway.js
│   ├── emailjs/EmailJsNotifier.js
│   └── static/StaticEventRepository.js   # the bundled fallback
│
├── ui/
│   ├── pages/                 # Carried over from today, minus data code
│   ├── components/
│   ├── hooks/                 # useEvents, useSession — call use cases
│   └── providers/             # Dependency injection lives here
│
└── main.jsx                   # Composition root: wires adapters to ports
```

### Where dependency injection happens

One place, at startup:

```js
// main.jsx — the composition root
const deps = {
  events:     new SupabaseEventRepository(supabase, new StaticEventRepository()),
  resumes:    new SupabaseResumeRepository(supabase),
  attendance: new SupabaseAttendanceRepository(supabase),
  files:      new SupabaseFileStore(supabase),
  auth:       new SupabaseAuthGateway(supabase),
  notifier:   new EmailJsNotifier(EMAILJS_CONFIG),
};

<DependencyProvider value={deps}><App /></DependencyProvider>
```

Tests pass in-memory fakes instead. That is the entire payoff: **you can test the
whole application layer with no database and no network.**

---

## 3. What carries over, what gets rebuilt

### Copy across unchanged

- `public/` — every photo, the logo, the PDFs
- `tailwind.config.js` — the SHPE palette. **Verified WCAG AA on every pair; do
  not "improve" it.**
- `src/index.css`
- `src/data/events.js` — becomes the static fallback adapter
- All page JSX **markup** — the visual layer is fine
- `vercel.json` — but see §7 on the CSP
- `.claude/agents/` — the three reviewers

### Rebuild

- Every `supabase.*` call → adapters
- Every `useState` holding server data → use case + hook
- `AdminDashboard.jsx` → five separate tab components
- Validation scattered in components → `domain/`

### Delete

- `components/PublicLeaderboard.jsx` — imported nowhere
- `src/assets/` — empty Vite scaffolding
- `company_access` usage — the table is vestigial
- `profDevEvents` in ProfessionalDevelopment.jsx — 62 lines never rendered
  (decide: wire it up or drop it)

---

## 4. Phase plan

Each phase ends with a working, deployable site. **Never have both old and new
paths live for the same feature.**

### Phase 0 — Set up the safety net (do this first, do not skip)

Nothing else in this plan is safe without it.

1. `npm i -D vitest` and add `"test": "vitest run"`.
2. Write the tests in §5 **against the current code**, before moving anything.
   They must pass on today's codebase.
3. Add `npm test` to your pre-push routine alongside lint and build.

Rationale: these tests encode bugs that already shipped to production once. They
are the specification. If the rewrite passes them, it preserves the fixes; if you
write them afterwards, you will write them to match whatever you built.

### Phase 1 — Extract the domain (pure, no behaviour change)

Move `lib/events.js`, `lib/calendar.js`, `lib/majors.js` into `domain/`. Strip any
I/O. Pages still import them directly — no ports yet.

Ships: identical site. Tests still green.

### Phase 2 — Ports and adapters for ONE slice

Pick **events** — it is the best-understood and lowest-risk.

- Define `EventRepository` port + an in-memory fake
- `SupabaseEventRepository` + `StaticEventRepository` (fallback)
- `listEvents` use case
- `useEvents()` hook
- Point `Events.jsx` and `Attendance.jsx` at the hook

Ships: identical site, one slice converted. This is the phase where you learn
whether the abstraction is right — **if it feels awkward here, fix the shape
before doing the other four.**

### Phase 3 — Remaining slices

In this order, easiest first:

1. **Attendance** — one insert, one view read
2. **Auth** — session + role checks (`AuthGateway`)
3. **Resumes** — the RPC, file upload, signed URLs
4. **Sponsor inquiry** — EmailJS behind `Notifier`

### Phase 4 — Split AdminDashboard

Only now, with data access already behind ports. Five tabs → five files. This is
mechanical once phases 2–3 are done, and near-impossible before.

### Phase 5 — Clean up

Delete dead code and drop `company_access`. Route-level splitting for `/admin`,
the recruiter dashboard, and professional development was already completed
outside this rewrite. A 2026-08-30 build produced an initial JavaScript chunk of
about 484 KB plus a separate admin chunk of about 456 KB; preserve that boundary
and improve it only when measurements justify the work.

---

## 5. Write these tests first

Every one of these is a bug that reached production. They are not hypothetical.

### Domain — events

```
✓ eventLabel({date:'2026-09-03', title:'GBM #1'}) === '9/3 - GBM #1'
    THE format written to attendance.event_name. See §6.1.
✓ sortForCheckIn puts today's event first at 7:30 PM local
    Regression: toISOString() rolls to UTC tomorrow at 8 PM EDT, so
    tonight's GBM sorted BELOW next week's — during check-in hours.
✓ sortForCheckIn never returns empty when all events are past
✓ mergeEvents survives a null date without dropping every event
✓ mergeEvents prefers the DB row when title+date collide
```

### Domain — calendar export

```
✓ parseTime('6:00 PM') === '180000'      ✓ '12:00 AM' === '000000'
✓ '12:00 PM' === '120000'                ✓ garbage → null (not a crash)
✓ .ics carries DTSTART;TZID=America/New_York, never a bare Z
    Regression: was hardcoded 06:00Z = 2 AM Eastern on every export.
✓ Google URL dates match ^\d{8}T\d{6}/\d{8}T\d{6}$
    Regression: produced "600PM", unparseable.
✓ escapes ; , and newline per RFC 5545
```

### Domain — resume

```
✓ accepts @osu.edu, @buckeyemail.osu.edu, @alumni.osu.edu
✓ REJECTS spoof@osu.edu.evil.com     ← classic suffix-match bypass
✓ rejects <10KB and >250KB
✓ magic bytes: %PDF passes, anything else fails
```

### Domain — major

```
✓ formatMajor('Other','CS') === 'Other – CS'   (EN DASH, §6.2)
✓ formatMajor('Mechanical Engineering') passes through unchanged
```

### Application — use cases (with in-memory fakes)

```
✓ submitResume uploads the file BEFORE touching the existing record
    Regression: old code deleted the student's file and row first, so any
    later failure destroyed their resume.
✓ submitResume rolls back the upload if the DB write fails
✓ submitResume on an existing email replaces, does not duplicate
✓ recordCheckIn rejects an event not in the current list
✓ listResumeBook returns only approved resumes
✓ every use case surfaces errors — none may fail silently
    Regression: `if (!error) {...}` with no else was the repo's most
    common bug. An admin thought they had published a resume; they hadn't.
```

---

## 6. Contracts That Must Not Change

**These values exist in production data. Changing them corrupts history
silently.** Nothing in this section is a style preference.

### 6.1 The check-in event label

```
`${M}/${D} - ${title}`        e.g.  "9/3 - Autumn GBM #1"
```

This exact string is stored in `attendance.event_name` and the admin dashboard
**groups attendance by it**. Change the separator, the date format, or the
spacing and every event's history splits into "before" and "after" buckets that
never reconcile. No migration warns you.

### 6.2 The "Other" major format

```
`Other – ${text}`             EN DASH (U+2013), not a hyphen
```

This already went wrong once: the check-in form wrote an en dash while the resume
portal wrote a hyphen, so any filter matching one silently missed half the rows.
One shared formatter, both writers.

### 6.3 The resume storage path

```
submissions/${Date.now()}_${crypto.randomUUID()}.pdf
```

Pinned server-side by `submit_resume()` (regex `^submissions/[A-Za-z0-9_.-]+\.pdf$`).
Change the client format and every upload is rejected by the database.

### 6.4 Local dates, never `toISOString()`

`toISOString().slice(0,10)` returns the **UTC** date, which rolls over at 8 PM
EDT / 7 PM EST — the middle of a 6–8 PM GBM. Anywhere you compare "today" against
an event date, build the string from `getFullYear()/getMonth()/getDate()`.

### 6.5 Database schema

Tables: `attendance`, `resumes`, `company_access` (vestigial), `events`,
`leaderboard` (view). Full schema in `HANDOFF.md` §2. The rewrite should not
change the schema — that is a separate, riskier project.

### 6.6 The security model

**Do not redesign this. Carry it over exactly.** It is documented in
`supabase/README.md` and was arrived at by finding real holes.

- Access is gated on an **explicit role claim** (`is_admin()` / `is_sponsor()`),
  never on merely being `authenticated`. Public signup is currently disabled,
  but that is defence in depth; "authenticated" must still not become a
  permission if signup is re-enabled later.
- Roles live in **`app_metadata`, never `user_metadata`** — users can rewrite
  their own `user_metadata` from the browser console.
- The `leaderboard` view runs with owner privileges and **bypasses RLS by
  design**. Any column added to it becomes public with no policy change to
  review.
- Resume submission goes through `submit_resume()`, which validates server-side.
  The client check is a convenience; it is bypassable.

---

## 7. Traps

Each of these already caught someone on this codebase.

**The client cannot enforce access.** The anon key ships in the public bundle.
Anything you check in React decides what is *rendered*, never what is
*reachable*. The old code gated the resume book on a `sessionStorage` token and a
policy documented as "validated client-side" — the entire book was downloadable
by anyone. In the new architecture the temptation is worse, because a clean
`ResumeRepository` *looks* like a boundary. It is not. RLS is.

**`vercel.json` headers only apply on Vercel.** A missing `connect-src` entry
killed every sponsor inquiry for an unknown period while everything looked fine
locally. Keep `vite.config.js` mirroring those headers onto `npm run preview`,
and test the contact form there.

**Lint and build catch less than you think.** Both passed while the sponsor form
was completely broken, while calendar exports emitted 2 AM events, and while
"View PDF" opened a blank tab and hijacked the current one. Click the thing you
changed.

**Don't let "hexagonal" become ceremony.** This is a student org website with
twelve data operations. If a port has one implementation and always will, it can
be a plain function. The goal is that pages don't know about SQL — not maximum
indirection.

**Keep the fallback behaviour.** Check-in options are seeded synchronously from a
bundled list because the Supabase client has no timeout, and gating the dropdown
on a completed round-trip meant one stalled request left every phone in a
basement lecture hall unable to check in. Preserve that in `listEvents`.

---

## 8. Suggested order of work

```
[ ] Phase 0  Vitest + write §5 tests against CURRENT code
[ ] Phase 1  Move lib/ → domain/, strip I/O
[ ] Phase 2  Events slice: port, two adapters, use case, hook
[ ]          ↑ STOP. Does the shape feel right? Fix it here.
[ ] Phase 3  Attendance → Auth → Resumes → Sponsor inquiry
[ ] Phase 4  Split AdminDashboard into five tab files
[ ] Phase 5  Delete dead code and vestigial company_access usage
[x]          Route-level code splitting (completed independently)
```

Do it between semesters, not during recruiting season. **Always work on a branch
unless the project owner explicitly authorizes work on `main`.** Each phase is a
separate branch, and `npm test && npm run lint && npm run build` must pass before
it merges. Use `npm run dev` at <http://localhost:5173> for UI review and
`npm run preview` (normally <http://localhost:4173>) for production-header checks.

Run the `security-auditor` agent after Phase 3 — that is where the auth and
resume slices land, and it has already caught holes in work that had been
reviewed by hand.

---

## 9. Honest assessment

**Worth doing:** Phase 0 (tests) and Phase 4 (splitting AdminDashboard). Those
pay for themselves immediately regardless of architecture.

**Worth doing if you want to learn the pattern, or if turnover keeps hurting:**
Phases 1–3. Real benefit, real cost, no urgency.

**Skip unless it's actually a problem:** Phase 5.

The current site is not in trouble. Do this because a well-separated codebase is
easier to hand to the next Digital Operations Chair — that is a real problem for
a student org, and it is the best reason on this list.

# SHPE OSU Website — Rewrite Plan

_Written 2026-08-03, against the codebase as it stood after the July–August
security work._

_Status reviewed 2026-09-13. Phase 0's Vitest safety net is complete; the
architectural rewrite has not started. Protected public-write Edge paths were
built independently, deployed to production, smoke-tested, and locked down.
They must be preserved._

_September 14 follow-up is deployed: verified-only quotas, bounded static-PDF
screening, transactional retired-file cleanup, and the matching frontend.
Live denial and asset checks passed; successful real-form acceptance is still
pending. Preserve these contracts; see `supabase/README.md` for the evidence._

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

The presentation layer works today. Do this rewrite if you want the codebase to
be teachable and survivable across E-Board turnover — those are good reasons.
Do not use it to redesign the protected submission boundary. Attendance, resume,
and sponsor public writes now intentionally go through Edge Functions, not
directly from pages to the database or email provider.

The measurable problem remains concentrated coupling: Supabase calls are spread
through pages, especially `AdminDashboard.jsx`. That is what this plan fixes.

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

### Where the weight is

`pages/AdminDashboard.jsx` still contains five tabs and remains the main split
target. `components/PublicLeaderboard.jsx` remains imported nowhere. Re-measure
with `wc -l`/the production bundle before using file or chunk sizes to make a
decision; the old point-in-time numbers were removed because they drifted.

### Data-operation boundary

Inventory the exact operations with `rg` before each rewrite phase. The browser
currently contains public reads, authenticated admin/sponsor operations, and
three protected public Edge invocations plus an admin-only cleanup invocation.
The three public submission paths are
security boundaries, not ordinary repositories: preserve the named Edge
Functions and never reintroduce direct anonymous table/Storage writes or
browser-side EmailJS.

### External services

- **Supabase** — Postgres, Auth, Storage
- **Cloudflare Turnstile** — action-bound automation challenge for public writes
- **Supabase Edge Functions** — protected attendance, resume, and sponsor writes
- **EmailJS REST API** — sponsor email provider, called only from Edge
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
│  EdgeAttendanceGateway · EdgeResumeGateway               │
│  EdgeSponsorInquiryGateway · SupabaseAuthGateway         │
│  Browser adapters hold no service/provider secrets.      │
└─────────────────────────────────────────────────────────┘
```

The Edge Functions form a second composition boundary. Turnstile verification,
service-role RPCs/private Storage access, durable rate limits, and EmailJS REST
delivery stay server-side in `supabase/functions/`. A clean browser port must
not collapse that boundary by wrapping a direct anonymous write.

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
│   │   └── fileConstraints.js     # 10KB–250KB; backend structural screen retained
│   ├── attendance/
│   │   ├── CheckIn.js
│   │   └── major.js               # "Other – x" formatting (§6.2)
│   ├── sponsor/
│   │   └── SponsorInquiry.js       # strict client shape; no provider routing
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
│   │   └── SponsorInquiryGateway.js
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
│   ├── edge/
│   │   ├── EdgeAttendanceGateway.js
│   │   ├── EdgeResumeGateway.js
│   │   └── EdgeSponsorInquiryGateway.js
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
  checkIns:   new EdgeAttendanceGateway(supabase.functions),
  uploads:    new EdgeResumeGateway(supabase.functions),
  inquiries:  new EdgeSponsorInquiryGateway(supabase.functions),
};

<DependencyProvider value={deps}><App /></DependencyProvider>
```

Tests pass in-memory fakes instead. That is the entire payoff: **you can test the
whole application layer with no database and no network.** Server provider IDs,
private keys, rate-limit HMAC material, and the Supabase service role never
appear in this browser composition root.

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

### Phase 0 — Set up the safety net (completed on the security branch)

Nothing else in this plan is safe without it.

1. `vitest` and the `npm test` script are installed.
2. The original regressions plus protected-submission, fallback-privacy, Edge,
   and static security-contract tests are present.
3. The pre-push routine is now `npm test`, lint, `check:edge`, production/full
   audits, build, and a clicked production-header preview.

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

1. **Attendance** — protected Edge gateway + one view read; never restore a
   browser `attendance.insert()` path
2. **Auth** — session + role checks (`AuthGateway`)
3. **Resumes** — protected Edge gateway for public submission; authenticated
   repository/RPCs and signed URLs for admin/sponsor work
4. **Sponsor inquiry** — Edge inquiry gateway; EmailJS remains an Edge-only
   provider adapter, never a browser `Notifier`

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
✓ client magic-byte feedback is not sufficient to authorize upload
✓ backend rejects magic-only/truncated PDFs, active content, and excess budgets
✓ complete supported static PDFs up to ten pages pass the backend screen
```

### Domain — major

```
✓ formatMajor('Other','CS') === 'Other – CS'   (EN DASH, §6.2)
✓ formatMajor('Mechanical Engineering') passes through unchanged
```

### Application — use cases (with in-memory fakes)

```
✓ submitResume sends one bounded multipart request to the Edge gateway
✓ an exact retry keeps its UUID; editing the draft rotates it
✓ a claimed email queues a pending revision without de-listing its approved row
✓ attendance/sponsor/resume never fall back to a direct anonymous write
✓ rejected/unavailable Turnstile cannot consume shared-IP/identity/global quotas
✓ a valid same-IP request remains eligible after repeated invalid tokens
✓ retired file cleanup is queued in the same transaction as approval/deletion
✓ failed cleanup stays retryable; tombstones prevent retired-path resurrection
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
submissions/<13-digit server timestamp>_<UUID>.pdf
```

The reservation RPC generates and pins this exact shape server-side. The browser
supplies an idempotency UUID and draft-start time, but it never chooses an object
path. Do not move path construction back to the client.

### 6.4 Local dates, never `toISOString()`

`toISOString().slice(0,10)` returns the **UTC** date, which rolls over at 8 PM
EDT / 7 PM EST — the middle of a 6–8 PM GBM. Anywhere you compare "today" against
an event date, build the string from `getFullYear()/getMonth()/getDate()`.

### 6.5 Database schema

Tables: `attendance`, `resumes`, `company_access` (vestigial), `events`,
`leaderboard` (view), plus internal
`public_submission_rate_limits`/`resume_submission_reservations` and the pending
`resume_file_cleanup` queue/tombstones. Full schema
and rollout state are in `HANDOFF.md` §2 and `supabase/README.md`. Do not change
these security migrations as an incidental part of the architecture rewrite.

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
  design**. It exposes only the top ten `first_name`, SQL-derived
  `last_initial`, and distinct-event `count` rows; any column added to it becomes
  public with no policy change to review. The stored surname/dot number remains
  private.
- Attendance, resume, and sponsor submissions go through their named Edge
  Functions. Turnstile is action-bound; validation is repeated server-side;
  HMAC-keyed limits are durable; internal functions are executable only by
  `service_role`; final lockdown removes the legacy anonymous paths.
  All quota writes follow valid Turnstile; invalid-token traffic cannot exhaust
  a campus NAT's allowance. Hosting-gateway protection is required for floods
  before Siteverify; do not restore a shared-IP precheck during a rewrite.
- Resume submission reserves a server path before Storage and queues a pending
  revision. Admin approve/delete are atomic RPCs; a browser update returning no
  error but zero rows is not success.
  The backend structural PDF screen runs after verification/quotas and before
  reservation/upload. Keep pinned parsers backend-only and preserve input,
  expanded-stream, nesting, object, and page budgets; screening is not antivirus.
- Retired resume paths are queued by a transactional delete trigger. Only the
  admin-authenticated cleanup Edge handler may use service-only claim/finish
  RPCs and remove server-selected detached objects. Retain lease checks and
  permanent tombstones. Retries run on admin visits/actions, not a cron; do not
  replace durable retry state with a disappearing frontend row.
- EmailJS credentials/routing are Edge-only and one delivery attempt is made.
  The current Free account has no private key: non-browser API access is on,
  strict/private-key mode is off, and the key rotated at cutover is held only
  in Edge secrets. Enable private-key enforcement if the provider later makes it
  available.
- The Google fallback URL contains no attendee identity and its Sheet is
  unauthenticated quarantine, never an automatic source for metrics.

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
once killed every sponsor inquiry while everything looked fine locally. Keep
`vite.config.js` mirroring those headers onto `npm run preview`, and test there.
EmailJS is now server-side, so `api.emailjs.com` must not be restored to the
browser CSP.

**Lint and build catch less than you think.** Both passed while the sponsor form
was completely broken, while calendar exports emitted 2 AM events, and while
"View PDF" opened a blank tab and hijacked the current one. Click the thing you
changed.

**Don't let "hexagonal" become ceremony.** This is a student org website with
twelve data operations. If a port has one implementation and always will, it can
be a plain function. The goal is that pages don't know about SQL — not maximum
indirection.

**Keep the event fallback behaviour.** Check-in options are seeded synchronously from a
bundled list because the Supabase client has no timeout, and gating the dropdown
on a completed round-trip meant one stalled request left every phone in a
basement lecture hall unable to check in. Preserve that in `listEvents`.

**Do not confuse the event fallback with the Google Form outage link.** The
latter appears only after two service failures, carries no attendee data in its
URL, and produces quarantined/untrusted rows for manual review.

---

## 8. Suggested order of work

```
[x] Phase 0  Vitest + regression/security tests
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
`npm run preview` (normally <http://localhost:4173>) for production-header
checks. Also run `npm run check:edge`, `npm audit --omit=dev`, and `npm audit`.

Run the `security-auditor` agent after Phase 3 — that is where the auth and
resume slices land, and it has already caught holes in work that had been
reviewed by hand.

---

## 9. Honest assessment

**Already done:** Phase 0. Keep expanding the tests when a production bug is
found.

**Worth doing:** Phase 4 (splitting `AdminDashboard.jsx`). It pays for itself
regardless of architecture.

**Worth doing if you want to learn the pattern, or if turnover keeps hurting:**
Phases 1–3. Real benefit, real cost, no urgency.

**Skip unless it's actually a problem:** Phase 5.

Do the rewrite because a well-separated codebase is easier to hand to the next
Digital Operations Chair—not as a reason to bypass or redesign the deployed
security boundary. Verify that boundary after every affected phase.

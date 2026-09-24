# SHPE Ohio State University — Chapter Website

The official website for the **Society of Hispanic Professional Engineers** chapter at The Ohio State University. Live at **[shpeosu.com](https://www.shpeosu.com)**.

## Our mission

SHPE changes lives by empowering the Hispanic community to realize its fullest potential and to impact the world through STEM awareness, access, support, and development.

This site is how the chapter does that day to day. It exists to serve four people, and every decision should be weighed against whether it helps one of them:

*   **A student who has never heard of SHPE** — find out what it is, whether they belong, and how to show up.
*   **A member** — check in at meetings, get their resume in front of recruiters, find academic and professional resources.
*   **A corporate recruiter** — browse approved student resumes, and sponsor the chapter.
*   **The E-Board** — run events, review resumes, and see attendance analytics **without writing code**.

That last one shapes the architecture more than anything else. The E-Board turns over every year and its members are not developers, so anything they need weekly — adding an event, approving a resume, onboarding a sponsor — has to be doable from the Admin Dashboard rather than by editing a file and pushing a commit.

Built with React 18, Vite, Tailwind CSS and Supabase: fast, responsive, and serverless, so it costs the chapter nothing to run.

Current operational note: no sponsor accounts have been created yet, and the
E-Board is responsible for adding the next upcoming events through the Admin
Dashboard.

> **Working on this?** Start with [`CLAUDE.md`](./CLAUDE.md) — it covers the current state, remaining work, branch policy, and the mistakes this codebase has already made once.

September 24 rollout: [`Admin-managed sponsors`](./docs/plans/sponsor-admin.md)
release 1 is **live, with backend and frontend verification complete**. The owner
approved production rollout and the neutral glass UI,
SHPE header logo, and removal of the permanent refresh button. It moves company
listings, logos, tiers, ordering, and draft/publish/archive controls into the
existing Admin Dashboard. Package prices/benefits and the packet remain unchanged
and are planned separately. Recruiter access and sponsor inquiries are unchanged.

### Isolated sponsor review

Use a working checkout and a running Docker-compatible engine (Docker Desktop
or Colima). This is a separate local Supabase project, not a
copy of production. No hosted credentials or student data are needed.

```bash
npm ci
npm run local:sponsors:setup
npm run local:sponsors:functions  # keep running in this terminal
```

In a second terminal:

```bash
npm run local:sponsors:dev
```

Open <http://127.0.0.1:5173/admin> and use the disposable login in
`.sponsor-local/review-login.txt`. Choose **Sponsors → Website sponsors**;
the public view is <http://127.0.0.1:5173/sponsors>. The five existing companies
are seeded without guessing websites or academic years. Refresh the public page
after publishing. All review services bind to loopback; this URL is for the
laptop, not another phone on Wi-Fi.

The runner sets local Supabase values only in the dev process; it does not
edit `.env`, link a hosted project, deploy functions, or run production SQL.
Runtime files are ignored under `.sponsor-local/`. Attendance, resume submissions,
and sponsor email are deliberately not configured in this isolated fixture.
Use the production site for normal operations, not this review database.

Repeatable local API checks (synthetic fixtures only):

```bash
node scripts/smoke-sponsors.mjs
node scripts/smoke-sponsor-assets.mjs
```

The owner reviewed and approved the local visual UI. Production-configured
preview routes, CSP, and asset hashes passed; automated browser interaction was
not performed. September 24 gates passed: 460 tests in 46 files, lint, frontend
build, all five Edge bundles, and both dependency audits (zero vulnerabilities).
Commit `e1713e8` is deployed: the live entry is `/assets/index-B98w6Nd9.js`, all
generated JS/CSS SHA-256 hashes match the production-configured build, and eight
routes return 200 with the expected security headers. Production browser/mobile
interaction acceptance remains an owner follow-up; HTTP/API checks are not a
substitute for it.
See [`supabase/README.md`](./supabase/README.md#admin-managed-sponsors--release-1)
for hosted verification and rollout status. Merging the frontend alone does not
apply its backend prerequisites; local fixtures never establish production state.

---

## 🚀 Key Features

### 🌟 Public-Facing Platform (With Navigation)
*   **Modern Home Page (`/`)**: Features our mission, dynamic chapter metrics, a spotlight section for our SHPEtinas program, and an interactive look at the chapter.
*   **Events Calendar (`/events`)**: Merges events from the Supabase `events` table (added by the E-Board through the Admin Dashboard) with a bundled fallback list, so the calendar still renders if the database is unreachable. Members can filter events by month and category (GBM, Social, Professional, Academic, Outreach, Fundraiser) and directly export them to Google Calendar or Apple Calendar (`.ics` files). Event photos are optional: cards without one use the official SHPE logo, while uploaded flyers are shown uncropped and can be opened at full size from the details modal.
*   **Professional Development Hub (`/professional-development`)** *[NEW]*:
    *   **Animated Counter Banner**: Displays internship placement statistics and salary metrics that animate sequentially when scrolled into view.
    *   **Member Spotlight Carousel**: An interactive selector showing student internship experiences at top employers like GM, Ford, and Lincoln Electric.
    *   **National Convention Guide**: Step-by-step prep timeline (Registration, Resume, Company Research, Elevator Pitch, Business Attire, Follow-up) and logistics overview.
    *   **SponsorSHPE Call to Action**: Invites corporate partners to collaborate and redirects them to the Sponsors portal.
*   **E-Board Roster (`/eboard`)**: Displays student leaders in a custom, Loteria-styled grid layout. Cards use consistent modest corner radii around both the card and headshot, remain still on hover, and use responsive flexbox sizing to align the orphaned last row cleanly on all screen sizes.
*   **Corporate Sponsor Portal (`/sponsors`)**: Partner benefits and tiers (Buckeye $500, Carmen $1,000, Scarlet & Gray $1,500, Platinum $2,000). Current sponsors are grouped by the tier they actually purchased, and empty tiers hide themselves. Each tier's **Get Started** button preselects that tier in the contact form. Inquiries go through a Turnstile-protected Supabase Edge Function; EmailJS credentials and traffic never enter the browser.
*   **Resource Hub (`/resources`)**: Provides study tips, tutoring links, and a direct link to view and read the official chapter **First-Year Guide PDF** (`/photos/First-Year-Guide.pdf`).

---

### 🗃 Chapter Operations & Security Portal (Hidden Routes)
These pages are omitted from the Navbar to avoid clutter, not as a security
control. Their URLs are public; Edge validation, RLS, Storage policies, and role
claims protect the operations behind them.

#### 1. Student Check-In (`/attendance`)
*   **Mobile-First Check-In**: Quick check-in page for chapter events. Options come from the same shared source as the public calendar (`src/lib/events.js`), so an event added in the Admin Dashboard is immediately checkinable. Only events dated today or later appear; past meetings remain in the calendar and admin history but are not selectable. The list is seeded from the eligible bundled fallback at first paint so a known current event can appear even before the database responds.
*   **First-Time Meeting Logic**: Prompts first-time attendees for how they heard about SHPE and their major. The historical `pronouns` database column is retained, but the form no longer collects it.
*   **Custom Major Entry**: If a student selects "Other" as their major, a text input appears allowing them to type their exact major (limited to 150 characters, saved in the database as `Other – [custom text]`, formatted by the shared helper in `src/lib/majors.js` so the check-in form and the resume portal cannot drift apart).
*   **Protected Submission**: The browser has no direct table-write path. A
    Supabase Edge Function validates the event and every field, verifies an
    action-bound Cloudflare Turnstile token, and calls a service-only RPC with
    durable HMAC-keyed network and identity limits. The local cooldown remains
    only as double-click feedback, not as the security boundary.
*   **Privacy-Safe Outage Fallback**: Only after repeated service failures, the
    page can link to a separate Google Form. No attendee identity or demographic
    value is placed in the URL. The Sheet is untrusted/manual-only and must never
    be auto-imported into attendance or the leaderboard.

#### 2. Student Resume Upload (`/resume-upload`)
*   **Secure Student Uploads**: Members can upload a PDF copy of their resume to be compiled into the official resume book.
*   **PDF Screening**: Client checks provide quick size/type feedback. The September 14 follow-up adds bounded structural and active-content screening in Edge after verified Turnstile and quotas, before upload. It accepts static PDFs up to ten pages; scripts, attachments, encrypted files, and unsupported features are rejected. This is not antivirus. See the rollout status below.
*   **OSU Email Domain Lock**: Restricts uploads to the exact `osu.edu`, `buckeyemail.osu.edu`, and `alumni.osu.edu` domains. The Edge Function and database both enforce it; suffixes such as `osu.edu.evil.example` are rejected.
*   **Server-Side Submission**: A Turnstile-protected Edge Function validates the multipart body, reserves an idempotent submission, generates the Storage path, uploads privately, and queues a separate pending revision. A new submission cannot de-list an already approved resume; approval and deletion use atomic admin RPCs.
*   **File Size Ceiling**: PDFs must be between 10 KB and 250 KB. The form shows the file's size the moment it is picked and explains how to shrink an oversized one.
*   **Custom Major Integration**: Prompts students selecting 'Other' to specify their major in detail.
*   **Safe File Naming**: Discards the original filename and uses a server-generated `submissions/<timestamp>_<uuid>.pdf` path to prevent traversal, collision, and client-selected object replacement.

#### 3. Recruiter Portal (`/company` & `/company/dashboard`)
*   **Operational status**: The portal is implemented, but no sponsor accounts exist yet.
*   **Real Accounts**: Recruiters sign in with an email and password. Accounts are created by the E-Board in the Supabase dashboard and granted a `sponsor` role; an account without that role can reach nothing, so a half-finished setup fails closed.
*   **Database-Enforced Access**: What a recruiter can see is decided by Postgres Row-Level Security, not by JavaScript. Sponsors see approved resumes only — never the pending queue, attendance records, or anything else.
*   **Resume Book Browser**: Filter student resumes by name, major, and graduation year.
*   **Temporary Signed URLs**: View/Download actions are served via Supabase Storage signed URLs that expire after 60 seconds, and are only issued for resumes that are actually approved.
*   **Revocation**: Deleting the user, or clearing their role, removes access immediately.

> **Note:** this replaced a shared 8-character access-code system. The codes were
> stored in a table that was publicly readable, so anyone could list every code —
> and the resume book behind them was readable without a code at all. See
> `supabase/README.md`.

#### 4. Secure Admin Panel (`/admin` & `/admin/resumes`)
*   **Admin Authentication**: Protected behind Supabase Email/Password authentication. Redirect guards secure the paths.
*   **Responsive Admin Navigation**: Phones use a sticky compact header and four-tab navigation instead of the desktop sidebar. Dashboard cards stack, controls fill the available width, and wide data tables scroll within their own containers rather than forcing the entire page off-screen.
*   **Interactive Attendance Analytics**:
    *   **Overview Cards**: Displays overall unique members, total check-ins, and number of events.
    *   **Most Active Members Leaderboard**: Ranks members by the number of **distinct events** attended, so a duplicate check-in at one meeting cannot inflate a ranking.
    *   **Stacked Bar Charts**: Compares First-Timers vs. Returning members per event.
    *   **Pie Charts**: Tracks attendance distribution by event category (GBMs, Professional, Socials, Study Sessions, etc.).
*   **Retention Trends**: Line charts visualizing attendance growth over the semester, at half width alongside the majors breakdown. Check-ins are plotted on the event's date rather than the submission timestamp, so a student checking in late does not create a false attendance day.
    *   **Majors Breakdown**: Ranked bar list of what the chapter studies, counting **people rather than check-ins** so a frequent attendee cannot skew the mix. Each major can be expanded to show its members. Custom `Other – x` entries are unwrapped to the major the student actually typed. Members with no major on record are excluded and reported beneath the chart — returning members are never asked for one at check-in, so that figure is a live measure of the gap.
*   **Member Feedback**: Everything students wrote in the check-in feedback box, newest first, in a fixed-height scroll region and filterable by event. Each event in the filter carries its comment count.
*   **Inline Data Editing**: Allows admins to modify a member's major inline in the attendance database. Clicking the pencil icon opens an input field that updates the database record on Enter (or cancels on Escape).
*   **Secure CSV Export**: Allows downloading attendance records. Implements **CSV Injection mitigation** by sanitizing cells starting with formulas (`=`, `+`, `-`, `@`, tab, carriage return) with a single-quote prefix.
*   **Calendar Management**: Admins can add, edit, or delete calendar events.
    Editing reuses the event form, preserves the existing image unless a
    replacement is selected, and updates the shared calendar/check-in source.
*   **Resume Book Admin Dashboard (`/admin/resumes`)**:
    *   **Review Pipeline**: Admins can view, approve, revoke, or delete pending resume submissions.
    *   **Retired File Cleanup**: Replaced/deleted files are queued transactionally and removed by the deployed admin-only server endpoint. Failed work persists for the next admin visit or **Retry file cleanup** action.
    *   **Sponsor Onboarding**: Step-by-step instructions for creating a recruiter account and granting the `sponsor` role.
    *   **Inline Major Editing**: Admins can modify a student's major directly in the resume book table to fix spelling errors.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 & Vite 7 | Interactive rendering & fast bundling; explicit Safari 14 target |
| **Routing** | React Router DOM v7 | Navigation, nested layouts, and admin route guards |
| **Styling** | Tailwind CSS | Modern styling system with custom SHPE palette |
| **Data Viz** | Recharts | Graphs, pie charts, and trends for the Admin Dashboard |
| **Database** | Supabase (PostgreSQL) | Stores attendance, resumes, and company access records |
| **Storage** | Supabase Storage Buckets | Stores student resume PDF files securely |
| **Authentication** | Supabase Auth | Handles role-gated Email/Password logins for E-Board admins and sponsors |
| **Public-write gateway** | Supabase Edge Functions + Cloudflare Turnstile | Validates and rate-limits attendance, resume, and sponsor submissions server-side |
| **Emails** | EmailJS REST API | Sends one server-routed sponsor notification from Edge; no provider key in the current browser bundle |
| **Analytics** | Vercel Web Analytics | Counts privacy-friendly visitors and page views after deployment |
| **Hosting** | Vercel | Automatic deployments connected to GitHub |

---

## 💻 Local Development Setup

To run this project locally on your machine:

### 1. Clone the repository and navigate to the project directory:
```bash
git clone https://github.com/leo205/SHPE_OSU.git
cd SHPE_OSU/shpe-osu
```

### 2. Install dependencies:
```bash
npm install
```

### 3. Set up environment variables:
Create a `.env` file in the root of the `shpe-osu` directory and copy the format from `.env.example`:
```bash
cp .env.example .env
```
Fill in the credentials:
```env
# Supabase Project URL & Anon/Publishable Key
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_TURNSTILE_SITE_KEY=your-public-turnstile-site-key
```
*Note: The Supabase publishable key is safe to expose in frontend environment files since data accessibility is strictly guarded by Row-Level Security (RLS).*

### 4. Run the local dev server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Branch and review policy

Always work on a branch unless the project owner explicitly asks for work
directly on `main`. Production deploys from `main`, so even documentation and
small fixes should be reviewed before they are merged.

```bash
git switch main
git pull --ff-only
git switch -c feature/your-change
```

Use Node `^20.19.0` or `>=22.12.0`. Use `npm run dev` and open
[http://localhost:5173](http://localhost:5173) for ordinary UI review. Before
merging, run `npm test`, `npm run lint`, `npm run check:edge`, `npm run build`,
both npm audits, and `npm run preview`; the preview URL is normally
[http://localhost:4173](http://localhost:4173) and includes the production CSP
and security headers.

`npm test` includes isolated PostgreSQL/PGlite tests for the real resume
approval/deletion and cleanup SQL; those tests use synthetic local data and
never contact production.

Vercel Web Analytics is mounted once in `src/main.jsx` using
`@vercel/analytics/react`. It does not collect development traffic. Enable Web
Analytics in the Vercel project dashboard, deploy the reviewed branch through
the normal merge process, then visit the production site to begin collecting
page views.

---

## 📂 Directory Structure

```
shpe-osu/
├── .github/              # GitHub configurations
├── public/
│   ├── photos/
│   │   ├── eboard/       # Standardized webp headshots of the 19 E-Board members
│   │   ├── events/       # Event calendar cards
│   │   ├── picsMain/     # Home page hero/mission background images
│   │   ├── profDev/      # Professional Development section assets
│   │   ├── sponsors/     # Corporate sponsor logos
│   │   └── First-Year-Guide.pdf  # Resources guide
│   └── shpeLogo.png      # Official chapter branding
├── src/
│   ├── components/       # Reusable layout UI components (Navbar, Footer, ProtectedRoute, etc.)
│   ├── data/
│   │   └── events.js     # Bundled outage fallback for database events
│   ├── lib/
│   │   ├── supabase.js   # Supabase client initialization (loads credentials from env)
│   │   ├── auth.js       # isAdmin/isSponsor role checks (reads app_metadata)
│   │   ├── events.js     # Single source of truth for events: DB + bundled fallback
│   │   ├── calendar.js   # Google Calendar / .ics export builders
│   │   ├── majors.js     # Shared "Other – major" formatting
│   │   ├── attendance.js # Protected attendance Edge client
│   │   ├── resume.js     # Protected resume Edge client + validation
│   │   ├── sponsorInquiry.js # Protected sponsor Edge client
│   │   ├── navigation.js # Nav links — shared by Navbar AND Footer
│   │   └── scroll.js     # Smooth in-page anchor scrolling (opt-in)
│   ├── pages/            # Core page components (Home, Events, Eboard, Sponsors, Resources, etc.)
│   ├── App.jsx           # Client-side router declarations
│   ├── index.css         # Tailwind utility styling
│   └── main.jsx          # Entry point
├── CLAUDE.md             # Working context — read this first
├── REWRITE.md            # Plan for the ports-and-adapters rewrite
├── supabase/             # Database security model — READ supabase/README.md FIRST
│   ├── README.md         # Security model, run order, and how to check live state
│   ├── leaderboard-view.sql   # applied: first_name, last_initial, count; top ten
│   ├── sponsor-auth.sql       # (applied) sponsor logins + RLS lockdown
│   ├── resume-submit.sql      # superseded legacy path; execution revoked
│   ├── attendance-submit.sql  # applied: limiter + service-only RPC
│   ├── attendance-lockdown.sql # applied: no anonymous table writes
│   ├── resume-edge-submit.sql # applied: reservations/admin RPCs
│   ├── resume-cleanup.sql     # applied: private transactional cleanup
│   ├── resume-lockdown.sql    # applied: no legacy public upload path
│   └── functions/             # Three public submission functions + admin cleanup
├── tailwind.config.js    # Customized color system (SHPE branding palette)
├── vercel.json           # Vercel deployment headers & Content Security Policy (CSP)
└── package.json          # Node dependencies
```

---

## 🛡 Security Implementations

> **The one rule:** the client cannot enforce access. The Supabase anon key ships
> inside the public JavaScript bundle, so anyone can call the database API
> directly and skip the interface entirely. A check written in a React component
> decides what gets *rendered*, never what is *reachable*. Every vulnerability
> found in this project has been a variation of forgetting that.
>
> `supabase/README.md` is the authoritative description of what is enforced.

*   **Row-Level Security (RLS)**: Every table is closed by default and opened
    deliberately. Access is gated on an explicit role claim (`is_admin()` /
    `is_sponsor()`) rather than on merely being signed in. Public signup is
    currently disabled, but `authenticated` still is not a permission: the role
    gate must remain safe if signup is enabled again later.
    *   `attendance`: reads are admin-only; the public leaderboard is served by
        a top-ten view containing first name, one SQL-derived surname initial,
        and distinct-event count. Anonymous table writes are revoked; public
        submissions go through the protected Edge path.
    *   `resumes`: no public read. Sponsors see approved rows; admins see all.
        The live Edge path makes all public writes service-only, and the legacy
        `submit_resume()` browser RPC is revoked.
    *   `company_access`, `events`: admin-only writes; `events` is publicly
        readable so the calendar works logged out.
    *   Storage: resume PDFs are readable only by an admin, or by a sponsor when
        the corresponding row is approved.
*   **Roles in `app_metadata`, never `user_metadata`**: a signed-in user can
    rewrite their own `user_metadata` from the browser console, so a role stored
    there would be self-grantable. `app_metadata` is writable only by the service
    role and the Supabase dashboard.
*   **Vercel CSP Configuration**: Strict security headers in `vercel.json`
    (`X-Frame-Options: DENY`, `nosniff`, and a `Content-Security-Policy` with no
    `unsafe-inline` in `script-src`). `vite.config.js` mirrors these onto
    `npm run preview`, because a missing `connect-src` entry once broke the
    sponsor contact form in production while everything looked fine locally.
*   **File Safeguards**:
    *   PDFs between 10 KB and 250 KB.
    *   Quick magic-byte feedback plus deployed backend structural and active-content PDF screening.
    *   User filenames are discarded; the server reserves
        `submissions/<13-digit timestamp>_<uuid>.pdf`, so a caller cannot choose
        a path or point metadata at another object.
    *   Signed URLs expire after 60 seconds.
*   **CSV Injection Mitigation**: exported cells beginning with `=`, `+`, `-`,
    `@`, tab, or carriage return are prefixed with a single quote.

### Protected-submission production status

The coordinated rollout was completed and smoke-tested on **2026-09-13**.
The three protected public-submission functions are deployed; the additive and
lockdown SQL is applied; Turnstile and durable limits are active; and the
top-ten leaderboard cap is enforced by the database view. The EmailJS Free
account does not expose a private key, so its public key was rotated during
cutover and the replacement exists only in Supabase Edge secrets. See
`supabase/README.md` for the recorded evidence and safe redeployment order.

**September 14 follow-up is deployed; successful form acceptance is pending.** Invalid
Turnstile attempts no longer consume shared Wi-Fi quotas; the backend adds
structural PDF screening; and resume replacement/deletion persists a private
cleanup queue. The cleanup SQL and all four Edge Functions are live; rejected
verification and private-data denial probes passed without changing records,
files, or quota counters. The matching frontend was pushed to `main` and its live
asset hashes/security headers verified; the owner will now test real attendance.
Preserve SQL → Edge Functions → frontend order for redeployment.
There is no automatic orphan backfill or
scheduled cleanup job. The authoritative rollout record is
[`supabase/README.md`](./supabase/README.md).

### Known residual risk

Turnstile proves a challenge was completed, not ownership or physical presence.
Canonical event validation, duplicate suppression, and durable limits slow
attendance abuse, but someone can still invent an identity or claim another dot
number; strong leaderboard integrity needs an approved OSU SSO, event-scoped
secret, or admin-review design. The resume design prevents an unreviewed
revision from replacing or de-listing an approved one, but an impersonated
pending submission could still mislead an admin. Sponsor `reply_to` addresses
are also unverified. E-Board must independently verify resume identity and any
sponsorship/payment request until an identity flow is approved.

Verified submissions can still consume shared-network limits. Removing the
invalid-token precheck protects legitimate campus users' allowance, but
volumetric traffic before Siteverify requires hosting-gateway protection.
Structural PDF screening reduces unsupported/active content; it does not prove
that every accepted document is harmless.

The project owner explicitly re-approved the original GroupMe invitation on
2026-09-03. Its exact destination appears on Home, in the Footer, and after a
first attendee checks in. Do not replace that destination or add invitation QR
codes/equivalent join routes without another explicit project-owner approval.

---

## 🤖 Project Subagents

`.claude/agents/` contains three reviewers preloaded with this codebase's actual
failure modes — `security-auditor`, `code-reviewer`, and `deploy-preflight`. They
are read-only and report rather than edit. Between them they have caught a
role-gating hole, a check-in bug that would have broken a live GBM, and a
timezone error that only misfired during meeting hours.

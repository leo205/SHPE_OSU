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

> **Working on this?** Start with [`CLAUDE.md`](./CLAUDE.md) — it covers the current state, what is actively being built, and the mistakes this codebase has already made once.

---

## 🚀 Key Features

### 🌟 Public-Facing Platform (With Navigation)
*   **Modern Home Page (`/`)**: Features our mission, dynamic chapter metrics, a spotlight section for our SHPEtinas program, and an interactive look at the chapter.
*   **Events Calendar (`/events`)**: Merges events from the Supabase `events` table (added by the E-Board through the Admin Dashboard) with a bundled fallback list, so the calendar still renders if the database is unreachable. Members can filter events by month and category (GBM, Social, Professional, Academic, Outreach, Fundraiser) and directly export them to Google Calendar or Apple Calendar (`.ics` files).
*   **Professional Development Hub (`/professional-development`)** *[NEW]*:
    *   **Animated Counter Banner**: Displays internship placement statistics and salary metrics that animate sequentially when scrolled into view.
    *   **Member Spotlight Carousel**: An interactive selector showing student internship experiences at top employers like GM, Ford, and Lincoln Electric.
    *   **National Convention Guide**: Step-by-step prep timeline (Registration, Resume, Company Research, Elevator Pitch, Business Attire, Follow-up) and logistics overview.
    *   **SponsorSHPE Call to Action**: Invites corporate partners to collaborate and redirects them to the Sponsors portal.
*   **E-Board Roster (`/eboard`)**: Displays student leaders in a custom, Loteria-styled grid layout. Cards use dynamic Tailwind CSS grids and flexbox centering fallbacks to align the orphaned last row cleanly on all screen sizes, showcasing standardized `.webp` headshots.
*   **Corporate Sponsor Portal (`/sponsors`)**: Partner benefits and tiers (Buckeye $500, Carmen $1,000, Scarlet & Gray $1,500, Platinum $2,000). Current sponsors are grouped by the tier they actually purchased, and empty tiers hide themselves. Each tier's **Get Started** button preselects that tier in the contact form, so an enquiry arrives labelled with the level the recruiter clicked. Powered by EmailJS.
*   **Resource Hub (`/resources`)**: Provides study tips, tutoring links, and a direct link to view and read the official chapter **First-Year Guide PDF** (`/photos/First-Year-Guide.pdf`).

---

### 🗃 Chapter Operations & Security Portal (Hidden Routes)
These pages are not listed in the Navbar to maintain security and avoid clutter. They are accessed via QR codes, direct URLs, or distributed credentials.

#### 1. Student Check-In (`/attendance`)
*   **Mobile-First Check-In**: Quick check-in page for chapter events. Options come from the same shared source as the public calendar (`src/lib/events.js`), so an event added in the Admin Dashboard is immediately checkinable. The list is seeded from the bundled fallback at first paint, so a slow or failed network can never leave students staring at an empty dropdown mid-meeting.
*   **First-Time Meeting Logic**: Prompts first-time attendees for pronouns, how they heard about SHPE, and their major.
*   **Custom Major Entry**: If a student selects "Other" as their major, a text input appears allowing them to type their exact major (limited to 150 characters, saved in the database as `Other – [custom text]`, formatted by the shared helper in `src/lib/majors.js` so the check-in form and the resume portal cannot drift apart).
*   **Spam Prevention**: Implements a 30-second submit cooldown to prevent accidental double-submits or database flooding.

#### 2. Student Resume Upload (`/resume-upload`)
*   **Secure Student Uploads**: Members can upload a PDF copy of their resume to be compiled into the official resume book.
*   **MIME-Type Spoofing Check**: Utilizes a magic-byte checker (verifying the file starts with the PDF signature `0x25, 0x50, 0x44, 0x46` before upload) to prevent malicious files from being uploaded as `.pdf`.
*   **OSU Email Domain Lock**: Restricts uploads to `@osu.edu` and its subdomains. Enforced **inside the database** by `submit_resume()`, not only in the browser — the client-side check is bypassable by anyone posting to the API directly.
*   **Server-Side Submission**: Uploads go through a single `SECURITY DEFINER` function that validates every field, pins `approved` to `false` so nothing can publish itself past E-Board review, and upserts on email so re-uploading replaces a student's entry instead of creating a duplicate.
*   **File Size Ceiling**: PDFs must be between 10 KB and 250 KB. The form shows the file's size the moment it is picked and explains how to shrink an oversized one.
*   **Custom Major Integration**: Prompts students selecting 'Other' to specify their major in detail.
*   **Safe File Naming**: Re-encrypts filenames on upload to `submissions/${Date.now()}_${crypto.randomUUID()}.pdf` to avoid directory traversal and filename collision vulnerabilities.

#### 3. Recruiter Portal (`/company` & `/company/dashboard`)
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
*   **Interactive Attendance Analytics**:
    *   **Overview Cards**: Displays overall unique members, total check-ins, and number of events.
    *   **Most Active Members Leaderboard**: Ranks members by the number of **distinct events** attended, so a duplicate check-in at one meeting cannot inflate a ranking.
    *   **Stacked Bar Charts**: Compares First-Timers vs. Returning members per event.
    *   **Pie Charts**: Tracks attendance distribution by event category (GBMs, Professional, Socials, Study Sessions, etc.).
    *   **Retention Trends**: Line charts visualizing attendance growth over the semester.
*   **Inline Data Editing**: Allows admins to modify a member's major inline in the attendance database. Clicking the pencil icon opens an input field that updates the database record on Enter (or cancels on Escape).
*   **Secure CSV Export**: Allows downloading attendance records. Implements **CSV Injection mitigation** by sanitizing cells starting with formulas (`=`, `+`, `-`, `@`, tab, carriage return) with a single-quote prefix.
*   **Resume Book Admin Dashboard (`/admin/resumes`)**:
    *   **Review Pipeline**: Admins can view, approve, revoke, or delete pending resume submissions.
    *   **Sponsor Onboarding**: Step-by-step instructions for creating a recruiter account and granting the `sponsor` role.
    *   **Inline Major Editing**: Admins can modify a student's major directly in the resume book table to fix spelling errors.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 & Vite | Interactive rendering & fast bundling |
| **Routing** | React Router DOM v6 | Navigation, nested layouts, and admin route guards |
| **Styling** | Tailwind CSS | Modern styling system with custom SHPE palette |
| **Data Viz** | Recharts | Graphs, pie charts, and trends for the Admin Dashboard |
| **Database** | Supabase (PostgreSQL) | Stores attendance, resumes, and company access records |
| **Storage** | Supabase Storage Buckets | Stores student resume PDF files securely |
| **Authentication** | Supabase Auth | Handles secure Email/Password logins for E-Board admins |
| **Emails** | EmailJS | Directly handles corporate sponsor contact inquiries from the frontend |
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
```
*Note: The Supabase publishable key is safe to expose in frontend environment files since data accessibility is strictly guarded by Row-Level Security (RLS).*

### 4. Run the local dev server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

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
│   │   └── events.js     # Centralized source of truth for the Events Calendar
│   ├── lib/
│   │   ├── supabase.js   # Supabase client initialization (loads credentials from env)
│   │   ├── auth.js       # isAdmin/isSponsor role checks (reads app_metadata)
│   │   ├── events.js     # Single source of truth for events: DB + bundled fallback
│   │   ├── calendar.js   # Google Calendar / .ics export builders
│   │   ├── majors.js     # Shared "Other – major" formatting
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
│   ├── leaderboard-view.sql   # (applied) public leaderboard view
│   ├── sponsor-auth.sql       # (applied) sponsor logins + RLS lockdown
│   └── resume-submit.sql      # (applied) server-side resume submission
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
    `is_sponsor()`) rather than on merely being signed in — public signup means
    "authenticated" is not by itself a meaningful permission.
    *   `attendance`: public INSERT (check-in) only. Reads are admin-only; the
        public leaderboard is served by a two-column view instead.
    *   `resumes`: no public read. Sponsors see approved rows; admins see all.
        Writes go through `submit_resume()`.
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
    *   Magic-byte validation (`%PDF`) read from the byte buffer.
    *   Filenames replaced with `submissions/<timestamp>_<uuid>.pdf`; the path is
        also pinned server-side so a caller cannot point a row at another object.
    *   Signed URLs expire after 60 seconds.
*   **CSV Injection Mitigation**: exported cells beginning with `=`, `+`, `-`,
    `@`, tab, or carriage return are prefixed with a single quote.

### Known residual risk

Resume submissions are keyed on email with no proof of ownership, so someone who
knows a classmate's OSU address could overwrite their entry. A replacement always
returns to `approved = false`, so it drops *out* of the recruiter book pending
review rather than showing sponsors false content, and the previous PDF is
retained so an admin can restore it. Closing this properly needs emailed
confirmation links.

---

## 🤖 Project Subagents

`.claude/agents/` contains three reviewers preloaded with this codebase's actual
failure modes — `security-auditor`, `code-reviewer`, and `deploy-preflight`. They
are read-only and report rather than edit. Between them they have caught a
role-gating hole, a check-in bug that would have broken a live GBM, and a
timezone error that only misfired during meeting hours.

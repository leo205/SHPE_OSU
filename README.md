# SHPE Ohio State University - Chapter Website

Welcome to the official repository for the Society of Hispanic Professional Engineers (SHPE) chapter at The Ohio State University. This web application serves as a central hub for our members, prospective members, and corporate sponsors, while providing our executive board with powerful tools to track chapter engagement, manage events, and offer recruiters secure access to our student resume database.

This project is built with React 18, Vite, Tailwind CSS, and Supabase to provide a fast, beautiful, responsive, and completely serverless website.

---

## 🚀 Key Features

### 🌟 Public-Facing Platform (With Navigation)
*   **Modern Home Page (`/`)**: Features our mission, dynamic chapter metrics, a spotlight section for our SHPEtinas program, and an interactive look at the chapter.
*   **Events Calendar (`/events`)**: Automatically parses events from a central JS data file to populate an interactive calendar. Members can filter events by month and category (GBM, Social, Professional, Academic, Outreach, Fundraiser) and directly export them to Google Calendar or Apple Calendar (`.ics` files).
*   **Professional Development Hub (`/professional-development`)** *[NEW]*:
    *   **Animated Counter Banner**: Displays internship placement statistics and salary metrics that animate sequentially when scrolled into view.
    *   **Member Spotlight Carousel**: An interactive selector showing student internship experiences at top employers like GM, Ford, and Lincoln Electric.
    *   **National Convention Guide**: Step-by-step prep timeline (Registration, Resume, Company Research, Elevator Pitch, Business Attire, Follow-up) and logistics overview.
    *   **SponsorSHPE Call to Action**: Invites corporate partners to collaborate and redirects them to the Sponsors portal.
*   **E-Board Roster (`/eboard`)**: Displays student leaders in a custom, Loteria-styled grid layout. Cards use dynamic Tailwind CSS grids and flexbox centering fallbacks to align the orphaned last row cleanly on all screen sizes, showcasing standardized `.webp` headshots.
*   **Corporate Sponsor Portal (`/sponsors`)**: Highlights partner benefits and tiers (Buckeye, Carmen, Scarlet & Gray, Platinum). Contains a secure sponsor contact form powered by EmailJS, sending inquiries directly to the E-Board.
*   **Resource Hub (`/resources`)**: Provides study tips, tutoring links, and a direct link to view and read the official chapter **First-Year Guide PDF** (`/photos/First-Year-Guide.pdf`).

---

### 🗃 Chapter Operations & Security Portal (Hidden Routes)
These pages are not listed in the Navbar to maintain security and avoid clutter. They are accessed via QR codes, direct URLs, or distributed credentials.

#### 1. Student Check-In (`/attendance`)
*   **Mobile-First Check-In**: Quick check-in page for chapter events. Dropdown options stay synced with `src/data/events.js`.
*   **First-Time Meeting Logic**: Prompts first-time attendees for pronouns, how they heard about SHPE, and their major.
*   **Custom Major Entry**: If a student selects "Other" as their major, a text input appears allowing them to type their exact major (limited to 150 characters, saved in the database as `Other - [custom text]`).
*   **Spam Prevention**: Implements a 30-second submit cooldown to prevent accidental double-submits or database flooding.

#### 2. Student Resume Upload (`/resume-upload`)
*   **Secure Student Uploads**: Members can upload a PDF copy of their resume to be compiled into the official resume book.
*   **MIME-Type Spoofing Check**: Utilizes a magic-byte checker (verifying the file starts with the PDF signature `0x25, 0x50, 0x44, 0x46` before upload) to prevent malicious files from being uploaded as `.pdf`.
*   **OSU Email Domain Lock**: Restricts uploads strictly to `@osu.edu`, `@alumni.osu.edu`, and `@buckeyemail.osu.edu` addresses.
*   **Custom Major Integration**: Prompts students selecting 'Other' to specify their major in detail.
*   **Safe File Naming**: Re-encrypts filenames on upload to `submissions/${Date.now()}_${crypto.randomUUID()}.pdf` to avoid directory traversal and filename collision vulnerabilities.

#### 3. Recruiter Portal (`/company` & `/company/dashboard`)
*   **Access Control**: Recruiters enter a unique access code distributed by the E-Board.
*   **Expiring Sessions**: Session keys are stored in `sessionStorage` with an 8-hour Time-to-Live (TTL) expiration window.
*   **Visibility-Change Auto-Logout**: Monitors tab visibility; if a recruiter leaves the tab and returns after the TTL has expired, the application instantly auto-logs them out to secure student resumes on shared terminals.
*   **Resume Book Browser**: Recruiters can filter student resumes by name, major, and graduation year.
*   **Temporary Signed URLs**: Recruiter actions to View/Download resumes are served via Supabase Storage signed URLs that expire after 60 seconds.

#### 4. Secure Admin Panel (`/admin` & `/admin/resumes`)
*   **Admin Authentication**: Protected behind Supabase Email/Password authentication. Redirect guards secure the paths.
*   **Interactive Attendance Analytics**:
    *   **Overview Cards**: Displays overall unique members, total check-ins, and number of events.
    *   **Most Active Members Leaderboard**: Lists the top members with the highest event check-in frequencies in a scrollable list.
    *   **Stacked Bar Charts**: Compares First-Timers vs. Returning members per event.
    *   **Pie Charts**: Tracks attendance distribution by event category (GBMs, Professional, Socials, Study Sessions, etc.).
    *   **Retention Trends**: Line charts visualizing attendance growth over the semester.
*   **Inline Data Editing**: Allows admins to modify a member's major inline in the attendance database. Clicking the pencil icon opens an input field that updates the database record on Enter (or cancels on Escape).
*   **Secure CSV Export**: Allows downloading attendance records. Implements **CSV Injection mitigation** by sanitizing cells starting with formulas (`=`, `+`, `-`, `@`, tab, carriage return) with a single-quote prefix.
*   **Resume Book Admin Dashboard (`/admin/resumes`)**:
    *   **Review Pipeline**: Admins can view, approve, revoke, or delete pending resume submissions.
    *   **Access Code Generator**: Generates cryptographically secure access codes (using `crypto.getRandomValues`) for partner companies.
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
│   │   └── supabase.js   # Supabase client initialization (loads credentials from env)
│   ├── pages/            # Core page components (Home, Events, Eboard, Sponsors, Resources, etc.)
│   ├── App.jsx           # Client-side router declarations
│   ├── index.css         # Tailwind utility styling
│   └── main.jsx          # Entry point
├── tailwind.config.js    # Customized color system (SHPE branding palette)
├── vercel.json           # Vercel deployment headers & Content Security Policy (CSP)
└── package.json          # Node dependencies
```

---

## 🛡 Security Implementations

*   **Row-Level Security (RLS)**: Database tables enforce RLS policies:
    *   `attendance`: Public inserts allowed (to role `public`), Select restricted to `authenticated` users (E-Board).
    *   `resumes`: Public inserts allowed. Select, Update, Delete restricted. Signed URL download generation restricted to authenticated admins and validated recruiter access codes.
    *   `company_access`: Restricts modifications to authenticated admin accounts only.
*   **Vercel CSP Configuration**: Set up strict security headers in `vercel.json` (e.g. `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict `Content-Security-Policy` bounding script, connection, and frame loading scopes).
*   **Expiring Recruiter Tokens**: Recruiter sessions automatically lock after 8 hours of inactivity, checked on tab focus via `visibilitychange` window hooks.
*   **File Authentication Safeguards**:
    *   Rejecting files over 5MB.
    *   Validating PDF magic headers (`%PDF`) directly from byte buffers.
    *   Generating safe random file hashes upon upload to prevent directory traversals.
    *   Enforcing temporary 60-second read limits on generated PDF signed URLs.

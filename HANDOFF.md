# SHPE OSU Website — Engineering Handoff

_Last updated: 2026-05-15 | Session: 1760d6eb-c024-4aaf-a7a4-30b58694034f_

---

## 1. Project Goal

Build and maintain the public-facing website for the SHPE Ohio State University chapter.

**Ultimate deliverable:** A live, self-maintainable website that the current and future digital operations E-Board members can maintain.

**Constraints:**
- Must be very low cost or free to host (Vercel + Supabase free tier)
- Weekly content updates (events, photos) must require only editing one JS data file
- No backend server — all external services are SaaS (Supabase, EmailJS)
- Must pass to next Digital Operations Chair without institutional knowledge loss

**Current priorities (as of last session):**
1. Securing the new **Corporate Resume Portal** (currently under development) with proper Supabase Row Level Security (RLS) policies.
2. Ensure the "Most Active Members" scrollable card in the Admin Dashboard is scaling correctly as more members check in.
3. Verify mobile responsiveness on real devices for the newly centered E-Board grid and the new SHPEtinas spotlight section on the Home page.

---

## 2. Current State

### ✅ Working
- Full public site: Home, Events, E-Board, Sponsors, Resources
- Interactive calendar with Google Calendar / Apple Calendar (.ics) export
- Sponsor contact form via EmailJS (credentials live in `Sponsors.jsx`)
- Attendance form at `/attendance` — submits to Supabase `attendance` table
- Admin login at `/admin/login` — Supabase email/password auth
- Admin dashboard at `/admin` — check-ins, unique members, events, and a ranked "Most Active Members" scrollable list.
- **E-Board Page** — Fully populated with 19 members. Implemented a responsive Loteria-style layout with a custom CSS Grid configuration to automatically center the last row.
- **Home Page** — Cleaned up, removed the broken "Interest Form", and added a new "SHPEtinas" spotlight section.
- Auto-deploy: push to `main` → Vercel deploys in ~60s

### ⚠️ Partially Working / Needs Verification
- **Resume Portal (In Development):** New files were recently added for a Corporate Resume Book (`AdminResumes.jsx`, `CompanyDashboard.jsx`, `CompanyLogin.jsx`, `ResumeUpload.jsx`). Need to establish the Supabase tables, storage buckets, and RLS policies to handle secure resume uploads and time-limited corporate access.
- **Mobile layout:** Fixes applied to Eboard.jsx (flex-wrap grid centering) and Home.jsx. Not fully verified on physical mobile screens post-deploy.

### ❌ Broken / Missing
- No known missing files, but the resume portal is not fully wired up to a backend storage bucket yet.

### Architectural Decisions (do not reverse without reason)
- **No backend server.** Supabase REST API is called directly from the browser using the publishable key + RLS.
- **Events are data-driven.** All content lives in `src/data/events.js`. Never hardcode events in JSX.
- **Hidden routes pattern.** `/attendance`, `/admin`, and the new Resume/Company routes are not in the Navbar.
- **Supabase publishable key** (not anon JWT) — the project uses Supabase's newer key format `sb_publishable_...`. This required the RLS policy to use `to public` instead of `to anon`.
- **Feature Branch Workflow.** Development for major features (like the Admin Dashboard refactor) should be done on a branch (e.g. `feature/admin-stat-cards`) and merged via Pull Request to protect `main`.

---

## 3. Active Context

### Assumptions
- User pushes from `shpe-osu/` subdirectory only — there is an unrelated git repo in the parent `Documents/` directory that caused confusion. Always `cd shpe-osu` before any git command.
- Vercel is connected to GitHub repo `leo205/SHPE_OSU` on `main` branch.

### Environment
- **Local dev:** `cd /Users/leonardomedina/Documents/SHPE_web/shpe-osu && npm run dev` → `localhost:5173`
- **Node:** standard macOS install
- **Package manager:** npm

### Services & Credentials
| Service | Where credentials live | Notes |
|---|---|---|
| Supabase | `src/lib/supabase.js` | Project URL + publishable key hardcoded (safe — RLS protects data) |
| EmailJS | `src/pages/Sponsors.jsx` lines 18-20 | Service ID, Template ID, Public Key |
| Vercel | vercel.com dashboard | Connected to GitHub, auto-deploys on push |
| GitHub | github.com/leo205/SHPE_OSU | Main branch = production |

### Supabase Details
- **Project URL:** `https://ekuaqbelulybowihmact.supabase.co`
- **Publishable key:** `sb_publishable_62E03z0eVijDd2rctrUPoA_DbFzpWfp`
- **Table:** `attendance`
- **RLS policies:**
  - `Allow public inserts` → INSERT → `public` role
  - `Admins can read attendance` → SELECT → `authenticated` role
- **Admin users:** Created in Supabase Dashboard → Authentication → Users (not in code)

### Branch & Commands
```bash
# Always work from here
cd /Users/leonardomedina/Documents/SHPE_web/shpe-osu

# Dev server
npm run dev

# Safe Branch Workflow (Use this for new features!)
git checkout -b feature/my-new-feature
# (make changes)
git add .
git commit -m "added feature"
git push -u origin feature/my-new-feature
# Go to GitHub and merge to main

# Build check before pushing
npm run build
```

---

## 4. Files Touched

| File | Purpose | What Changed | Keep? |
|---|---|---|---|
| `src/App.jsx` | Routing | Added new routes for Resume Portal and Company Dashboard | ✅ Keep |
| `src/pages/Home.jsx` | Home page | Replaced Interest Form with SHPEtinas spotlight, fixed image aspect ratios | ✅ Keep |
| `src/pages/Eboard.jsx` | E-Board Page | Added 19 photos, changed border to black, applied `object-top` for Fern, centered last row using `flex-wrap justify-center` with explicit CSS width calculations | ✅ Keep |
| `src/pages/AdminDashboard.jsx` | Admin analytics | Removed "New" stat, renamed unique to "Members", added "Check-ins", refactored "Top Members" to rank all members in a scrollable list spanning 3 columns | ✅ Keep |
| `src/pages/ResumeUpload.jsx` | Resume Portal | NEW — UI for members to upload resumes | ✅ Keep |
| `src/pages/CompanyDashboard.jsx`| Resume Portal | NEW — UI for corporate sponsors to view resumes | ✅ Keep |
| `src/pages/CompanyLogin.jsx` | Resume Portal | NEW — Login for sponsors | ✅ Keep |
| `src/pages/AdminResumes.jsx` | Resume Portal | NEW — Dashboard for admins to approve/manage resumes | ✅ Keep |

---

## 5. Failed Attempts / Dead Ends

### CSS Grid Centering on E-Board
- **What happened:** Tried to use advanced `col-start` rules to center the last row of the E-Board grid (`grid-cols-5`). This broke the layout entirely because responsive grids shift items unexpectedly depending on screen size.
- **Fix:** Used a flexbox fallback. The grid container is now `flex flex-wrap justify-center`, and each card is explicitly sized using `w-[calc(25%-18px)]` to mimic the grid gap behavior. This correctly forces a center alignment on the orphaned last row.

### Supabase 403 on attendance insert
- **What happened:** Form submitted but got 403 Forbidden from Supabase
- **Root cause:** RLS policy used `to anon` but the new Supabase publishable key format (`sb_publishable_...`) does not map to the `anon` role the same way as the old JWT key
- **Fix:** Changed policy from `to anon` to `to public`
- **Do NOT retry `to anon`** without first verifying that the Supabase client version handles new key format correctly

---

## 6. Known Bugs / Risks

| Issue | Severity | Notes |
|---|---|---|
| Resume Portal Security | High | The new resume portal needs strong RLS policies. Do not upload actual user resumes until Supabase Storage is configured to block unauthorized reads. Companies need expiring access tokens. |
| Semester rollover | Medium | All events in `events.js` are Spring 2026. At semester start, clear old events and add new ones. The attendance dropdown auto-pulls from this file. |
| Admin Dashboard Performance | Low | Currently fetching the entire `attendance` table into memory to calculate "Most Active Members". This is fine for 1,000 rows, but will lag if the table grows to 10,000+. Consider a SQL View or RPC function in the future. |
| Outer git repo in Documents/ | Low | `/Users/leonardomedina/Documents/` has a `.git` folder. If user ever runs git from Documents or SHPE_web, it causes submodule confusion. Not harmful if avoided. |

---

## 7. Fast Restart Prompt

Paste this into a new chat session to get up to speed instantly:

> **Project:** SHPE Ohio State University chapter website. Vite + React + Tailwind CSS. Live at `shpe-osu.vercel.app`. Repo: `github.com/leo205/SHPE_OSU`, branch `main`, auto-deploys to Vercel on push. Always run commands from `/Users/leonardomedina/Documents/SHPE_web/shpe-osu/`.
>
> **Stack:** React Router DOM, Tailwind CSS (custom SHPE palette), EmailJS (sponsor form), Supabase (attendance DB + admin auth), Recharts (admin charts).
>
> **Key features built:**
> - `/attendance` — QR code check-in form
> - `/admin` — protected E-Board dashboard with advanced attendance analytics and scrollable leaderboard
> - `/eboard` — Loteria-themed eboard page with responsive flex-wrap centering
> - **In Progress:** Corporate Resume Book Portal (`/resumes`, `/company/login`)
>
> **Supabase:** Project `https://ekuaqbelulybowihmact.supabase.co`, publishable key in `src/lib/supabase.js`. RLS: `public` can INSERT, `authenticated` can SELECT. Admin users created manually in Supabase Dashboard.
>
> **Important gotcha:** RLS policy for public inserts must use `to public` not `to anon` due to the new Supabase publishable key format.
>
> **Current issue to continue:** [DESCRIBE WHAT YOU NEED HELP WITH]

---

## 8. Important Context Dump

### Asset folder structure
```
public/
├── photos/
│   ├── picsMain/          # Home page hero + mission images + shpeTinas.png
│   ├── events/            # Event photos (referenced in events.js)
│   ├── sponsors/          # Sponsor logos
│   ├── eboard/            # All 19 E-Board member headshots
│   ├── shpeLogo.png       # Used in forms
│   └── thompsonPic.jpg    # Resources page
└── vite.svg
```

### Weekly content update workflow (for E-Board)
1. Edit `src/data/events.js` — add new events, set `featured: true` for sidebar
2. Drop new photos in `public/photos/events/`
3. Reference photo in event object: `photo: '/photos/events/filename.jpg'`
4. `git add . && git commit -m "update events" && git push`

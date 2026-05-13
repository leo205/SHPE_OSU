# SHPE OSU Website — Engineering Handoff

_Last updated: 2025-05-13 | Session: 099c3d54-c7be-4324-aea6-6f776d4cf1d1_

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
1. Verify attendance form submission works on production (Supabase RLS fix was applied)
2. Mobile responsiveness — fixes applied but need real-device testing
3. `pickleBall.png` referenced in Events.jsx but file may not exist in `public/photos/events/`
4. Lincoln Electric logo file needs to be added to `public/photos/sponsors/` if not already present.

---

## 2. Current State

### ✅ Working
- Full public site: Home, Events, E-Board, Sponsors, Resources
- Interactive calendar with Google Calendar / Apple Calendar (.ics) export
- Sponsor contact form via EmailJS (credentials live in `Sponsors.jsx`)
- Attendance form at `/attendance` — submits to Supabase `attendance` table
- Admin login at `/admin/login` — Supabase email/password auth
- Admin dashboard at `/admin` — stat cards, bar/pie/line charts (Recharts), searchable table, CSV export
- Protected route guard redirects unauthenticated users to `/admin/login`
- ScrollToTop on every route change
- Auto-deploy: push to `main` → Vercel deploys in ~60s
- Upcoming events date filter fixed (compares YYYY-MM-DD strings, not timestamps)

### ⚠️ Partially Working / Needs Verification
- **Attendance form on production:** Supabase RLS policy was updated (`to anon` → `to public`) to fix 403 errors. Tested locally but production verification not confirmed in session.
- **Mobile layout:** Fixes applied to Home.jsx and Events.jsx. Not confirmed on real devices post-deploy.
- **Sponsor logos:** `public/photos/sponsors/` folder should contain: `lincolnElectric.png`, `Accenture.png`, `GM.png`, `JPMC.png`, `honda.png`, `AEP.png`. Folder name corrected this session — code updated to match.

### ❌ Broken / Missing
- `pickleBall.png` referenced at `/photos/events/pickleBall.png` in Events.jsx line 236 — file likely missing from `public/photos/events/`. Will silently fail (broken image).
- Lincoln Electric logo: path is set in Sponsors.jsx pointing to `public/photos/sponsors/lincolnElectric.png` — verify file exists in that folder.
- SHPE logo: `public/photos/shpeLogo.png` referenced in Attendance.jsx, AdminLogin.jsx, AdminDashboard.jsx — verify file exists.

### Architectural Decisions (do not reverse without reason)
- **No backend server.** Supabase REST API is called directly from the browser using the publishable key + RLS.
- **Events are data-driven.** All content lives in `src/data/events.js`. Never hardcode events in JSX.
- **Hidden routes pattern.** `/attendance` and `/admin` are not in the Navbar. They exist but are only reachable via direct URL or QR code.
- **Supabase publishable key** (not anon JWT) — the project uses Supabase's newer key format `sb_publishable_...`. This required the RLS policy to use `to public` instead of `to anon`.

---

## 3. Active Context

### Assumptions
- User pushes from `shpe-osu/` subdirectory only — there is an unrelated git repo in the parent `Documents/` directory that caused confusion. Always `cd shpe-osu` before any git command.
- Supabase is on the free tier — 50k row limit, more than enough for a semester.
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

# Deploy
git add .
git commit -m "message"
git push   # Vercel auto-deploys

# Build check before pushing
npm run build
```

---

## 4. Files Touched

| File | Purpose | What Changed | Keep? |
|---|---|---|---|
| `src/App.jsx` | Routing | Added `/attendance`, `/admin`, `/admin/login` routes outside Navbar/Footer layout | ✅ Keep |
| `src/pages/Home.jsx` | Home page | Mobile fixes: removed `hidden lg:flex` from hero image, scaled fonts, reduced button padding, hid mission badge on mobile | ✅ Keep |
| `src/pages/Events.jsx` | Events + calendar | Fixed upcoming events date filter (string compare), mobile hero fixes, font scaling, photo collage hidden on mobile | ✅ Keep |
| `src/pages/Sponsors.jsx` | Sponsor portal | Added real sponsor logos + paths, updated hero image, changed grid to flex-wrap | ✅ Keep |
| `src/pages/Resources.jsx` | Resources page | Updated tutoring link, added thompsonPic.jpg | ✅ Keep |
| `src/data/events.js` | Event data | Fixed date filter bug, added `Fundraiser` category colors | ✅ Keep |
| `src/lib/supabase.js` | Supabase client | NEW — initializes Supabase with project URL + publishable key | ✅ Keep |
| `src/pages/Attendance.jsx` | QR code check-in form | NEW — 2-section form, auto-pulls events from events.js, submits to Supabase | ✅ Keep |
| `src/pages/AdminLogin.jsx` | E-Board login | NEW — Supabase email/password auth | ✅ Keep |
| `src/pages/AdminDashboard.jsx` | Admin analytics | NEW — stat cards, Recharts charts, searchable table, CSV export | ✅ Keep |
| `src/components/ProtectedRoute.jsx` | Auth guard | NEW — redirects to login if no Supabase session | ✅ Keep |
| `src/components/ScrollToTop.jsx` | Scroll behavior | NEW — scrolls to top on route change | ✅ Keep |
| `public/photos/picsMain/` | Hero + mission images | User added: SHPE_convention.png, SHPE_volunteering.png, shpeBrunch.jpg, brunchPic2.jpg | ✅ Keep |
| `public/photos/events/` | Event photos | User added: cakeSHPE.jpg, eventGM.jpeg, finalEventSHPE.png, finalGBM.png, fundraiserSHPE.png | ✅ Keep |
| `public/photos/sponsors/` | Sponsor logos | Folder name corrected from `sponsers` → `sponsors` this session. All 7 code references in Sponsors.jsx updated. | ✅ Keep |

---

## 5. Failed Attempts / Dead Ends

### Supabase 403 on attendance insert
- **What happened:** Form submitted but got 403 Forbidden from Supabase
- **Root cause:** RLS policy used `to anon` but the new Supabase publishable key format (`sb_publishable_...`) does not map to the `anon` role the same way as the old JWT key
- **Fix:** Changed policy from `to anon` to `to public`
- **SQL that works:**
  ```sql
  drop policy if exists "Allow public inserts" on attendance;
  create policy "Allow public inserts"
    on attendance for insert
    to public
    with check (true);
  ```
- **Do NOT retry `to anon`** without first verifying that the Supabase client version handles new key format correctly

### Git from wrong directory
- User ran `git add .` from `/Users/leonardomedina/Documents/SHPE_web/` instead of `.../shpe-osu/`
- This caused the outer git repo (at `Documents/`) to try to stage `shpe-osu` as a submodule
- **Fix:** `cd /Users/leonardomedina/Documents && git rm --cached SHPE_web/shpe-osu`
- **Always run git from `shpe-osu/`**

### Upcoming events showing empty
- **Root cause:** `new Date('2026-04-24') >= new Date()` fails at any time after midnight because the date string parses as midnight
- **Fix:** Compare ISO date strings directly: `e.date >= todayStr` where `todayStr = today.toISOString().slice(0, 10)`

---

## 6. Known Bugs / Risks

| Issue | Severity | Notes |
|---|---|---|
| `pickleBall.png` missing | Medium | Events.jsx line 236 references this file. Silent broken image. Either add the file to `public/photos/events/` or update to an existing image. |
| `shpeLogo.png` unverified | Medium | Referenced in Attendance, AdminLogin, AdminDashboard. If missing, logos silently fail. Check `public/photos/shpeLogo.png` exists. |
| Semester rollover | Medium | All events in `events.js` are Spring 2026. At semester start, clear old events and add new ones. The attendance dropdown auto-pulls from this file. |
| Admin password management | Low | Admin accounts are created manually in Supabase Dashboard. No self-service password reset flow in the UI — users must contact whoever has Supabase access. |
| Supabase free tier limits | Low | 50k rows, 500MB storage. A chapter with 200 members × 20 events = 4,000 rows/semester. No risk for several years. |
| Outer git repo in Documents/ | Low | `/Users/leonardomedina/Documents/` has a `.git` folder. If user ever runs git from Documents or SHPE_web, it causes submodule confusion. Not harmful if avoided. |
| EmailJS credentials in source | Low | Service ID, Template ID, and Public Key are hardcoded in Sponsors.jsx. This is standard for EmailJS (public key is safe to expose). No action needed. |
| Mobile testing gap | Low | Responsive fixes were applied but only verified in browser DevTools, not on physical devices. May need tweaks for specific phones. |

---

## 7. Fast Restart Prompt

Paste this into a new chat session to get up to speed instantly:

---

> **Project:** SHPE Ohio State University chapter website. Vite + React + Tailwind CSS. Live at `shpe-osu.vercel.app`. Repo: `github.com/leo205/SHPE_OSU`, branch `main`, auto-deploys to Vercel on push. Always run commands from `/Users/leonardomedina/Documents/SHPE_web/shpe-osu/`.
>
> **Stack:** React Router DOM, Tailwind CSS (custom SHPE palette), EmailJS (sponsor form), Supabase (attendance DB + admin auth), Recharts (admin charts).
>
> **Key features built:**
> - `/attendance` — QR code check-in form (no navbar), submits to Supabase `attendance` table
> - `/admin/login` + `/admin` — protected E-Board dashboard with attendance analytics
> - Events calendar with Google/Apple Calendar export
> - Sponsor contact form via EmailJS
>
> **Supabase:** Project `https://ekuaqbelulybowihmact.supabase.co`, publishable key in `src/lib/supabase.js`. RLS: `public` can INSERT, `authenticated` can SELECT. Admin users created manually in Supabase Dashboard → Auth → Users.
>
> **Important gotcha:** RLS policy must use `to public` not `to anon` — the new Supabase publishable key (`sb_publishable_...`) doesn't map to `anon` role.
>
> **Current issue to continue:** [DESCRIBE WHAT YOU NEED HELP WITH]
>
> **Do not:** Run git from `SHPE_web/` — always `cd shpe-osu` first. Do not revert the `to public` RLS policy back to `to anon`.

---

## 8. Important Context Dump

### Asset folder structure
```
public/
├── photos/
│   ├── picsMain/          # Home page hero + mission images
│   │   ├── SHPE_convention.png
│   │   ├── SHPE_volunteering.png
│   │   ├── shpeBrunch.jpg
│   │   └── brunchPic2.jpg
│   ├── events/            # Event photos (referenced in events.js + Events.jsx)
│   │   ├── cakeSHPE.jpg
│   │   ├── eventGM.jpeg
│   │   ├── finalEventSHPE.png
│   │   ├── finalGBM.png
│   │   └── fundraiserSHPE.png
│   ├── sponsors/          # Sponsor logos (corrected from sponsers)
│   │   ├── lincolnElectric.png
│   │   ├── Accenture.png
│   │   ├── GM.png
│   │   ├── JPMC.png
│   │   ├── honda.png
│   │   └── AEP.png
│   ├── eboard/            # E-Board member photos
│   ├── shpeLogo.png       # Used in /attendance, /admin/login, /admin
│   └── thompsonPic.jpg    # Resources page
└── vite.svg
```

### Weekly content update workflow (for E-Board)
1. Edit `src/data/events.js` — add new events, set `featured: true` for sidebar
2. Drop new photos in `public/photos/events/`
3. Reference photo in event object: `photo: '/photos/events/filename.jpg'`
4. `git add . && git commit -m "update events" && git push`

### Attendance QR code
- URL: `https://shpe-osu.vercel.app/attendance`
- Generate QR at qr-code-generator.com
- Event list auto-pulls from `src/data/events.js` — no code change needed when events update

### Supabase attendance table schema
```sql
create table attendance (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  event_name text not null,
  first_name text not null,
  last_name_dotnum text not null,   -- format: "LastName.##" e.g. "Buckeye.01"
  year text not null,
  is_first_meeting boolean default false,
  feedback text,
  major text,        -- only filled for first-timers
  pronouns text,     -- only filled for first-timers
  how_heard text     -- only filled for first-timers
);
```

### Navbar routes (these appear in nav)
`/` `/events` `/eboard` `/sponsors` `/resources`

### Hidden routes (no nav link — direct URL only)
`/attendance` `/admin` `/admin/login`

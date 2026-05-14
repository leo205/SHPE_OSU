# SHPE Ohio State University - Chapter Website

Welcome to the official repository for the Society of Hispanic Professional Engineers (SHPE) chapter at The Ohio State University. This web application serves as the central hub for our members, prospective members, and corporate sponsors, while providing our executive board with powerful tools to track chapter engagement and growth.

![SHPE OSU Hero](/public/photos/shpeLogo.png)

## 🚀 Features

### Public-Facing Platform
- **Modern Landing Pages:** High-impact, responsive design showcasing our mission, development areas, and chapter metrics.
- **Dynamic Events Calendar:** Automatically updates based on upcoming events data. Users can filter events and directly export them to Google Calendar or Apple Calendar (`.ics`).
- **Corporate Sponsor Portal:** Showcases current partners, outlines sponsorship tiers (Buckeye, Carmen, Scarlet & Gray, Platinum), and includes an integrated contact form that sends inquiries directly to the E-Board.
- **Resource Hub & E-Board Roster:** Easy access to member resources, tutoring links, and executive board contact information.

### Chapter Operations & Analytics
- **QR Code Attendance System (`/attendance`):** A streamlined check-in form designed for mobile devices. Automatically pulls current events and records attendee data (First Name, Last Name.#, Year, Major, First-Time Status).
- **Secure Admin Dashboard (`/admin`):** Protected behind authentication, this dashboard allows the E-Board to monitor chapter health in real-time.
- **Advanced Analytics:**
  - **Most Active Member Tracking:** Automatically identifies top attendees.
  - **Event Effectiveness:** Stacked bar charts showing First-Time vs. Returning members per event.
  - **Engagement Trends:** Line charts tracking attendance growth over the semester.
  - **Attendance by Event Type:** Pie charts categorizing events (GBMs, Workshops, Socials) to see what draws the most engagement.
- **Data Management:** Searchable data tables with a 1-click **CSV Export** feature for university reporting or newsletter lists.

---

## 🛠 Tech Stack

This project was built with modern, scalable, and entirely free-tier services to ensure zero maintenance cost for the student organization.

### Core Technologies
- **[React 18](https://react.dev/)** - Frontend UI library
- **[Vite](https://vitejs.dev/)** - Lightning-fast build tool and development server
- **[React Router DOM](https://reactrouter.com/)** - Client-side routing (handling public and hidden admin routes)
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework (customized with SHPE brand colors)

### Backend & Data Services
- **[Supabase](https://supabase.com/)** - Open-source Firebase alternative
  - **PostgreSQL Database:** Stores all attendance records.
  - **Row Level Security (RLS):** Ensures public users can insert attendance, but only authenticated admins can read the data.
  - **Authentication:** Email/Password auth for E-Board admin access.
- **[EmailJS](https://www.emailjs.com/)** - Serverless email infrastructure for the Corporate Sponsor contact form.

### Data Visualization
- **[Recharts](https://recharts.org/)** - Composable charting library built on React components (used for the Admin Dashboard analytics).

### Hosting & Deployment
- **[Vercel](https://vercel.com/)** - Seamless, automated deployments directly from the `main` branch.

---

## 💻 Local Development Setup

To run this project locally on your machine:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/leo205/SHPE_OSU.git
   cd SHPE_OSU/shpe-osu
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 🗂 Project Structure Highlight

- `src/pages/` - Contains all main route components (`Home.jsx`, `Events.jsx`, `AdminDashboard.jsx`, etc.)
- `src/components/` - Reusable UI components (`Footer.jsx`, `ImagePlaceholder.jsx`, etc.)
- `src/data/` - Static data files (like `events.js` for the calendar)
- `src/lib/` - Service initializations (e.g., `supabase.js`)
- `public/photos/` - All static images, categorized by `events`, `sponsors`, `eboard`, and `picsMain`.

---

## 📝 Maintenance & Handoff

For detailed instructions on how to maintain the site, add new events, update the Supabase schema, or handle the semester rollover, please refer to the `HANDOFF.md` file included in this repository. 

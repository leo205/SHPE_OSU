/**
 * ============================================================
 *  SHPE OSU — EVENTS DATA
 *  OFFLINE FALLBACK — normal event updates belong in the Admin Dashboard.
 * ============================================================
 *
 *  Mirror an important database event here only when check-in must continue
 *  during a Supabase outage. Keep its title and date character-identical to the
 *  database row so mergeEvents() can de-duplicate it safely.
 *
 *  Each event object has these fields:
 *    id          → unique number (just increment)
 *    title       → event name
 *    date        → "YYYY-MM-DD" format  e.g. "2025-09-05"
 *    time        → display string       e.g. "6:00 PM"
 *    endTime     → (optional) display   e.g. "8:00 PM"
 *    location    → building / room      e.g. "Scott Lab 100"
 *    description → 1-2 sentences about the event
 *    category    → one of: "GBM" | "Social" | "Professional" | "Academic" | "Outreach"
 *    featured    → true/false — show in the Featured Events sidebar?
 *    rsvpUrl     → (optional) link to RSVP form
 */

export const events = [
  // ── Autumn 2026 ─────────────────────────────────────────────────────────────
  // Mirrored from the Supabase `events` table on 2026-08-25. The DATABASE is the
  // real source for these — they were added through the Admin Dashboard and are
  // edited there. These copies exist for one reason: if Supabase is unreachable,
  // the check-in dropdown and the calendar still offer them. Without a copy here
  // an outage during a GBM leaves students unable to select the meeting they are
  // standing in.
  //
  // ⚠️  `title` and `date` must stay character-identical to the database row.
  // mergeEvents() de-duplicates on `${title}|${date}`, so a drifted title shows
  // the event TWICE on the calendar — and the check-in label built from it
  // (`8/28 - <title>`) is the exact string attendance is grouped by.
  //
  // `photo` is deliberately empty. The real images are served from Supabase
  // storage, which is unreachable in exactly the situation these entries exist
  // for; Events.jsx renders a placeholder when photo is empty.
  {
    id: 7,
    title: 'General Body Meeting #1: SHPES AND SALSA',
    date: '2026-08-28',
    time: '6:00 PM',
    endTime: '7:30 PM',
    location: 'CURL VIEWPOINT',
    description:
      'Join us at our first GBM of the semester! Meet the E-Board, learn about SHPE, connect with our familia, and enjoy FREE',
    category: 'GBM',
    featured: true,
    rsvpUrl: '',
    photo: '',
  },
  {
    id: 8,
    title: 'RESUME WORKSHOP w/ RTX',
    date: '2026-08-27',
    time: '6:30 PM',
    endTime: '8:00 PM',
    location: 'FONTANA RM 2040',
    description:
      'Kick off the year with Pratt & Whitney! Strengthen your resume, showcase your skills, and learn how to stand out for aerospace and engineering career opportunities.',
    category: 'Professional',
    featured: false,
    rsvpUrl: '',
    photo: '',
  },
  {
    id: 1,
    title: 'General Body Meeting #4 — Final',
    date: '2026-04-24',
    time: '6:00 PM',
    endTime: '8:00 PM',
    location: 'RPAC Courts',
    description:
      'Join us for our last GBM of the semester: Carne Asada & Volleyball!🌮🏐🔥',
    category: 'GBM',
    featured: true,
    rsvpUrl: '',
    photo: '/photos/events/finalGBM.webp',
  },
  {
    id: 2,
    title: 'SHPE Fruit Cup Fundraiser',
    date: '2026-04-13',
    time: '3:00 PM',
    endTime: '5:00 PM',
    location: 'North Oval',
    description:
      'Come support SHPE OSU by buying a fruit cup! Only $5 for a cup of fresh, delicious fruit.',
    category: 'Fundraiser',
    featured: true,
    rsvpUrl: '',
    photo: '/photos/events/fundraiserSHPE.webp',
  },
  {
    id: 3,
    title: 'Internship Panel Spring Internship',
    date: '2026-04-15',
    time: '6:00 PM',
    endTime: '7:00 PM',
    location: 'Evans Lab 2001',
    description:
      'Join us for an insightful panel discussion where upperclassmen share their internship experiences and offer tips and tricks to help you land your own internship. Come with questions, leave with confidence!',
    category: 'Professional',
    featured: false,
    rsvpUrl: '',
    photo: '/photos/events/finalEventSHPE.webp',
  },
  {
    id: 4,
    title: 'Study Tables',
    date: '2025-09-30',
    time: '6:00 PM',
    endTime: '9:00 PM',
    location: 'Smith Lab 1138',
    description:
      'Weekly group study sessions. Grind through your engineering courses with the support of your peers. Free snacks!',
    category: 'Academic',
    featured: false,
    rsvpUrl: '',
  },
  {
    id: 5,
    title: 'Tech Talk: AI in Engineering',
    date: '2025-10-03',
    time: '7:00 PM',
    endTime: '8:30 PM',
    location: 'Caldwell Lab 120',
    description:
      'A deep dive into how Artificial Intelligence is reshaping civil, mechanical, and electrical engineering careers.',
    category: 'Professional',
    featured: false,
    rsvpUrl: '',
  },
  {
    id: 6,
    title: 'Community Outreach: STEM Day',
    date: '2025-10-18',
    time: '10:00 AM',
    endTime: '2:00 PM',
    location: 'Columbus Public Library',
    description:
      'Join us as we share the joy of STEM with local K-12 students through hands-on activities and demos.',
    category: 'Outreach',
    featured: false,
    rsvpUrl: '',
  },
];

/** Category color mapping — used by the calendar and cards */
export const categoryColors = {
  GBM: {
    bg: 'bg-primary-container',
    text: 'text-on-primary-container',
    dot: 'bg-primary',
    badge: 'bg-primary text-on-primary',
  },
  Social: {
    bg: 'bg-secondary-container',
    text: 'text-on-secondary-container',
    dot: 'bg-secondary',
    badge: 'bg-secondary text-on-secondary',
  },
  Professional: {
    bg: 'bg-tertiary-container',
    text: 'text-on-tertiary-container',
    dot: 'bg-tertiary',
    badge: 'bg-tertiary text-on-tertiary',
  },
  Academic: {
    bg: 'bg-surface-container-high',
    text: 'text-on-surface',
    dot: 'bg-outline',
    badge: 'bg-outline text-surface',
  },
  Outreach: {
    bg: 'bg-secondary-container',
    text: 'text-on-secondary-container',
    dot: 'bg-secondary-dim',
    badge: 'bg-secondary-dim text-on-secondary',
  },
  Fundraiser: {
    bg: 'bg-tertiary-container',
    text: 'text-on-tertiary-container',
    dot: 'bg-tertiary-fixed-dim',
    badge: 'bg-tertiary text-on-tertiary',
  },
};

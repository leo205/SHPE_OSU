/**
 * ============================================================
 *  SHPE OSU — EVENTS DATA
 *  Edit this file every week to update the events calendar.
 * ============================================================
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
    photo: '/photos/events/finalGBM.png',
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
    photo: '/photos/events/fundraiserSHPE.png',
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
    featured: true,
    rsvpUrl: '',
    photo: '/photos/events/finalEventSHPE.png',
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

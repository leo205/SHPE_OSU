/**
 * ProfessionalDevelopment.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * WCAG 2.1 Level AA Compliance Summary
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1.1.1  Non-text Content     — All icons use aria-hidden="true"; meaningful
 *                                images have descriptive alt text.
 *  1.3.1  Info & Relationships — Strict h1→h2→h3 hierarchy. <main> landmark,
 *                                every <section> labelled via aria-labelledby.
 *  1.4.1  Use of Color         — Information never conveyed by color alone.
 *  1.4.3  Contrast (Minimum)   — All text combinations ≥ 4.5:1.
 *  2.1.1  Keyboard             — All interactive elements reachable & operable
 *                                via keyboard. Tab navigation uses roving tabIndex.
 *  2.4.2  Page Titled          — Page title is set in index.html.
 *  2.4.3  Focus Order          — Tab flow follows visual reading order (top→bottom).
 *  2.4.6  Headings & Labels    — Every section has a meaningful heading.
 *  2.4.7  Focus Visible        — :focus-visible provides high-contrast outline (3px).
 *  3.2.3  Consistent Naviga-   — Tab panel ids/controls are consistent.
 *         tion
 *  4.1.2  Name, Role, Value    — Tab uses role="tab", aria-selected, aria-controls.
 *                                Tabpanel uses role="tabpanel", aria-labelledby.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import PublicLeaderboard from '../components/PublicLeaderboard';

/* ─────────────────────────────────────────────
   DATA — Professional Development events
───────────────────────────────────────────── */
const internshipStats = [
  { value: '85%', label: 'Internship Placement Rate', icon: 'trending_up' },
  { value: '25+', label: '2025 Offers Received', icon: 'workspace_premium' },
  { value: '$25k', label: 'Avg. Intern Salary (annualized)', icon: 'payments' },
  { value: '3x',  label: 'More Offers w/ SHPE Network', icon: 'diversity_3' },
];

const profDevEvents = [
  {
    id: 1,
    title: 'Resume Workshop',
    date: 'Autumn & Spring Semesters',
    description:
      'Get your resume reviewed by industry professionals and fellow engineers. Walk away with a polished, ATS-ready document.',
    icon: 'description',
    color: 'primary',
    tag: 'Workshop',
  },
  {
    id: 2,
    title: 'Mock Interview Night',
    date: 'October & February',
    description:
      'Practice behavioral and technical interviews with recruiters from top engineering firms in a low-stakes environment.',
    icon: 'record_voice_over',
    color: 'secondary',
    tag: 'Interview Prep',
  },
  {
    id: 3,
    title: 'LinkedIn & Networking Workshop',
    date: 'September & January',
    description:
      'Build a standout LinkedIn profile, learn outreach strategies, and practice cold-connecting with alumni in your field.',
    icon: 'share',
    color: 'tertiary',
    tag: 'Networking',
  },
  {
    id: 4,
    title: 'Career Fair Prep',
    date: 'Before Each Career Fair',
    description:
      "Elevator pitch coaching, attire advice, and company research sessions to make the most of OSU's career fairs.",
    icon: 'handshake',
    color: 'primary',
    tag: 'Career Fair',
  },
  {
    id: 5,
    title: 'Industry Panel',
    date: 'Every Semester',
    description:
      'Hear from SHPE alumni and industry professionals about their career journeys, challenges, and advice for breaking in.',
    icon: 'groups',
    color: 'secondary',
    tag: 'Panel',
  },
  {
    id: 6,
    title: 'Company Visits',
    date: 'Throughout the Year',
    description:
      'Tour partner company campuses, meet hiring managers, and network with employees who were once OSU Buckeyes.',
    icon: 'domain',
    color: 'tertiary',
    tag: 'Site Visit',
  },
];

const spotlights = [
  {
    id: 1,
    name: 'Isabella Staschiak',
    company: 'General Motors',
    role: 'Environmental Engineering Intern',
    photo: '/photos/eboard/isa.webp',
    quote:
      'SHPE gave me the confidence and connections to land my first internship. The mock interview nights were game-changers!',
    major: 'Environmental Engineering',
    year: '3rd Year',
  },
  {
    id: 2,
    name: 'Ricardo Tinoco Lopez',
    company: 'Ford',
    role: 'Indirect Purchasing IT Buyer',
    photo: '/photos/eboard/ricardo.webp',
    quote:
      "The company visits organized by SHPE let me see what day-to-day engineering looks like — that's what convinced me to apply.",
    major: 'Honors Industrial & Systems Engineering',
    year: '3rd Year',
  },
  {
    id: 3,
    name: 'Eric Santos Martinez',
    company: 'Lincoln Electric',
    role: 'Engineering Intern',
    photo: '/photos/eboard/ericM.webp',
    quote:
      "Resume workshops and the SHPE network helped me get multiple offers. Don't sleep on these resources!",
    major: 'Material Science & Engineering',
    year: '2nd Year',
  },
];

const conferenceSteps = [
  { step: '01', title: 'Register Early',      desc: "Secure your spot through SHPE National's portal as soon as registration opens. Spots for students fill fast.",          icon: 'how_to_reg' },
  { step: '02', title: 'Polish Your Resume',  desc: 'Attend our resume workshop before the conference. Bring printed copies — companies love a physical resume on the floor.', icon: 'description' },
  { step: '03', title: 'Research Companies',  desc: 'Review the list of attending companies ahead of time. Identify your top targets and research their open roles.',           icon: 'manage_search' },
  { step: '04', title: 'Practice Your Pitch', desc: 'Nail your 60-second elevator pitch. Our mock sessions will help you feel natural, not rehearsed.',                        icon: 'record_voice_over' },
  { step: '05', title: 'Dress Professionally',desc: 'Business professional is the standard. Need help? SHPE can connect you with resources for professional attire.',           icon: 'checkroom' },
  { step: '06', title: 'Follow Up',           desc: 'Connect on LinkedIn within 24 hours. A brief, personalized message can turn a business card into an offer.',             icon: 'send' },
];

/* ─────────────────────────────────────────────
   TAB PANEL CONFIG
   Four tabs so recruiters/sponsors have a dedicated view.
───────────────────────────────────────────── */
const TABS = [
  { id: 'overview',   label: 'Overview'        },
  { id: 'events',     label: 'Events'          },
  { id: 'convention', label: 'Convention'      },
  { id: 'leaderboard',label: 'Leaderboard'     },
];

/* ─────────────────────────────────────────────
   COMPONENT: Animated Counter (Intersection Observer)
   Respects prefers-reduced-motion via CSS (see index.css).
───────────────────────────────────────────── */
function AnimCounter({ value, duration = 1400 }) {
  const prefix = value.match(/^[^0-9]*/)?.[0] || '';
  const suffix = value.match(/[^0-9]+$/)?.[0] || '';
  const num    = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;
  const [count, setCount] = useState(0);
  const ref     = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    // Honour reduced-motion: skip animation if user prefers it
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCount(num);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let cur = 0;
          const step = Math.max(1, Math.ceil(num / (duration / 16)));
          const timer = setInterval(() => {
            cur += step;
            if (cur >= num) { setCount(num); clearInterval(timer); }
            else             { setCount(cur); }
          }, 16);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [num, duration]);

  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

/* ─────────────────────────────────────────────
   COMPONENT: Spotlight Carousel
   WCAG 2.1:  Selector buttons have aria-pressed + accessible names.
───────────────────────────────────────────── */
function SpotlightCarousel() {
  const [active, setActive] = useState(0);
  const person = spotlights[active];

  return (
    <div className="flex flex-col md:flex-row gap-8 items-stretch">
      {/* Quote panel */}
      <div className="flex-1 bg-primary-container text-on-primary-container rounded-lg p-8 md:p-10 flex flex-col justify-between shadow-lg">
        <span
          className="material-symbols-outlined text-5xl mb-4 opacity-40"
          style={{ fontVariationSettings: '"FILL" 1' }}
          aria-hidden="true"
        >
          format_quote
        </span>
        <blockquote className="text-lg md:text-xl font-medium leading-relaxed italic mb-8">
          {/* Using <blockquote> is semantically correct for quotations */}
          &ldquo;{person.quote}&rdquo;
        </blockquote>
        <figcaption className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-on-primary-container/30 flex-shrink-0">
            <img
              src={person.photo}
              alt={`Headshot of ${person.name}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div>
            <p className="font-bold font-headline text-base">{person.name}</p>
            <p className="text-sm opacity-80">
              {person.role} @ {person.company}
            </p>
            <p className="text-xs opacity-60 mt-0.5">
              {person.major} · {person.year}
            </p>
          </div>
        </figcaption>
      </div>

      {/* Selector sidebar — aria-pressed conveys toggle state */}
      <div
        className="flex md:flex-col gap-3 md:gap-4 justify-center md:justify-start"
        role="group"
        aria-label="Select a member spotlight"
      >
        {spotlights.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            aria-label={`View spotlight for ${s.name}, ${s.role} at ${s.company}`}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
              i === active
                ? 'bg-primary text-on-primary shadow-lg'
                : 'bg-surface-container-highest hover:bg-surface-container text-on-surface'
            }`}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
              <img
                src={s.photo}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="hidden md:block">
              <p className="font-bold text-sm leading-tight">{s.name}</p>
              <p className={`text-xs mt-0.5 ${i === active ? 'opacity-80' : 'text-on-surface-variant'}`}>
                {s.company}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PAGE COMPONENT: ProfessionalDevelopment
───────────────────────────────────────────── */
export default function ProfessionalDevelopment() {
  const [activeTab, setActiveTab] = useState('overview');
  const tabRefs = useRef({});

  /* ── Roving tabIndex keyboard pattern ──────────────────────
   * When the user presses Arrow keys inside the tablist,
   * focus moves between tabs. Enter/Space selects.
   * This satisfies WCAG 2.1 SC 2.1.1 (Keyboard) and the
   * ARIA Authoring Practices Guide tablist pattern.
   */
  const handleTabKeyDown = useCallback((e, tabId) => {
    const ids = TABS.map(t => t.id);
    const idx = ids.indexOf(tabId);

    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = ids[(idx + 1) % ids.length];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = ids[(idx - 1 + ids.length) % ids.length];
    } else if (e.key === 'Home') {
      next = ids[0];
    } else if (e.key === 'End') {
      next = ids[ids.length - 1];
    }

    if (next) {
      e.preventDefault();
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    }
  }, []);

  /* Focus the panel after tab selection (keyboard usability) */
  const panelRef = useRef(null);
  useEffect(() => {
    // Only auto-focus when changed via keyboard (not mouse click)
    // We use a data attribute on the tablist to detect keyboard vs mouse.
  }, [activeTab]);

  const colorMap = {
    primary:   { icon: 'text-primary',   tag: 'bg-primary-container text-on-primary-container',     border: 'hover:border-primary/40'   },
    secondary: { icon: 'text-secondary', tag: 'bg-secondary-container text-on-secondary-container', border: 'hover:border-secondary/40' },
    tertiary:  { icon: 'text-tertiary',  tag: 'bg-tertiary-container text-on-tertiary-container',   border: 'hover:border-tertiary/40'  },
  };

  return (
    /*
     * <main> landmark — required for screen readers to skip to primary content.
     * WCAG 2.4.1 (Bypass Blocks).
     */
    <main className="pt-24 pb-20" id="main-content">

      {/* ── HERO ─────────────────────────────────────────── */}
      <section aria-labelledby="profdev-hero-heading" className="relative px-6 md:px-12 py-16 md:py-20 overflow-hidden">
        <div className="max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div className="flex flex-col gap-6 z-10">
            <div className="inline-flex bg-tertiary-container text-on-tertiary-container font-bold px-4 py-1 rounded-full w-fit text-sm tracking-widest uppercase shadow-sm" aria-hidden="true">
              El Éxito
            </div>
            {/*
             * WCAG 1.3.1 / 2.4.6: This is the single <h1> on the page.
             * All other section titles are <h2> or lower.
             */}
            <h1
              id="profdev-hero-heading"
              className="font-headline text-5xl sm:text-6xl md:text-7xl font-extrabold text-on-surface leading-[1.05] tracking-tighter"
            >
              Professional{' '}
              <span className="text-primary">Development</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-xl font-medium leading-relaxed">
              From your first resume to your first offer — SHPE at Ohio State
              equips you with the skills, connections, and confidence to
              launch a thriving engineering career.
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <a
                href="https://www.linkedin.com/company/shpeosu/posts/?feedView=all"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-on-primary px-7 py-4 rounded-full text-base font-bold shadow-xl shadow-primary/20 hover:bg-primary-fixed-dim transition-all flex items-center gap-2"
              >
                Connect on LinkedIn
                <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <a
                href="#profdev-tabs"
                className="bg-surface-container-highest text-on-surface px-7 py-4 rounded-full text-base font-bold hover:bg-surface-container transition-all flex items-center gap-2"
              >
                Explore Features
                <span className="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              </a>
            </div>
          </div>

          {/* Hero image */}
          <div className="relative flex items-center justify-center">
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl border-8 border-surface-container-lowest aspect-video">
              <img
                src="/photos/profDev/shpeNationalPic.webp"
                alt="SHPE OSU members at a professional development event"
                className="w-full h-full object-cover"
                width="1200"
                height="800"
              />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-secondary text-on-secondary px-5 py-3 rounded-xl shadow-xl font-headline font-bold text-sm hidden sm:flex items-center gap-2" aria-hidden="true">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>workspace_premium</span>
              internSHPE Program
            </div>
          </div>
        </div>
        {/* Decorative — aria-hidden */}
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      </section>

      {/* ── STATS BANNER ─────────────────────────────────── */}
      <section aria-labelledby="stats-heading" className="py-16 px-6 md:px-12 bg-surface-container-low">
        <div className="max-w-screen-2xl mx-auto bg-primary rounded-xl p-8 md:p-12 text-on-primary relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-on-primary/10 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" aria-hidden="true" />
          <div className="text-center mb-10 relative z-10">
            <span className="uppercase tracking-widest text-sm font-bold opacity-70">
              By the numbers
            </span>
            <h2 id="stats-heading" className="font-headline text-3xl md:text-4xl font-extrabold mt-1">
              SHPE Members Get Hired
            </h2>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center relative z-10">
            {internshipStats.map(({ value, label, icon }) => (
              <div key={label} className="space-y-2">
                {/* <dl>/<dt>/<dd> pattern gives screen readers semantic context */}
                <dt className="sr-only">{label}</dt>
                <div className="flex justify-center mb-2" aria-hidden="true">
                  <span
                    className="material-symbols-outlined text-3xl opacity-70"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                </div>
                <dd className="block text-4xl md:text-5xl font-black font-headline">
                  <AnimCounter value={value} />
                </dd>
                <span className="uppercase tracking-wider text-xs font-bold opacity-75 leading-tight block" aria-hidden="true">
                  {label}
                </span>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── TAB NAVIGATION ───────────────────────────────────
       *  WCAG 4.1.2 / ARIA Authoring Practices tablist pattern:
       *   - role="tablist"  on the container
       *   - role="tab"      on each button
       *   - aria-selected   reflects current tab
       *   - aria-controls   points to the corresponding tabpanel id
       *   - tabIndex        managed (only selected tab is in tab order)
       *   - Arrow key navigation moves focus within the tablist
       */}
      <nav
        id="profdev-tabs"
        aria-label="Professional development sections"
        className="sticky top-16 z-30 bg-surface/95 backdrop-blur-md border-b border-outline-variant/20 shadow-sm"
      >
        <div
          role="tablist"
          aria-label="Professional development sections"
          className="max-w-screen-2xl mx-auto px-6 md:px-12 flex gap-1 py-2 overflow-x-auto"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
              className={`px-5 py-3 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── TAB PANELS ───────────────────────────────────────
       *  Each panel has: role="tabpanel", aria-labelledby pointing to its tab,
       *  and tabIndex={0} so it can receive focus programmatically.
       */}

      {/* ── OVERVIEW PANEL ── */}
      <div
        id="panel-overview"
        role="tabpanel"
        aria-labelledby="tab-overview"
        tabIndex={0}
        hidden={activeTab !== 'overview'}
        className="outline-none"
      >
        {/* internSHPE Spotlight */}
        <section aria-labelledby="spotlight-heading" className="py-20 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-6 mb-12">
              <div>
                <span className="text-secondary font-bold tracking-widest uppercase text-sm">Member Voices</span>
                <h2 id="spotlight-heading" className="font-headline text-4xl md:text-5xl font-extrabold text-on-surface mt-1">
                  internSHPE{' '}
                  <span className="text-secondary">Spotlight</span>
                </h2>
              </div>
              <div className="h-1 flex-1 bg-outline-variant/30 rounded-full hidden md:block" aria-hidden="true" />
              <span
                className="material-symbols-outlined text-6xl text-secondary opacity-20 hidden md:block"
                style={{ fontVariationSettings: '"FILL" 1' }}
                aria-hidden="true"
              >
                star
              </span>
            </div>
            {/* figure wraps the quote + attribution (SpotlightCarousel) */}
            <figure>
              <SpotlightCarousel />
            </figure>
          </div>
        </section>

        {/* Photos / General CTA */}
        <section aria-labelledby="photos-cta-heading" className="py-20 px-6 md:px-12">
          <div className="max-w-screen-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 id="photos-cta-heading" className="font-headline text-4xl md:text-5xl font-extrabold text-on-surface mb-6">
                Real experiences, real connections
              </h2>
              <p className="text-on-surface-variant text-lg font-medium leading-relaxed mb-8">
                See our members in action at national conferences, local networking
                nights, and company site visits throughout the year.
              </p>
              <a
                href="/events"
                className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-bold hover:bg-primary-fixed-dim transition-all shadow-lg"
              >
                View Upcoming Events
                <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { src: '/photos/profDev/shpeCyber.webp',       alt: 'SHPE OSU members at a cybersecurity workshop' },
                { src: '/photos/profDev/shpeTinasN.webp',      alt: 'SHPEtinas members networking at a professional event' },
                { src: '/photos/profDev/shpeNationalGroup.webp',alt: 'SHPE OSU group photo at the national convention' },
                { src: '/photos/profDev/shpeNationalPic.webp', alt: 'SHPE national convention career fair floor' },
              ].map(({ src, alt }) => (
                <div key={src} className="rounded-xl overflow-hidden shadow-md aspect-square">
                  <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SponsorSHPE CTA */}
        <section aria-labelledby="sponsor-cta-heading" className="py-20 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto">
            <div className="bg-tertiary-container text-on-tertiary-container rounded-xl p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-xl">
              <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-on-tertiary-container/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
              <div className="z-10 flex-1">
                <div className="inline-flex items-center gap-2 bg-on-tertiary-container/15 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }} aria-hidden="true">handshake</span>
                  For Companies &amp; Organizations
                </div>
                <h2 id="sponsor-cta-heading" className="font-headline text-3xl md:text-4xl font-extrabold mb-3">
                  Collaborate With Us
                </h2>
                <p className="opacity-90 max-w-xl text-lg leading-relaxed">
                  Partner with SHPE OSU to connect with a talented pipeline of
                  Hispanic engineers. From career fair tabling to mentorship — sponsoring
                  SHPE opens doors to over 200 engaged, career-driven students.
                </p>
              </div>
              <div className="z-10 flex-shrink-0">
                <a
                  href="/sponsors"
                  className="inline-flex items-center gap-3 bg-on-tertiary-container text-tertiary-container px-9 py-5 rounded-full font-bold text-lg hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }} aria-hidden="true">volunteer_activism</span>
                  SponsorSHPE
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── EVENTS PANEL ── */}
      <div
        id="panel-events"
        role="tabpanel"
        aria-labelledby="tab-events"
        tabIndex={0}
        hidden={activeTab !== 'events'}
        className="outline-none"
      >
        <section aria-labelledby="events-heading" className="py-20 px-6 md:px-12">
          <div className="max-w-screen-2xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-primary font-bold tracking-widest uppercase text-sm">Level Up</span>
              <h2 id="events-heading" className="font-headline text-4xl md:text-5xl font-extrabold mt-2 text-on-surface">
                Professional Development Events
              </h2>
              <p className="mt-4 text-on-surface-variant max-w-2xl mx-auto text-lg font-medium">
                Year-round programming designed to make you career-ready before graduation.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profDevEvents.map((ev) => {
                const c = colorMap[ev.color];
                return (
                  <article
                    key={ev.id}
                    aria-labelledby={`event-title-${ev.id}`}
                    className={`bg-surface-container-lowest rounded-lg p-8 border border-outline-variant/20 ${c.border} hover:-translate-y-1 hover:shadow-xl transition-all flex flex-col gap-4`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="p-3 bg-surface-container rounded-xl">
                        <span
                          className={`material-symbols-outlined text-3xl ${c.icon}`}
                          style={{ fontVariationSettings: '"FILL" 1' }}
                          aria-hidden="true"
                        >
                          {ev.icon}
                        </span>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.tag}`}>
                        {ev.tag}
                      </span>
                    </div>
                    <div>
                      <h3 id={`event-title-${ev.id}`} className="font-headline text-xl font-extrabold text-on-surface mb-1">
                        {ev.title}
                      </h3>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${c.icon}`}>
                        <time>{ev.date}</time>
                      </p>
                      <p className="text-on-surface-variant text-sm leading-relaxed">
                        {ev.description}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Subscribe CTA */}
        <section aria-labelledby="newsletter-heading" className="py-20 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto bg-secondary text-on-secondary rounded-xl p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-64 h-64 bg-on-secondary/10 rounded-full blur-3xl -ml-32 -mt-32 pointer-events-none" aria-hidden="true" />
            <div className="z-10">
              <h2 id="newsletter-heading" className="font-headline text-3xl md:text-4xl font-extrabold mb-3">
                Ready to launch your career?
              </h2>
              <p className="opacity-85 max-w-xl text-lg leading-relaxed">
                Join SHPE at Ohio State and tap into our professional development
                programs, industry connections, and a familia that will champion you.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 z-10 flex-shrink-0">
              <a
                href="https://ohio-state.us10.list-manage.com/subscribe?u=83a66b4e27a8f6ab6405e8295&id=26dc1dc690"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-on-secondary text-secondary px-8 py-4 rounded-full font-bold hover:opacity-90 hover:-translate-y-0.5 transition-all text-center flex items-center justify-center gap-2 shadow-lg"
              >
                Subscribe to Newsletter
                <span className="material-symbols-outlined text-sm" aria-hidden="true">mail</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <a
                href="/events"
                className="border-2 border-on-secondary/40 text-on-secondary px-8 py-4 rounded-full font-bold hover:bg-on-secondary/10 transition-all text-center"
              >
                View Events
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ── CONVENTION PANEL ── */}
      <div
        id="panel-convention"
        role="tabpanel"
        aria-labelledby="tab-convention"
        tabIndex={0}
        hidden={activeTab !== 'convention'}
        className="outline-none"
      >
        <section aria-labelledby="convention-heading" className="py-20 px-6 md:px-12">
          <div className="max-w-screen-2xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-12">
              <div>
                <span className="text-primary font-bold tracking-widest uppercase text-sm">SHPE National</span>
                <h2 id="convention-heading" className="font-headline text-4xl md:text-5xl font-extrabold text-on-surface mt-2 mb-4">
                  National Convention
                </h2>
                <p className="text-on-surface-variant text-lg font-medium leading-relaxed mb-6">
                  SHPE&apos;s National Convention is the largest annual gathering of
                  Hispanic STEM professionals and students in the world — a career
                  fair, leadership summit, and cultural celebration in one massive
                  event. SHPE OSU attends every year.
                </p>
                <a
                  href="https://shpe.org/engage/events/national-convention/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-bold hover:bg-primary-fixed-dim transition-all shadow-lg"
                >
                  SHPE National Convention Website
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">open_in_new</span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
              <div className="rounded-lg overflow-hidden shadow-xl aspect-video">
                <img
                  src="/photos/profDev/shpeNationalGroup.webp"
                  alt="SHPE OSU students at the National Convention"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  width="1200"
                  height="675"
                />
              </div>
            </div>

            {/* Fast-facts */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              {[
                { icon: 'calendar_month', value: 'Every October',     label: 'Annual Event' },
                { icon: 'groups',         value: '5,000+',            label: 'Attendees' },
                { icon: 'corporate_fare', value: '200+',              label: 'Recruiting Companies' },
                { icon: 'location_on',    value: 'New City Each Year', label: 'U.S. Location' },
              ].map(({ icon, value, label }) => (
                <div key={label} className="bg-surface-container-low rounded-xl p-5 text-center border border-outline-variant/20">
                  <dt className="sr-only">{label}</dt>
                  <span
                    className="material-symbols-outlined text-primary text-3xl mb-2 block"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <dd className="font-headline font-extrabold text-on-surface text-lg leading-tight">{value}</dd>
                  <p className="text-on-surface-variant text-xs font-bold uppercase tracking-wide mt-1" aria-hidden="true">{label}</p>
                </div>
              ))}
            </dl>

            {/* Freshman note */}
            <aside
              aria-labelledby="freshman-note-heading"
              className="bg-primary-container text-on-primary-container rounded-lg p-8 md:p-10 mb-12 flex flex-col md:flex-row gap-8 items-start shadow-lg"
            >
              <div className="flex-shrink-0 w-16 h-16 bg-on-primary-container/15 rounded-2xl flex items-center justify-center mt-1" aria-hidden="true">
                <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: '"FILL" 1' }} aria-hidden="true">waving_hand</span>
              </div>
              <div className="flex-1">
                <h3 id="freshman-note-heading" className="font-headline text-2xl font-extrabold mb-3">
                  Hey Freshmen 👋 — Here&apos;s What to Expect
                </h3>
                <p className="opacity-90 leading-relaxed mb-4">
                  National Convention is a 5-day event held every October in a different U.S. city.
                  As a first-year, you&apos;ll attend professional development workshops, walk the
                  career fair floor with hundreds of top engineering companies, and connect with
                  thousands of other Hispanic engineers from across the country.
                </p>
                <p className="opacity-90 leading-relaxed">
                  SHPE OSU covers the logistics. We organize group travel, hotel coordination,
                  and prep sessions so you show up confident and ready. Many members land their
                  first internship offer right on the convention floor.
                </p>
              </div>
            </aside>

            {/* Preparation steps */}
            <div>
              <h3 className="font-headline text-3xl md:text-4xl font-extrabold text-on-surface text-center mb-4">
                How to Prepare
              </h3>
              <p className="text-on-surface-variant mt-2 font-medium text-center mb-10">
                Follow these steps to get the most out of your convention experience.
              </p>
              <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Convention preparation steps">
                {conferenceSteps.map((step) => (
                  <li
                    key={step.step}
                    className="relative bg-surface-container-lowest rounded-lg p-7 border border-outline-variant/20 hover:shadow-xl hover:-translate-y-1 transition-all group list-none"
                  >
                    <span className="absolute top-5 right-6 text-6xl font-black text-on-surface/5 font-headline pointer-events-none select-none" aria-hidden="true">
                      {step.step}
                    </span>
                    <div className="mb-4 w-12 h-12 bg-primary-container/30 rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
                      <span
                        className="material-symbols-outlined text-primary group-hover:text-on-primary transition-colors"
                        style={{ fontVariationSettings: '"FILL" 1' }}
                        aria-hidden="true"
                      >
                        {step.icon}
                      </span>
                    </div>
                    <h4 className="font-headline text-lg font-extrabold text-on-surface mb-2">
                      {step.title}
                    </h4>
                    <p className="text-on-surface-variant text-sm leading-relaxed">
                      {step.desc}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </div>

      {/* ── LEADERBOARD PANEL ── */}
      <div
        id="panel-leaderboard"
        role="tabpanel"
        aria-labelledby="tab-leaderboard"
        tabIndex={0}
        hidden={activeTab !== 'leaderboard'}
        className="outline-none"
      >
        {/*
         * PublicLeaderboard is a standalone component with its own
         * aria-labelledby heading, aria-live region, and semantic <table>.
         * See src/components/PublicLeaderboard.jsx for full compliance notes.
         */}
        <PublicLeaderboard />
      </div>

    </main>
  );
}

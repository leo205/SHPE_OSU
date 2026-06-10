import { useState } from 'react';

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const internshipStats = [
  { value: '85%', label: 'Internship Placement Rate', icon: 'trending_up' },
  { value: '25+', label: '2025 Offers Received', icon: 'workspace_premium' },
  { value: '$25k', label: 'Avg. Intern Salary (annualized)', icon: 'payments' },
  { value: '3x', label: 'More Offers w/ SHPE Network', icon: 'diversity_3' },
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
      "The company visits organized by SHPE let me see what day-to-day engineering looks like—that's what convinced me to apply.",
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
  {
    step: '01',
    title: 'Register Early',
    desc: "Secure your spot through SHPE National's portal as soon as registration opens. Spots for students fill fast.",
    icon: 'how_to_reg',
  },
  {
    step: '02',
    title: 'Polish Your Resume',
    desc: 'Attend our resume workshop before the conference. Bring printed copies — companies love a physical resume on the floor.',
    icon: 'description',
  },
  {
    step: '03',
    title: 'Research Companies',
    desc: 'Review the list of attending companies ahead of time. Identify your top targets and research their open roles.',
    icon: 'manage_search',
  },
  {
    step: '04',
    title: 'Practice Your Pitch',
    desc: 'Nail your 60-second elevator pitch. Our mock sessions will help you feel natural, not rehearsed.',
    icon: 'record_voice_over',
  },
  {
    step: '05',
    title: 'Dress Professionally',
    desc: 'Business professional is the standard. Need help? SHPE can connect you with resources for professional attire.',
    icon: 'checkroom',
  },
  {
    step: '06',
    title: 'Follow Up',
    desc: 'Connect on LinkedIn within 24 hours. A brief, personalized message can turn a business card into an offer.',
    icon: 'send',
  },
];

/* ─────────────────────────────────────────────
   COMPONENT: Animated Counter
───────────────────────────────────────────── */
import { useEffect, useRef, useState as useCountState } from 'react';

function AnimCounter({ value, duration = 1600 }) {
  // value might be like "85%", "40+", "$25k", "3x"
  // extract numeric part
  const prefix = value.match(/^[^0-9]*/)?.[0] || '';
  const suffix = value.match(/[^0-9]+$/)?.[0] || '';
  const num = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;

  const [count, setCount] = useCountState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let cur = 0;
          const step = Math.max(1, Math.ceil(num / (duration / 16)));
          const timer = setInterval(() => {
            cur += step;
            if (cur >= num) {
              setCount(num);
              clearInterval(timer);
            } else {
              setCount(cur);
            }
          }, 16);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [num, duration]);

  return (
    <span ref={ref}>
      {prefix}{count}{suffix}
    </span>
  );
}

/* ─────────────────────────────────────────────
   COMPONENT: Spotlight Carousel
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
        >
          format_quote
        </span>
        <p className="text-lg md:text-xl font-medium leading-relaxed italic mb-8">
          "{person.quote}"
        </p>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-on-primary-container/30 flex-shrink-0">
            <img
              src={person.photo}
              alt={person.name}
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
        </div>
      </div>

      {/* Selector sidebar */}
      <div className="flex md:flex-col gap-3 md:gap-4 justify-center md:justify-start">
        {spotlights.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${
              i === active
                ? 'bg-primary text-on-primary shadow-lg'
                : 'bg-surface-container-highest hover:bg-surface-container text-on-surface'
            }`}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
              <img
                src={s.photo}
                alt={s.name}
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
   PAGE
───────────────────────────────────────────── */
export default function ProfessionalDevelopment() {
  return (
    <>
      <main className="pt-24 pb-20">
        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="relative px-6 md:px-12 py-16 md:py-20 overflow-hidden">
          <div className="max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div className="flex flex-col gap-6 z-10">
              <div className="inline-flex bg-tertiary-container text-on-tertiary-container font-bold px-4 py-1 rounded-full w-fit text-sm tracking-widest uppercase shadow-sm">
                El Éxito
              </div>
              <h1 className="font-headline text-5xl sm:text-6xl md:text-7xl font-extrabold text-on-surface leading-[1.05] tracking-tighter">
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
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
                <a
                  href="#events"
                  className="bg-surface-container-highest text-on-surface px-7 py-4 rounded-full text-base font-bold hover:bg-surface-container transition-all flex items-center gap-2"
                >
                  View Events
                  <span className="material-symbols-outlined">arrow_downward</span>
                </a>
              </div>
            </div>

            {/* Hero image collage */}
            <div className="relative flex items-center justify-center">
              <div className="w-full rounded-2xl overflow-hidden shadow-2xl border-8 border-surface-container-lowest aspect-video">
                <img
                  src="/photos/picsMain/shpeBrunch.webp"
                  alt="SHPE professional development event"
                  className="w-full h-full object-cover"
                  width="1200"
                  height="800"
                />
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-4 -left-4 bg-secondary text-on-secondary px-5 py-3 rounded-xl shadow-xl font-headline font-bold text-sm hidden sm:flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>
                  workspace_premium
                </span>
                internSHPE Program
              </div>
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        </section>

        {/* ── STATS BANNER ─────────────────────────────────── */}
        <section className="py-16 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto bg-primary rounded-xl p-8 md:p-12 text-on-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-on-primary/10 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
            <div className="text-center mb-10 relative z-10">
              <span className="uppercase tracking-widest text-sm font-bold opacity-70">
                By the numbers
              </span>
              <h2 className="font-headline text-3xl md:text-4xl font-extrabold mt-1">
                SHPE Members Get Hired
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center relative z-10">
              {internshipStats.map(({ value, label, icon }) => (
                <div key={label} className="space-y-2">
                  <div className="flex justify-center mb-2">
                    <span
                      className="material-symbols-outlined text-3xl opacity-70"
                      style={{ fontVariationSettings: '"FILL" 1' }}
                    >
                      {icon}
                    </span>
                  </div>
                  <span className="block text-4xl md:text-5xl font-black font-headline">
                    <AnimCounter value={value} />
                  </span>
                  <span className="uppercase tracking-wider text-xs font-bold opacity-75 leading-tight block">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROF DEV EVENTS ──────────────────────────────── */}
        <section id="events" className="py-20 px-6 md:px-12">
          <div className="max-w-screen-2xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-primary font-bold tracking-widest uppercase text-sm">
                Level Up
              </span>
              <h2 className="font-headline text-4xl md:text-5xl font-extrabold mt-2 text-on-surface">
                Professional Development Events
              </h2>
              <p className="mt-4 text-on-surface-variant max-w-2xl mx-auto text-lg font-medium">
                Year-round programming designed to make you career-ready before
                graduation.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profDevEvents.map((ev) => {
                const colorMap = {
                  primary: {
                    icon: 'text-primary',
                    tag: 'bg-primary-container text-on-primary-container',
                    hover: 'hover:border-primary/40',
                  },
                  secondary: {
                    icon: 'text-secondary',
                    tag: 'bg-secondary-container text-on-secondary-container',
                    hover: 'hover:border-secondary/40',
                  },
                  tertiary: {
                    icon: 'text-tertiary',
                    tag: 'bg-tertiary-container text-on-tertiary-container',
                    hover: 'hover:border-tertiary/40',
                  },
                };
                const c = colorMap[ev.color];
                return (
                  <div
                    key={ev.id}
                    className={`bg-surface-container-lowest rounded-lg p-8 border border-outline-variant/20 ${c.hover} hover:-translate-y-1 hover:shadow-xl transition-all flex flex-col gap-4`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className={`p-3 bg-surface-container rounded-xl`}>
                        <span
                          className={`material-symbols-outlined text-3xl ${c.icon}`}
                          style={{ fontVariationSettings: '"FILL" 1' }}
                        >
                          {ev.icon}
                        </span>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.tag}`}>
                        {ev.tag}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-headline text-xl font-extrabold text-on-surface mb-1">
                        {ev.title}
                      </h3>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${c.icon}`}>
                        {ev.date}
                      </p>
                      <p className="text-on-surface-variant text-sm leading-relaxed">
                        {ev.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── INTERNSHPE SPOTLIGHT ─────────────────────────── */}
        <section className="py-20 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-6 mb-12">
              <div>
                <span className="text-secondary font-bold tracking-widest uppercase text-sm">
                  Member Voices
                </span>
                <h2 className="font-headline text-4xl md:text-5xl font-extrabold text-on-surface mt-1">
                  internSHPE{' '}
                  <span className="text-secondary">Spotlight</span>
                </h2>
              </div>
              <div className="h-1 flex-1 bg-outline-variant/30 rounded-full hidden md:block" />
              <span
                className="material-symbols-outlined text-6xl text-secondary opacity-20 hidden md:block"
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                star
              </span>
            </div>
            <SpotlightCarousel />
          </div>
        </section>

        {/* ── CONFERENCE SECTION ───────────────────────────── */}
        <section className="py-20 px-6 md:px-12">
          <div className="max-w-screen-2xl mx-auto">
            {/* Header */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-12">
              <div>
                <span className="text-primary font-bold tracking-widest uppercase text-sm">
                  SHPE National
                </span>
                <h2 className="font-headline text-4xl md:text-5xl font-extrabold text-on-surface mt-2 mb-4">
                  National Convention
                </h2>
                <p className="text-on-surface-variant text-lg font-medium leading-relaxed mb-6">
                  SHPE's National Convention is the largest annual gathering of
                  Hispanic STEM professionals and students in the world — a
                  career fair, leadership summit, and cultural celebration in
                  one massive event. SHPE OSU attends every year.
                </p>
                <a
                  href="https://shpe.org/engage/events/national-convention/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-bold hover:bg-primary-fixed-dim transition-all shadow-lg"
                >
                  Convention Website
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
              </div>
              <div className="rounded-lg overflow-hidden shadow-xl aspect-video">
                <img
                  src="/photos/picsMain/SHPE_convention.webp"
                  alt="SHPE National Convention"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  width="1200"
                  height="675"
                />
              </div>
            </div>

            {/* Convention fast-facts strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              {[
                { icon: 'calendar_month', value: 'Every October', label: 'Annual Event' },
                { icon: 'groups', value: '5,000+', label: 'Attendees' },
                { icon: 'corporate_fare', value: '200+', label: 'Recruiting Companies' },
                { icon: 'location_on', value: 'New City Each Year', label: 'U.S. Location' },
              ].map(({ icon, value, label }) => (
                <div key={label} className="bg-surface-container-low rounded-xl p-5 text-center border border-outline-variant/20">
                  <span
                    className="material-symbols-outlined text-primary text-3xl mb-2 block"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    {icon}
                  </span>
                  <p className="font-headline font-extrabold text-on-surface text-lg leading-tight">{value}</p>
                  <p className="text-on-surface-variant text-xs font-bold uppercase tracking-wide mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Freshman Overview */}
            <div className="bg-primary-container text-on-primary-container rounded-lg p-8 md:p-10 mb-12 flex flex-col md:flex-row gap-8 items-start shadow-lg">
              <div className="flex-shrink-0 w-16 h-16 bg-on-primary-container/15 rounded-2xl flex items-center justify-center mt-1">
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  waving_hand
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-headline text-2xl font-extrabold mb-3">
                  Hey Freshmen 👋 — Here's What to Expect
                </h3>
                <p className="opacity-90 leading-relaxed mb-4">
                  National Convention is a 5-day whirlwind held every October in a
                  different U.S. city. As a first-year, you'll attend professional
                  development workshops, walk the career fair floor with hundreds of
                  top engineering companies, and connect with thousands of other
                  Hispanic engineers from across the country.
                </p>
                <p className="opacity-90 leading-relaxed">
                  Don't worry — SHPE OSU covers the logistics. We organize group
                  travel, hotel coordination, and prep sessions so you show up
                  confident and ready. Many of our members land their first
                  internship offer right on the convention floor. It's one of the
                  most transformative experiences of your college career, and you
                  should go your very first year.
                </p>
              </div>
            </div>

            {/* How to prepare */}
            <div>
              <div className="text-center mb-10">
                <h3 className="font-headline text-3xl md:text-4xl font-extrabold text-on-surface">
                  How to Prepare
                </h3>
                <p className="text-on-surface-variant mt-2 font-medium">
                  Follow these steps to get the most out of your convention
                  experience.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {conferenceSteps.map((step) => (
                  <div
                    key={step.step}
                    className="relative bg-surface-container-lowest rounded-lg p-7 border border-outline-variant/20 hover:shadow-xl hover:-translate-y-1 transition-all group"
                  >
                    <span className="absolute top-5 right-6 text-6xl font-black text-on-surface/5 font-headline pointer-events-none select-none">
                      {step.step}
                    </span>
                    <div className="mb-4 w-12 h-12 bg-primary-container/30 rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
                      <span
                        className="material-symbols-outlined text-primary group-hover:text-on-primary transition-colors"
                        style={{ fontVariationSettings: '"FILL" 1' }}
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SPONSORSHPE CTA ──────────────────────────────── */}
        <section className="py-20 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto">
            <div className="bg-tertiary-container text-on-tertiary-container rounded-xl p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-xl">
              <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-on-tertiary-container/10 rounded-full blur-3xl pointer-events-none" />
              <div className="z-10 flex-1">
                <div className="inline-flex items-center gap-2 bg-on-tertiary-container/15 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>handshake</span>
                  For Companies &amp; Organizations
                </div>
                <h2 className="font-headline text-3xl md:text-4xl font-extrabold mb-3">
                  Collaborate With Us
                </h2>
                <p className="opacity-90 max-w-xl text-lg leading-relaxed">
                  Partner with SHPE OSU to connect with a talented pipeline of
                  Hispanic engineers. From career fair tabling and sponsored
                  workshops to info sessions and mentorship programs — sponsoring
                  SHPE opens doors to over 200 engaged, career-driven students.
                </p>
              </div>
              <div className="z-10 flex-shrink-0">
                <a
                  href="/sponsors"
                  className="inline-flex items-center gap-3 bg-on-tertiary-container text-tertiary-container px-9 py-5 rounded-full font-bold text-lg hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>volunteer_activism</span>
                  SponsorSHPE
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA BANNER ───────────────────────────────────── */}
        <section className="py-20 px-6 md:px-12 bg-surface-container-low">
          <div className="max-w-screen-2xl mx-auto bg-secondary text-on-secondary rounded-xl p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-64 h-64 bg-on-secondary/10 rounded-full blur-3xl -ml-32 -mt-32 pointer-events-none" />
            <div className="z-10">
              <h2 className="font-headline text-3xl md:text-4xl font-extrabold mb-3">
                Ready to launch your career?
              </h2>
              <p className="opacity-85 max-w-xl text-lg leading-relaxed">
                Join SHPE at Ohio State and tap into our professional
                development programs, industry connections, and a familia that
                will champion you every step of the way.
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
                <span className="material-symbols-outlined text-sm">mail</span>
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
      </main>
    </>
  );
}

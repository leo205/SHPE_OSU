import { useState, useMemo, useEffect } from 'react';
import { events, categoryColors } from '../data/events';
import ImagePlaceholder from '../components/ImagePlaceholder';
import { supabase } from '../lib/supabase';

/* ── Calendar helpers ──────────────────────────────────────── */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}
function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* ── Google Calendar URL builder ──────────────────────────── */
function buildGoogleCalendarUrl(event) {
  const start = event.date.replace(/-/g, '');
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const params = new URLSearchParams({
    text: event.title,
    dates: `${start}T${event.time.replace(/[: ]/g, '')}00/${start}T${(
      event.endTime || event.time
    ).replace(/[: ]/g, '')}00`,
    details: event.description,
    location: event.location,
  });
  return `${base}&${params.toString()}`;
}

/* ── .ics (Apple / Outlook) builder ──────────────────────── */
function downloadICS(event) {
  const dateStr = event.date.replace(/-/g, '');
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SHPE OSU//EN',
    'BEGIN:VEVENT',
    `SUMMARY:${event.title}`,
    `DTSTART:${dateStr}T060000Z`,
    `DTEND:${dateStr}T080000Z`,
    `DESCRIPTION:${event.description}`,
    `LOCATION:${event.location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([content], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Event Detail Modal ────────────────────────────────────── */
function EventModal({ event, onClose }) {
  const colors = categoryColors[event.category] || categoryColors.GBM;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full p-8 relative"
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-container transition-colors"
          aria-label="Close event details"
        >
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>

        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 ${colors.badge}`}
        >
          {event.category}
        </span>
        <h3 className="font-headline text-2xl font-extrabold text-on-surface mb-3">
          {event.title}
        </h3>

        <div className="space-y-2 text-on-surface-variant text-sm mb-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
              calendar_month
            </span>
            <span>
              {new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
              schedule
            </span>
            <span>
              {event.time}
              {event.endTime ? ` – ${event.endTime}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
              location_on
            </span>
            <span>{event.location}</span>
          </div>
        </div>

        <p className="text-on-surface-variant leading-relaxed mb-6">
          {event.description}
        </p>

        {event.rsvpUrl && (
          <a
            href={event.rsvpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-primary text-on-primary px-6 py-3 rounded-full font-bold mb-4 hover:bg-primary-fixed-dim transition-all"
          >
            RSVP Now
          </a>
        )}

        <div className="flex flex-wrap gap-3 pt-4 border-t border-outline-variant/30">
          <a
            href={buildGoogleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-surface-container px-4 py-2 rounded-full text-sm font-bold hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">
              event
            </span>
            Add to Google Calendar
          </a>
          <button
            onClick={() => downloadICS(event)}
            className="flex items-center gap-2 bg-surface-container px-4 py-2 rounded-full text-sm font-bold hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              calendar_month
            </span>
            Add to Apple / Outlook
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [members, setMembers] = useState([]);
  const [dbEvents, setDbEvents] = useState([]);

  useEffect(() => {
    const fetchMembers = async () => {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('first_name, last_name_dotnum, dotnum, count')
        .order('count', { ascending: false });

      if (!error && data) {
        const sortedMembers = data.map(r => ({
          firstName: r.first_name,
          lastName: r.last_name_dotnum,
          dotnum: r.dotnum,
          count: r.count
        }));
        setMembers(sortedMembers);
      } else if (error) {
        console.error('[Events] Error fetching leaderboard view:', error);
      }
    };

    const fetchDbEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*');
        if (!error && data) {
          const mapped = data.map(ev => ({
            id: ev.id,
            title: ev.title,
            date: ev.date,
            time: ev.time,
            endTime: ev.end_time || '',
            location: ev.location,
            description: ev.description,
            category: ev.category,
            featured: ev.featured,
            rsvpUrl: ev.rsvp_url || '',
            photo: ev.photo || ''
          }));
          setDbEvents(mapped);
        }
      } catch (err) {
        console.error('[Events] Error fetching db events:', err);
      }
    };

    fetchMembers();
    fetchDbEvents();
  }, []);

  const topMember = members && members.length > 0 ? members[0] : { firstName: "TBD", lastName: "", count: 0 };

  const monthName = new Date(year, month).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const allEvents = useMemo(() => {
    const staticFiltered = events.filter(se => 
      !dbEvents.some(de => de.title === se.title && de.date === se.date)
    );
    return [...dbEvents, ...staticFiltered].sort((a, b) => a.date.localeCompare(b.date));
  }, [dbEvents]);

  // Map date strings → events for fast lookup
  const eventMap = useMemo(() => {
    const map = {};
    allEvents.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    return map;
  }, [allEvents]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month - 1 < 0 ? 11 : month - 1);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const todayStr = today.toISOString().slice(0, 10);
  
  const featuredEvents = useMemo(() => {
    const upcoming = allEvents.filter(e => e.featured && e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    const past = allEvents.filter(e => e.featured && e.date < todayStr).sort((a, b) => b.date.localeCompare(a.date));
    return [...upcoming, ...past].slice(0, 3);
  }, [allEvents, todayStr]);

  const upcomingEvents = allEvents.filter((e) => e.date >= todayStr).slice(0, 3);

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <>
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 md:pt-36 mb-12 md:mb-20 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:w-1/2 z-10">
            <div className="inline-block bg-tertiary-container text-on-tertiary-container px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 sticker-rotate-neg">
              Join the Familia
            </div>
            <h1 className="font-headline text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-extrabold text-on-background leading-none mb-6 tracking-tighter">
              Upcoming{' '}
              <span className="text-primary italic">Events</span> &amp;
              Opportunities
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-xl leading-relaxed">
              Stay connected with the Familia! From professional workshops to
              game nights, find your place in our community of Hispanic
              engineering leaders at Ohio State.
            </p>
          </div>
          {/* Photo collage — desktop only (absolute positions overflow on mobile) */}
          <div className="w-full md:w-1/2 relative h-[300px] md:h-[500px] hidden md:block">
            <div className="absolute -top-10 right-4 w-80 h-96 rounded-lg overflow-hidden shadow-2xl z-20 border-8 border-surface-container-lowest">
              <img src="/photos/events/cakeSHPE.webp" alt="SHPE cake celebration" className="w-full h-full object-cover object-center" width="900" height="1200" />
            </div>
            <div className="absolute bottom-4 left-4 w-96 h-64 rounded-lg overflow-hidden shadow-xl z-30 border-8 border-surface-container-lowest">
              <img src="/photos/events/pickleBall.jpg" alt="SHPE pickleball social event" className="w-full h-full object-cover object-center" width="900" height="645" />
            </div>
          </div>
          {/* Mobile: display both images cleanly */}
          <div className="w-full flex flex-col sm:flex-row gap-4 md:hidden mt-6">
            <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-surface-container-lowest w-full">
              <img src="/photos/events/cakeSHPE.webp" alt="SHPE Event" className="w-full h-48 sm:h-56 object-cover object-center" width="900" height="1200" />
            </div>
            <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-surface-container-lowest w-full">
              <img src="/photos/events/pickleBall.jpg" alt="SHPE Event" className="w-full h-48 sm:h-56 object-cover object-center" width="900" height="645" />
            </div>
          </div>
        </div>
      </section>

      {/* ── CALENDAR + SIDEBAR ─────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Calendar & Widgets */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Calendar */}
          <div className="bg-surface-container-low rounded-lg p-6 md:p-8 shadow-sm border border-outline-variant/10">
            {/* Month nav */}
            <div className="flex justify-between items-center mb-8">
              <h2 className="font-headline text-2xl md:text-3xl font-bold text-on-background">
                {monthName}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={prevMonth}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                  aria-label="Previous month"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button
                  onClick={() => {
                    setMonth(today.getMonth());
                    setYear(today.getFullYear());
                  }}
                  className="px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary/10 rounded-full transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                  aria-label="Next month"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="text-center font-bold text-secondary text-xs py-2"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 auto-rows-[80px] md:auto-rows-[100px]">
              {/* Previous month filler */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div
                  key={`prev-${i}`}
                  className="bg-surface-container-lowest rounded-lg p-2 opacity-30 text-sm"
                >
                  {prevMonthDays - firstDay + 1 + i}
                </div>
              ))}

              {/* Current month days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = formatDateKey(year, month, day);
                const dayEvents = eventMap[key] || [];
                const isToday =
                  day === today.getDate() &&
                  month === today.getMonth() &&
                  year === today.getFullYear();

                return (
                  <div
                    key={day}
                    className={`rounded-lg p-2 text-sm relative overflow-hidden transition-all ${dayEvents.length > 0
                      ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] bg-surface-container-lowest border border-outline-variant/20'
                      : 'bg-surface-container-lowest'
                      } ${isToday ? 'ring-2 ring-primary' : ''}`}
                    role={dayEvents.length > 0 ? 'button' : undefined}
                    tabIndex={dayEvents.length > 0 ? 0 : undefined}
                    aria-label={dayEvents.length > 0 ? `${day} — ${dayEvents[0].title}` : undefined}
                    onClick={() => dayEvents.length > 0 && setSelectedEvent(dayEvents[0])}
                    onKeyDown={(e) => {
                      if (dayEvents.length > 0 && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setSelectedEvent(dayEvents[0]);
                      }
                    }}
                  >
                    <span
                      className={`text-xs font-bold ${isToday
                        ? 'bg-primary text-on-primary rounded-full w-6 h-6 flex items-center justify-center'
                        : ''
                        }`}
                    >
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 2).map((ev) => {
                        const colors = categoryColors[ev.category] || categoryColors.GBM;
                        return (
                          <div
                            key={ev.id}
                            className={`text-[9px] md:text-[10px] font-bold px-1 py-0.5 rounded leading-tight truncate ${colors.bg} ${colors.text}`}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] text-outline font-bold">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Category legend */}
            <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-outline-variant/20">
              {Object.entries(categoryColors).map(([cat, colors]) => (
                <div key={cat} className="flex items-center gap-1.5 text-xs font-bold">
                  <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
                  {cat}
                </div>
              ))}
            </div>
          </div>

          {/* Leaderboard Section nested under Left Column */}
          <div className="mt-8 space-y-4">
            <h3 className="font-headline text-3xl font-extrabold text-on-background flex items-center gap-4">
              Leaderboard
              <div className="h-1 flex-grow bg-surface-container-highest rounded-full" />
            </h3>

            {/* Leaderboard Card (full width of Left Column) */}
            <div className="bg-[#F6F0E9] p-6 md:p-8 rounded-[2rem] shadow-2xl border border-white/40 flex flex-col max-h-[550px]">
              <div className="overflow-y-auto overflow-x-auto flex-grow pr-1">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[#f26534]/20 sticky top-0 z-10">
                      <th className="text-left text-[#302E2B] font-bold p-4 text-xl bg-[#F6F0E9]">Name.#</th>
                      <th className="text-right text-[#302E2B] font-bold p-4 text-xl bg-[#F6F0E9]">Events Attended</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {members?.map((m, index) => (
                      <tr key={m.dotnum} className="hover:bg-white/40 transition-colors">
                        <td className="p-4 text-gray-800 font-medium whitespace-nowrap">
                          <span className="mr-3 text-gray-400">{index + 1}.</span>
                          {m.firstName} {m.lastName}
                        </td>
                        <td className="p-4 text-right font-mono text-[#f26534] font-bold text-lg">
                          {m.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Newsletter signup */}
          <div className="bg-primary-container text-on-primary-container rounded-lg p-8 shadow-lg">
            <h4 className="font-headline font-black text-xl mb-2">
              Don't miss a beat!
            </h4>
            <p className="text-sm opacity-90 mb-4">
              Join our newsletter to receive updates about upcoming events.
            </p>
            <a
              href="https://ohio-state.us10.list-manage.com/subscribe?u=83a66b4e27a8f6ab6405e8295&id=26dc1dc690"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-on-primary-container text-primary-container px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all w-full text-center shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Subscribe</span>
              <span className="material-symbols-outlined">open_in_new</span>
            </a>
          </div>

          {/* Member of the Month */}
          <div className="bg-[#BCD3FF] p-8 rounded-[2rem] shadow-2xl border-4 border-white">
            <div className="text-center">
              <span className="text-5xl mb-4 block">🌟</span>
              <h3 className="text-[#3B5B91] font-black text-2xl uppercase tracking-widest leading-none">
                Member of the Month
              </h3>
              <p className="text-[#3B5B91] font-bold mb-6 text-sm">April 2026</p>

              <div className="bg-white rounded-2xl p-6 shadow-inner">
                <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 border-4 border-[#f26534]/20 flex items-center justify-center">
                  <span className="text-gray-400 text-xs">Photo</span>
                </div>
                <h4 className="text-[#3B5B91] text-2xl font-black truncate">
                  Brutus Buckeye
                </h4>
                <p className="text-gray-500 font-medium mt-1 text-sm leading-snug">
                  "Quote from the member about their experience or dedication to SHPE. This is just a placeholder for now!"
                </p>
              </div>

              <p className="text-[#3B5B91] mt-6 text-sm italic font-medium">
                Thank you for your dedication to the Familia!
              </p>
            </div>
          </div>

          {/* Spotlight Event Card */}
          {featuredEvents.length > 0 && (
            <div className="bg-surface-container-highest rounded-lg p-6 shadow-sm border border-outline-variant/10 flex flex-col justify-between flex-grow">
              <div>
                <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2 text-on-surface">
                  <span
                    className="material-symbols-outlined text-primary text-lg"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    star
                  </span>
                  Featured Event
                </h3>
                {(() => {
                  const ev = featuredEvents[0];
                  const colors = categoryColors[ev.category] || categoryColors.GBM;
                  const dateObj = new Date(ev.date + 'T12:00:00');
                  const dateLabel = dateObj
                    .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
                    .toUpperCase();
                  return (
                    <div
                      className="group cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${ev.title}`}
                      onClick={() => setSelectedEvent(ev)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedEvent(ev);
                        }
                      }}
                    >
                      <div className="relative rounded-xl overflow-hidden mb-3 bg-surface-container-lowest h-72 md:h-[420px]">
                        {ev.photo ? (
                          <img
                            src={ev.photo}
                            alt={ev.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <ImagePlaceholder label={`${ev.title} Photo`} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
                        )}
                        <div
                          className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${colors.badge}`}
                        >
                          {dateLabel}
                        </div>
                      </div>
                      <h4 className="font-headline font-bold text-base text-on-surface mb-1 group-hover:text-primary transition-colors">
                        {ev.title}
                      </h4>
                      <p className="text-xs text-on-surface-variant flex items-center gap-1 mb-1">
                        <span className="material-symbols-outlined text-[14px]">
                          schedule
                        </span>
                        {ev.time} • {ev.location}
                      </p>
                      <p className="text-xs text-on-surface-variant line-clamp-2">
                        {ev.description}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

        </div>
      </section>



      {/* ── THIS WEEK'S EVENTS ─────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 mt-20 mb-20">
        <h3 className="font-headline text-4xl font-extrabold text-on-background mb-12 flex items-center gap-4">
          Upcoming Events
          <div className="h-1 flex-grow bg-surface-container-highest rounded-full" />
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {upcomingEvents.map((ev) => {
            const colors = categoryColors[ev.category] || categoryColors.GBM;
            const dateObj = new Date(ev.date + 'T12:00:00');
            const dateLabel = dateObj
              .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
              .toUpperCase();

            return (
              <div
                key={ev.id}
                className="bg-surface-container-low rounded-xl overflow-hidden hover:-translate-y-2 transition-all cursor-pointer shadow-sm hover:shadow-lg group flex flex-col justify-between"
                role="button"
                tabIndex={0}
                aria-label={`View details for ${ev.title}`}
                onClick={() => setSelectedEvent(ev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedEvent(ev);
                  }
                }}
              >
                <div className="relative h-48 bg-surface-container-lowest overflow-hidden">
                  {ev.photo ? (
                    <img
                      src={ev.photo}
                      alt={ev.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <ImagePlaceholder label={`${ev.title} Photo`} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
                  )}
                  <div
                    className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${colors.badge}`}
                  >
                    {dateLabel}
                  </div>
                </div>
                
                <div className="p-6 flex-grow flex flex-col justify-between">
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {ev.category}
                    </span>
                    <h4 className="font-headline font-bold text-xl mt-3 mb-2 text-on-background group-hover:text-primary transition-colors">
                      {ev.title}
                    </h4>
                    <p className="text-sm text-on-surface-variant mb-6 leading-relaxed line-clamp-3">
                      {ev.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-primary">
                    <span>
                      {dateObj.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      • {ev.time}
                    </span>
                    <button className="flex items-center gap-1 hover:gap-2 transition-all font-headline">
                      DETAILS{' '}
                      <span className="material-symbols-outlined text-sm">
                        arrow_forward
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>


      {/* ── EVENT MODAL ────────────────────────────────────── */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}

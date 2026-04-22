import { useState, useMemo } from 'react';
import { events, categoryColors } from '../data/events';
import ImagePlaceholder from '../components/ImagePlaceholder';

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
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
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
            <span className="material-symbols-outlined text-[18px] text-primary">
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
            <span className="material-symbols-outlined text-[18px] text-primary">
              schedule
            </span>
            <span>
              {event.time}
              {event.endTime ? ` – ${event.endTime}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">
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

/* ── Main Events Page ──────────────────────────────────────── */
export default function Events() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedEvent, setSelectedEvent] = useState(null);

  const monthName = new Date(year, month).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Map date strings → events for fast lookup
  const eventMap = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    return map;
  }, []);

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

  const featuredEvents = events.filter((e) => e.featured).slice(0, 3);
  const upcomingEvents = events.filter((e) => new Date(e.date) >= today).slice(0, 3);

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <>
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pt-36 mb-20 relative">
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:w-1/2 z-10">
            <div className="inline-block bg-tertiary-container text-on-tertiary-container px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 sticker-rotate-neg">
              Join the Familia
            </div>
            <h1 className="font-headline text-6xl md:text-8xl font-extrabold text-on-background leading-none mb-6 tracking-tighter">
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
          <div className="w-full md:w-1/2 relative h-[400px]">
            {/* 📸 SWAP: replace placeholders with real event photos */}
            <div className="absolute top-0 right-0 w-64 h-72 rounded-lg overflow-hidden sticker-rotate-alt shadow-2xl z-20 border-8 border-surface-container-lowest">
              <img src="/photos/events/cakeSHPE.jpg" alt="Event Photo" className="w-full h-full object-cover object-center" />
            </div>
            <div className="absolute bottom-10 left-0 w-72 h-52 rounded-lg overflow-hidden sticker-rotate-neg shadow-xl z-30 border-8 border-surface-container-lowest">
              <img src="/photos/events/pickleBall.png" alt="Event Photo" className="w-full h-full object-cover object-center" />
            </div>
            <div className="absolute bottom-0 right-10 w-56 h-56 bg-tertiary-container rounded-[3rem] z-0 opacity-50 blur-3xl" />
          </div>
        </div>
      </section>

      {/* ── CALENDAR + SIDEBAR ─────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Calendar */}
        <div className="lg:col-span-8 bg-surface-container-low rounded-lg p-6 md:p-8 shadow-sm border border-outline-variant/10">
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
                  onClick={() => dayEvents.length > 0 && setSelectedEvent(dayEvents[0])}
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

        {/* Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Featured Events */}
          <div className="bg-surface-container-highest rounded-lg p-6 flex-grow">
            <h3 className="font-headline text-2xl font-bold mb-6 flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                star
              </span>
              Featured Events
            </h3>
            <div className="space-y-6">
              {featuredEvents.map((ev) => {
                const colors = categoryColors[ev.category] || categoryColors.GBM;
                const dateObj = new Date(ev.date + 'T12:00:00');
                const dateLabel = dateObj
                  .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
                  .toUpperCase();
                return (
                  <div
                    key={ev.id}
                    className="group cursor-pointer"
                    onClick={() => setSelectedEvent(ev)}
                  >
                    <div className={`relative rounded-xl overflow-hidden mb-3 bg-surface-container-lowest ${!ev.photo ? 'h-48 sm:h-56' : ''}`}>
                      {/*
                       * 📸 SWAP: replace with real event photo per event
                       * <img src="/photos/event-name.jpg" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                       */}
                      {ev.photo ? (
                        <img src={ev.photo} alt={`${ev.title} Photo`} className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <ImagePlaceholder label={`${ev.title} Photo`} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
                      )}
                      <div
                        className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${colors.badge}`}
                      >
                        {dateLabel}
                      </div>
                    </div>
                    <h4 className="font-headline font-bold text-lg text-on-surface mb-1 group-hover:text-primary transition-colors">
                      {ev.title}
                    </h4>
                    <p className="text-sm text-on-surface-variant flex items-center gap-1 mb-1">
                      <span className="material-symbols-outlined text-[16px]">
                        schedule
                      </span>
                      {ev.time} • {ev.location}
                    </p>
                    <p className="text-sm text-on-surface-variant line-clamp-2">
                      {ev.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Newsletter signup */}
          <div className="bg-primary-container text-on-primary-container rounded-lg p-8 sticker-rotate-neg shadow-lg">
            <h4 className="font-headline font-black text-xl mb-2">
              Don't miss a beat!
            </h4>
            <p className="text-sm opacity-90 mb-4">
              Get event updates delivered straight to your inbox.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex gap-2"
            >
              <input
                type="email"
                placeholder="Email address"
                className="bg-on-primary-container/10 border-none rounded-xl flex-grow text-sm placeholder:text-on-primary-container/50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-on-primary-container"
              />
              <button
                type="submit"
                className="bg-on-primary-container text-primary-container p-2 rounded-xl hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </form>
          </div>
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
            return (
              <div
                key={ev.id}
                className="bg-surface-container-low rounded-lg p-6 hover:-translate-y-2 transition-all cursor-pointer shadow-sm hover:shadow-lg"
                onClick={() => setSelectedEvent(ev)}
              >
                <div className={`w-12 h-12 ${colors.bg} rounded-full flex items-center justify-center mb-6`}>
                  <span className={`material-symbols-outlined ${colors.text}`}>
                    {ev.category === 'GBM'
                      ? 'groups'
                      : ev.category === 'Social'
                        ? 'celebration'
                        : ev.category === 'Professional'
                          ? 'work'
                          : ev.category === 'Academic'
                            ? 'school'
                            : 'volunteer_activism'}
                  </span>
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full ${colors.badge}`}>
                  {ev.category}
                </span>
                <h4 className="font-headline font-bold text-xl mt-3 mb-2 text-on-background">
                  {ev.title}
                </h4>
                <p className="text-sm text-on-surface-variant mb-6 leading-relaxed line-clamp-3">
                  {ev.description}
                </p>
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-primary">
                  <span>
                    {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    • {ev.time}
                  </span>
                  <button className="flex items-center gap-1 hover:gap-2 transition-all">
                    DETAILS{' '}
                    <span className="material-symbols-outlined text-sm">
                      arrow_forward
                    </span>
                  </button>
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

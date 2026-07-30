/**
 * Calendar export helpers (Google Calendar + .ics).
 *
 * Extracted from Events.jsx so the date/time logic can be exercised directly —
 * both exporters shipped with time bugs that were invisible from the UI:
 *
 *   - The Google builder stripped colons and spaces from "6:00 PM" to produce
 *     "600PM", yielding dates=...T600PM00, which Google cannot parse.
 *   - The .ics builder ignored event.time entirely and hardcoded
 *     DTSTART:...T060000Z / DTEND:...T080000Z, putting every downloaded event
 *     at 2:00–4:00 AM Eastern.
 *
 * Events are authored in local Columbus time, so exports carry an explicit
 * TZID rather than pretending the wall-clock time is UTC.
 */
export const EVENT_TZID = 'America/New_York';
const DEFAULT_DURATION_HOURS = 2;

/**
 * Parses a display time like "6:00 PM" or "10 AM" into "HHMMSS" (24-hour).
 * Returns null when unparseable so callers can fall back to an all-day entry
 * instead of emitting a corrupt one.
 */
export function parseTimeTo24h(display) {
  if (!display) return null;
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?\s*$/.exec(display);
  if (!match) return null;

  const [, rawHour, rawMinute, meridiem] = match;
  let hour = parseInt(rawHour, 10);
  if (hour < 1 || hour > 12) return null;

  const minute = rawMinute ?? '00';
  if (parseInt(minute, 10) > 59) return null;

  const isPM = meridiem.toLowerCase() === 'p';
  if (hour === 12) hour = isPM ? 12 : 0;
  else if (isPM) hour += 12;

  return `${String(hour).padStart(2, '0')}${minute}00`;
}

/** Adds whole hours to an "HHMMSS" string, clamping at 23:xx the same day. */
export function addHours(hhmmss, hours) {
  const h = parseInt(hhmmss.slice(0, 2), 10) + hours;
  return `${String(Math.min(h, 23)).padStart(2, '0')}${hhmmss.slice(2)}`;
}

/** "2026-04-24" → "20260424" */
export function compactDate(isoDate) {
  return isoDate.replace(/-/g, '');
}

/** "20260424" → "20260425" (calendar-correct, used for all-day end bounds). */
export function nextDay(compact) {
  const y = Number(compact.slice(0, 4));
  const m = Number(compact.slice(4, 6));
  const d = Number(compact.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(
    next.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Resolves an event to { date, start, end } in local wall-clock time.
 * `start`/`end` are null when the event has no parseable time.
 */
export function resolveEventTimes(event) {
  const date = compactDate(event.date);
  const start = parseTimeTo24h(event.time);
  if (!start) return { date, start: null, end: null };
  const end = parseTimeTo24h(event.endTime) ?? addHours(start, DEFAULT_DURATION_HOURS);
  return { date, start, end };
}

/** Escapes text for an iCalendar property value per RFC 5545 §3.3.11. */
export function escapeICS(text = '') {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Builds a Google Calendar "add event" URL. */
export function buildGoogleCalendarUrl(event) {
  const { date, start, end } = resolveEventTimes(event);
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const params = new URLSearchParams({
    text: event.title,
    details: event.description ?? '',
    location: event.location ?? '',
  });

  if (start) {
    params.set('dates', `${date}T${start}/${date}T${end}`);
    params.set('ctz', EVENT_TZID);
  } else {
    // All-day form: Google treats the end bound as exclusive.
    params.set('dates', `${date}/${nextDay(date)}`);
  }

  return `${base}&${params.toString()}`;
}

/** Builds the raw .ics document text for an event. */
export function buildICS(event) {
  const { date, start, end } = resolveEventTimes(event);

  const timing = start
    ? [
        `DTSTART;TZID=${EVENT_TZID}:${date}T${start}`,
        `DTEND;TZID=${EVENT_TZID}:${date}T${end}`,
      ]
    : [`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${nextDay(date)}`];

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SHPE OSU//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}-${date}@shpeosu.com`,
    `SUMMARY:${escapeICS(event.title)}`,
    ...timing,
    `DESCRIPTION:${escapeICS(event.description)}`,
    `LOCATION:${escapeICS(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Triggers a browser download of the event's .ics file. */
export function downloadICS(event) {
  const blob = new Blob([buildICS(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^\w-]+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Single source of truth for events.
 *
 * There used to be two. `Events.jsx` merged the Supabase `events` table with the
 * static `src/data/events.js` array, while `Attendance.jsx` read only the static
 * file — and it validates check-in submissions against that list. So an event
 * the E-Board added through the Admin Dashboard showed up on the public calendar
 * but could not be checked into, with no error to explain why. The dashboard
 * exists precisely so non-coders can add events, which made that split the worst
 * possible one.
 *
 * Both pages now call fetchEvents(). The static array stays as a fallback so the
 * site still works if Supabase is unreachable, and so historical events survive
 * without needing to be backfilled into the database.
 */
// Explicit .js extension (required by the ESM spec; Vite resolves it the same
// either way) so these helpers can be imported outside the bundler.
import { events as staticEvents } from '../data/events.js';

// Note: the Supabase client is imported lazily inside fetchEvents() rather than
// at the top of this file. Everything else here is pure date/merge logic, and a
// static import would drag `lib/supabase` — and its `import.meta.env` access,
// which only exists under Vite — into any context that just wants to reason
// about events. Keeping the I/O behind a dynamic import lets these helpers be
// exercised directly, which matters because the bug this module fixes (admin
// events never reaching check-in) was invisible from the UI.

/**
 * Local calendar date as "YYYY-MM-DD".
 *
 * Do NOT use `toISOString().slice(0, 10)` for this. That returns the *UTC* date,
 * which rolls over at 8:00 PM EDT / 7:00 PM EST — i.e. in the middle of a 6–8 PM
 * GBM. Comparing it against an event's local date made tonight's meeting sort
 * below next week's, precisely during the window students are checking in.
 */
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Normalizes a Supabase `events` row into the shape the UI uses. */
export function mapDbEvent(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    endTime: row.end_time || '',
    location: row.location,
    description: row.description,
    category: row.category,
    featured: row.featured,
    rsvpUrl: row.rsvp_url || '',
    photo: row.photo || '',
    source: 'db',
  };
}

/**
 * Combines database and static events, preferring the database when the same
 * event exists in both (same title + date), and sorts by date ascending.
 */
export function mergeEvents(dbEvents = [], fallback = staticEvents) {
  const seen = new Set(dbEvents.map((e) => `${e.title}|${e.date}`));
  const extras = fallback
    .filter((e) => !seen.has(`${e.title}|${e.date}`))
    .map((e) => ({ ...e, source: 'static' }));
  return (
    [...dbEvents, ...extras]
      // A row with a null date would otherwise throw inside the comparator,
      // and because fetchEvents() catches, the whole calendar and check-in
      // dropdown would silently fall back to the static file — the admin who
      // added the event would just watch it vanish.
      .filter((e) => typeof e?.date === 'string' && e.date)
      .sort((a, b) => a.date.localeCompare(b.date))
  );
}

/**
 * Fetches every event the site knows about.
 * Never rejects — on failure it returns the static list so check-in and the
 * calendar keep working rather than going blank.
 */
export async function fetchEvents() {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('events').select('*');
    if (error) {
      console.warn('[events] DB fetch failed, using static fallback:', error.message);
      return mergeEvents([], staticEvents);
    }
    return mergeEvents((data ?? []).map(mapDbEvent), staticEvents);
  } catch (err) {
    console.warn('[events] DB fetch threw, using static fallback:', err);
    return mergeEvents([], staticEvents);
  }
}

/**
 * The check-in dropdown label, and also the exact string stored in
 * `attendance.event_name`.
 *
 * Do not change this format. Historical rows were written with it and the admin
 * dashboard groups attendance by this string, so a change would split every
 * event's history into "before" and "after" buckets.
 */
export function eventOptionLabel(event) {
  const dateLabel = new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
  });
  return `${dateLabel} - ${event.title}`;
}

/**
 * Resolves the calendar date represented by an attendance row's event label.
 *
 * Attendance keeps `created_at` as the real submission/audit timestamp. The
 * dashboard trend, however, should plot a late check-in against the meeting it
 * belongs to, not the following day. Event labels intentionally omit the year,
 * so we choose the matching date closest to the submission date. Considering
 * the adjacent years also handles a Dec. 31 meeting checked into on Jan. 1.
 */
export function attendanceEventDate(eventName, submittedDate) {
  const submittedMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(submittedDate ?? '');
  if (!submittedMatch) return null;

  const submittedYear = Number(submittedMatch[1]);
  const submittedMonth = Number(submittedMatch[2]);
  const submittedDay = Number(submittedMatch[3]);
  const submittedTime = Date.UTC(submittedYear, submittedMonth - 1, submittedDay);
  const submitted = new Date(submittedTime);
  const submittedIsValid = submitted.getUTCFullYear() === submittedYear
    && submitted.getUTCMonth() === submittedMonth - 1
    && submitted.getUTCDate() === submittedDay;
  if (!submittedIsValid) return null;

  const eventMatch = /^(\d{1,2})\/(\d{1,2})\s+-\s+/.exec(eventName ?? '');
  if (!eventMatch) return submittedDate;

  const month = Number(eventMatch[1]);
  const day = Number(eventMatch[2]);
  const candidates = [submittedYear - 1, submittedYear, submittedYear + 1]
    .map((year) => {
      const time = Date.UTC(year, month - 1, day);
      const date = new Date(time);
      if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
      ) return null;
      return { year, time };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.time - submittedTime) - Math.abs(b.time - submittedTime));

  if (candidates.length === 0) return submittedDate;

  return `${candidates[0].year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Orders events for the check-in dropdown: soonest upcoming first, then the most
 * recent past ones. A student checking in wants tonight's GBM at the top, not
 * whatever happens to sort first by date.
 *
 * Past events are included only while they are still plausibly checkinable:
 * within `withinPastDays`, for the student checking in a day late. Older ones
 * appear ONLY when there is nothing else to show, so the dropdown can never be
 * empty mid-meeting — that is the one thing it must never be.
 */
export function sortForCheckIn(events, { withinPastDays = 30, today = new Date() } = {}) {
  const todayStr = localDateString(today);
  const cutoff = localDateString(
    new Date(today.getTime() - withinPastDays * 86400000)
  );

  const upcoming = events
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = events
    .filter((e) => e.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date));

  const recentPast = past.filter((e) => e.date >= cutoff);

  // Once there is something upcoming, that plus anything genuinely recent is
  // the whole useful list — stop there.
  //
  // This used to append `past.slice(0, 5)` unconditionally whenever the recent
  // window came up empty, which is exactly what happens at the start of a
  // semester: nothing has run in 30 days, so the dropdown showed this week's
  // GBM followed by five events from LAST spring. Clutter at best, and at
  // worst a student taps the wrong one and their check-in lands on an event
  // from April.
  if (upcoming.length > 0) return [...upcoming, ...recentPast];

  // Nothing upcoming. Show recent events so a late check-in still works, and
  // only if even that window is empty (mid-summer, or before the E-Board has
  // added the new semester) fall back to the most recent few — an empty
  // dropdown mid-meeting is worse than a stale one.
  return recentPast.length > 0 ? recentPast : past.slice(0, 5);
}

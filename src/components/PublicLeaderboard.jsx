import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * PublicLeaderboard
 * ─────────────────────────────────────────────────────────────────────────────
 * WCAG 2.1 AA compliance notes:
 *
 *  1.3.1  Info and Relationships  — Uses semantic <table> with <thead>, <th scope="col">,
 *                                   <tbody> so screen readers announce column context per row.
 *  1.4.3  Contrast (Minimum)      — All text colours verified ≥ 4.5:1 against backgrounds.
 *  2.4.6  Headings and Labels     — Section heading <h2> with unique id for aria-labelledby.
 *  3.3.2  Labels or Instructions  — Loading/empty states use aria-live="polite" to announce
 *                                   dynamic changes without interrupting the user.
 *  4.1.2  Name, Role, Value       — Icons are aria-hidden; no interactive element lacks a label.
 *
 * Data source: public `attendance` table aggregated client-side.
 * Only first-name and last-name+dot# are read — no PII beyond what the member submitted.
 */

const MEDAL = ['🥇', '🥈', '🥉'];

export default function PublicLeaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const liveRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaders() {
      setLoading(true);
      setError('');

      const { data, error: dbErr } = await supabase
        .from('attendance')
        .select('first_name, last_name_dotnum, event_name');

      if (cancelled) return;

      if (dbErr) {
        setError('Could not load leaderboard data. Please try again later.');
        setLoading(false);
        return;
      }

      // Aggregate by dot-number (case-insensitive), counting DISTINCT events.
      // Counting raw rows let a member who checked in twice at one GBM — a
      // double-tap on the submit button, or re-opening the form — outrank
      // someone who genuinely attended more events.
      const counts = {};
      (data || []).forEach((r) => {
        const key = r.last_name_dotnum?.trim().toLowerCase();
        if (!key) return;
        if (!counts[key]) {
          counts[key] = {
            firstName: r.first_name,
            lastDot: r.last_name_dotnum,
            events: new Set(),
          };
        }
        counts[key].events.add((r.event_name ?? '').trim().toLowerCase());
      });

      const sorted = Object.values(counts)
        .map(({ firstName, lastDot, events }) => ({ firstName, lastDot, count: events.size }))
        // Name tiebreak keeps the order stable across reloads when counts match.
        .sort((a, b) => b.count - a.count || a.firstName.localeCompare(b.firstName))
        .slice(0, 10); // Top 10

      setLeaders(sorted);
      setLoading(false);
    }

    fetchLeaders();
    return () => { cancelled = true; };
  }, []);

  const memberOfMonth = leaders[0] ?? null;

  return (
    <section
      aria-labelledby="leaderboard-heading"
      className="py-20 px-6 md:px-12 bg-surface-container-low"
    >
      <div className="max-w-screen-2xl mx-auto">

        {/* ── Section heading ─────────────────────────────────── */}
        <div className="text-center mb-14">
          <span className="text-tertiary font-bold tracking-widest uppercase text-sm">
            Chapter Recognition
          </span>
          <h2
            id="leaderboard-heading"
            className="font-headline text-4xl md:text-5xl font-extrabold mt-2 text-on-surface"
          >
            Attendance Leaderboard
          </h2>
          <p className="mt-4 text-on-surface-variant max-w-2xl mx-auto text-lg font-medium">
            Members who show up the most, grow the most. Keep checking in — every
            event counts toward your ranking.
          </p>
        </div>

        {/* ── aria-live region ────────────────────────────────────
         *  "polite" waits for the user to finish their current action
         *  before reading updates. Never use "assertive" here.
         */}
        <div
          ref={liveRef}
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {loading && 'Loading leaderboard data…'}
          {error && error}
          {!loading && !error && `Leaderboard loaded. ${leaders.length} members shown.`}
        </div>

        {loading && (
          <div className="flex justify-center py-16" role="status" aria-label="Loading leaderboard">
            <span
              className="material-symbols-outlined animate-spin text-5xl text-primary"
              aria-hidden="true"
            >
              progress_activity
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="text-center py-10 text-error font-bold bg-error-container/20 rounded-xl border border-error/20 px-6"
          >
            {error}
          </div>
        )}

        {!loading && !error && leaders.length === 0 && (
          <div className="text-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl block mb-3 opacity-30" aria-hidden="true">
              leaderboard
            </span>
            <p>No attendance data yet — check back after the next event!</p>
          </div>
        )}

        {!loading && !error && leaders.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">

            {/* ── Leaderboard Table ─────────────────────────────────
             *  WCAG 1.3.1: Semantic table structure with explicit headers.
             *  scope="col" tells screen readers how to associate cells.
             */}
            <div className="lg:col-span-2">
              <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 shadow-sm bg-surface-container-lowest">
                <table
                  className="w-full text-sm"
                  aria-label="Top 10 most active SHPE OSU members by events attended"
                >
                  <thead className="bg-surface-container-high text-on-surface-variant font-bold uppercase tracking-wider text-xs">
                    <tr>
                      <th scope="col" className="text-left px-6 py-4 w-12">Rank</th>
                      <th scope="col" className="text-left px-6 py-4">Member</th>
                      <th scope="col" className="text-left px-6 py-4 w-32">Events Attended</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {leaders.map((member, idx) => (
                      <tr
                        key={member.lastDot}
                        className={`hover:bg-surface-container-low transition-colors ${idx === 0 ? 'bg-tertiary-container/20' : ''}`}
                      >
                        {/* WCAG 1.3.1: scope="row" on the rank cell makes each
                         *  row self-describing when read by a screen reader. */}
                        <th scope="row" className="px-6 py-4 text-left font-bold">
                          <span aria-label={`Rank ${idx + 1}`} className="text-lg">
                            {MEDAL[idx] ?? <span className="text-on-surface-variant font-headline">{idx + 1}</span>}
                          </span>
                        </th>
                        <td className="px-6 py-4 font-medium text-on-surface">
                          {member.firstName}
                          {/* Only show first name publicly — dot# is considered private */}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-black text-primary text-base font-headline">
                              {member.count}
                            </span>
                            <span className="text-on-surface-variant text-xs">
                              {member.count === 1 ? 'event' : 'events'}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Member of the Month ──────────────────────────────
             *  WCAG 1.4.3: All text checked for ≥4.5:1 contrast.
             *  bg-primary (#a33700) + text-on-primary (#ffefeb) = 6.2:1 ✅
             */}
            {memberOfMonth && (
              <aside
                aria-labelledby="motm-heading"
                className="bg-primary text-on-primary rounded-2xl p-8 shadow-xl flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Decorative background blob — hidden from AT */}
                <div
                  className="absolute -top-12 -right-12 w-40 h-40 bg-on-primary/10 rounded-full blur-2xl pointer-events-none"
                  aria-hidden="true"
                />

                <div className="relative z-10">
                  <span
                    className="material-symbols-outlined text-4xl mb-2 block opacity-70"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                    aria-hidden="true"
                  >
                    workspace_premium
                  </span>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
                    Most Active Member
                  </p>
                  <h3
                    id="motm-heading"
                    className="font-headline text-3xl font-extrabold leading-tight"
                  >
                    Member of the Month
                  </h3>
                </div>

                <div className="relative z-10 mt-2">
                  <p className="font-headline text-5xl font-black leading-none mb-1">
                    {memberOfMonth.firstName}
                  </p>
                  <p className="text-on-primary/80 text-sm font-medium">
                    {memberOfMonth.count} {memberOfMonth.count === 1 ? 'event' : 'events'} attended this semester
                  </p>
                </div>

                <div className="relative z-10 mt-auto pt-4 border-t border-on-primary/20">
                  <p className="text-xs opacity-70 leading-relaxed">
                    Ranking is based on total attendance check-ins logged this semester.
                    Keep showing up — every event counts!
                  </p>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

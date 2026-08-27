/**
 * Backup check-in form (Google Forms).
 *
 * WHAT THIS IS FOR
 * ----------------
 * If the Supabase insert on /attendance fails, the check-in is simply gone —
 * nothing is queued and nothing is retried. During a GBM that means no
 * attendance record for the whole meeting, and the student sees only a generic
 * error. This module builds a link to a Google Form that captures the same
 * fields, so a broken database costs the E-Board a manual copy-paste rather
 * than an entire meeting's data.
 *
 * It covers the case where **Supabase is broken but the network is fine** —
 * the project is paused, rate-limited, or a policy got changed. It does NOT
 * help if the venue's wifi is down, because Google is just as unreachable then.
 * That case needs a paper sheet.
 *
 * WHY A LINK AND NOT AN EMBEDDED FORM
 * -----------------------------------
 * vercel.json sets `default-src 'self'` and declares no `frame-src`, so an
 * iframed Google Form is blocked by the Content-Security-Policy. A plain link
 * is not governed by CSP at all (`form-action` restricts where OUR forms post,
 * not where links navigate), so this needs no header change. Do not switch to
 * an embed without adding `frame-src https://docs.google.com` to vercel.json
 * AND verifying it under `npm run preview` — a missing CSP entry is what
 * silently killed the sponsor contact form in production.
 *
 * ── SETUP (see HANDOFF.md "Backup check-in form") ────────────────────────────
 * Until `baseUrl` below is filled in, this is inert: buildFallbackUrl() returns
 * null and the check-in page renders exactly as it does today. Nothing to
 * revert if you decide against it.
 */

/**
 * The Google Form, and which of its fields to prefill.
 *
 * `baseUrl` is the public /viewform URL (from the form's "Send" button → link
 * icon — NOT the /edit URL from the address bar, which a respondent cannot
 * submit).
 *
 * `entries` maps a check-in payload field to a Google Form prefill ID. An
 * empty string means "do not prefill this one" — the form still works, the
 * student just fills that field in themselves. To find an ID: form → ⋮ →
 * "Get pre-filled link", type a dummy value into each field, "Get link", then
 * read the `entry.123456789=` pairs out of the resulting URL.
 *
 * WHAT IS DELIBERATELY NOT PREFILLED
 * ----------------------------------
 * `event_name` — the form asks this as a multiple-choice question with its own
 * hand-maintained list of events, and those labels are worded differently from
 * the ones this site generates ("8/27 - Resume Workshop w/Pratt Whitney" here
 * vs "8/27 - RESUME WORKSHOP w/ RTX" from eventOptionLabel()). Google only
 * preselects a choice on an EXACT match, so prefilling would do nothing
 * anyway. The student picks their event from the form's list instead.
 *
 * The consequence to know about: form rows carry the FORM's event wording, not
 * `attendance.event_name`. Whoever merges them has to translate the label —
 * see HANDOFF.md "Backup check-in form".
 *
 * `major` / `how_heard` — the form has no questions for these, so there is
 * nothing to map. They are dropped on this path by design; names and the dot
 * number are what the backup exists to capture.
 *
 * `feedback` — deliberately not prefilled either, for two reasons. It is the
 * one field with unbounded sensitivity (a complaint about a named person, an
 * accommodation need), and unlike the others it is NOT what this path exists to
 * capture — so putting it in a URL handed to Google, where it also lands in the
 * student's browser history in plaintext, buys nothing. Dropping it also caps
 * the URL length: a student who wrote 2,000 characters of non-ASCII feedback
 * could otherwise produce a ~20 KB link, and the one link that exists for
 * "the database is down" should not itself be at risk of failing to load.
 * A student with feedback can still type it into the form.
 */
export const FALLBACK_FORM = {
  baseUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLSetATIx52meiHRLa0jWvAe67AXKAvlS1D_H3Wy7P2w0v-7wrQ/viewform',
  entries: {
    event_name: '', // intentionally blank — see above
    first_name: 'entry.1755853879',
    last_name_dotnum: 'entry.835781843',
    year: 'entry.1231543127',
    is_first_meeting: 'entry.17060628',
    major: '', // no such question on the form
    how_heard: '', // no such question on the form
    feedback: '', // intentionally blank — see above (entry.1494295762)
  },
};

/** True once a form URL has been configured. */
export function isFallbackConfigured(form = FALLBACK_FORM) {
  return typeof form?.baseUrl === 'string' && form.baseUrl.trim() !== '';
}

/**
 * Renders one payload value as form text.
 *
 * `is_first_meeting` is a boolean in the database but reads as Yes/No on a
 * form, so it is mapped rather than stringified into "true"/"false".
 *
 * Everything else passes through unchanged. Note that a value only lands in a
 * multiple-choice question if it matches one of that question's options
 * character for character — Google silently ignores anything else rather than
 * erroring. That is why `year` is mapped but harmless: "Graduate Student" is
 * not on the form's list, so a grad student simply picks their own.
 */
function formatValue(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Builds the prefilled Google Form URL for a check-in that failed to save.
 * Returns null when no form is configured, which is the signal to render
 * nothing at all rather than a dead button.
 *
 * @param payload the same object handed to supabase.from('attendance').insert()
 */
export function buildFallbackUrl(payload, form = FALLBACK_FORM) {
  if (!isFallbackConfigured(form) || !payload) return null;

  const params = new URLSearchParams({ usp: 'pp_url' });

  for (const [field, entryId] of Object.entries(form.entries ?? {})) {
    if (!entryId) continue; // field not mapped — leave it for the student
    const value = formatValue(payload[field]);
    if (value === '') continue; // nothing useful to prefill
    params.set(entryId, value);
  }

  const base = form.baseUrl.trim();
  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

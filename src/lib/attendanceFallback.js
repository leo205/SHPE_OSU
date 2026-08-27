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
 * Paste the Google Form's details here.
 *
 * `baseUrl` — the form's public /viewform URL. Get it from the form's "Send"
 *   button → link icon, NOT from your browser's address bar while editing
 *   (that one ends in /edit and will not work for a respondent).
 *
 * `entries` — the prefill field IDs, which let the form open already filled in
 *   with what the student typed. Get them from the form's ⋮ menu →
 *   "Get pre-filled link" → fill every field with a recognisable dummy value →
 *   "Get link". The resulting URL contains `entry.123456789=dummy` pairs; copy
 *   each `entry.123456789` across to the matching field below.
 *
 *   Leave any of them as '' and that field is simply not prefilled — the form
 *   still works, the student just types that one in. So a partial setup is
 *   safe, and prefilling `event_name` is by far the most valuable one (see the
 *   warning on formatValue below).
 */
export const FALLBACK_FORM = {
  baseUrl: '',
  entries: {
    event_name: '',
    first_name: '',
    last_name_dotnum: '',
    year: '',
    is_first_meeting: '',
    major: '',
    how_heard: '',
    feedback: '',
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
 * Everything else passes through as-is, and that matters most for
 * `event_name`. It arrives here already formatted as `8/28 - <title>` by
 * eventOptionLabel(), which is the exact string the admin dashboard groups
 * attendance by. Prefilling it is what stops someone hand-typing "GBM #1" into
 * the form and splitting that meeting's history into two buckets that never
 * reconcile.
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

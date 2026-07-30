/**
 * Shared "Other" major formatting.
 *
 * Both the attendance check-in and the resume portal let a student pick "Other"
 * and type their real major, which is then flattened into a single text column.
 * These two writers used to disagree — Attendance wrote "Other – x" (en dash)
 * while ResumeUpload wrote "Other - x" (hyphen) — so any admin filter, export,
 * or future migration that matched one form silently missed half the rows.
 *
 * HANDOFF.md documents the en-dash form, so that is the canonical one. Keep
 * every writer going through formatMajor() rather than building the string
 * inline, and keep readers on isOtherMajor()/customMajorText().
 */
export const OTHER_MAJOR_PREFIX = 'Other – ';

/** Flattens a (major, customMajor) pair into the stored text value. */
export function formatMajor(major, customMajor = '') {
  return major === 'Other' ? `${OTHER_MAJOR_PREFIX}${customMajor.trim()}` : major;
}

/** True when a stored major came from the "Other" free-text path. */
export function isOtherMajor(stored) {
  return typeof stored === 'string' && stored.startsWith(OTHER_MAJOR_PREFIX);
}

/** Pulls the free-text portion back out of a stored "Other – x" value. */
export function customMajorText(stored) {
  return isOtherMajor(stored) ? stored.slice(OTHER_MAJOR_PREFIX.length) : '';
}

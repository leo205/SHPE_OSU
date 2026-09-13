export type AttendanceRequest = {
  event_id: string | null;
  event_name: string;
  first_name: string;
  last_name_dotnum: string;
  year: string;
  is_first_meeting: boolean;
  feedback: string | null;
  major: string | null;
  how_heard: string | null;
  turnstile_token: string;
};

const YEARS = new Set([
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  '5th Year',
  'Graduate Student',
  'Professional',
]);

const MAJORS = new Set([
  'Aerospace Engineering',
  'Biomedical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Computer Science & Engineering',
  'Computer & Information Science',
  'Electrical and Computer Engineering',
  'Engineering Physics',
  'Environmental Engineering',
  'Food, Agricultural, & Biological Engineering',
  'Industrial & System Engineering',
  'Materials Science Engineering',
  'Mechanical Engineering',
  'Welding Engineering',
]);

const HOW_HEARD = new Set([
  'Friend / Word of mouth',
  'Instagram (@shpeosu)',
  'Involvement Fair / Tabling',
  'Professor / Advisor',
  'GroupMe',
  'Canvas / Email',
  'Other',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const OTHER_MAJOR_PREFIX = 'Other – ';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (normalized.length > maxLength) return undefined;
  return normalized || null;
}

function validEventLabel(value: string): boolean {
  const match = /^(\d{1,2})\/(\d{1,2}) - .+$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Rejects malformed/oversized requests before they consume Turnstile and
 * database work. PostgreSQL repeats the authoritative validation; this parser
 * is a resource guard, not the only security boundary.
 */
export function parseAttendanceRequest(value: unknown): AttendanceRequest | null {
  if (!isRecord(value)) return null;

  const {
    event_id: eventId,
    event_name: rawEventName,
    first_name: rawFirstName,
    last_name_dotnum: rawIdentity,
    year: rawYear,
    is_first_meeting: isFirstMeeting,
    feedback: rawFeedback,
    major: rawMajor,
    how_heard: rawHowHeard,
    turnstile_token: turnstileToken,
  } = value;

  if (eventId !== null && (typeof eventId !== 'string' || !UUID.test(eventId))) return null;
  if (typeof rawEventName !== 'string') return null;
  if (typeof rawFirstName !== 'string' || typeof rawIdentity !== 'string') return null;
  if (typeof rawYear !== 'string' || typeof isFirstMeeting !== 'boolean') return null;
  if (typeof turnstileToken !== 'string' || turnstileToken.length < 1 || turnstileToken.length > 2048) {
    return null;
  }

  const eventName = rawEventName.trim();
  const firstName = rawFirstName.trim();
  const identity = rawIdentity.trim();
  const year = rawYear.trim();
  const feedback = optionalText(rawFeedback, 2000);
  let major = optionalText(rawMajor, 158);
  let howHeard = optionalText(rawHowHeard, 100);

  if (!validEventLabel(eventName) || eventName.length > 500) return null;
  if (!firstName || firstName.length > 100 || CONTROL_CHARACTER.test(firstName)) return null;
  if (!identity || identity.length > 100 || CONTROL_CHARACTER.test(identity)) return null;
  if (!YEARS.has(year) || feedback === undefined || major === undefined || howHeard === undefined) {
    return null;
  }

  if (isFirstMeeting) {
    const customMajor = major?.startsWith(OTHER_MAJOR_PREFIX)
      ? major.slice(OTHER_MAJOR_PREFIX.length).trim()
      : null;
    const validMajor = major !== null && (
      MAJORS.has(major)
      || (customMajor !== null && customMajor.length >= 1 && customMajor.length <= 150)
    );
    if (!validMajor || howHeard === null || !HOW_HEARD.has(howHeard)) return null;
  } else {
    major = null;
    howHeard = null;
  }

  return {
    event_id: eventId,
    event_name: eventName,
    first_name: firstName,
    last_name_dotnum: identity,
    year,
    is_first_meeting: isFirstMeeting,
    feedback,
    major,
    how_heard: howHeard,
    turnstile_token: turnstileToken,
  };
}

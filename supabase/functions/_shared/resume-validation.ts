export const MAX_RESUME_BYTES = 250 * 1024;
export const MIN_RESUME_BYTES = 10 * 1024;

export type ResumeSubmission = {
  full_name: string;
  email: string;
  major: string;
  graduation_year: string;
  submission_id: string;
  submission_started_at: number;
  turnstile_token: string;
  file: File;
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_LOCAL_PART = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const OTHER_MAJOR_PREFIX = 'Other – ';
const VALID_EMAIL_DOMAINS = new Set([
  'osu.edu',
  'alumni.osu.edu',
  'buckeyemail.osu.edu',
]);
const MAJORS = new Set([
  'Aerospace Engineering',
  'Biomedical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Computer Science & Engineering',
  'Computer & Information Science',
  'Data Analytics',
  'Electrical and Computer Engineering',
  'Engineering Physics',
  'Environmental Engineering',
  'Food, Agricultural, & Biological Engineering',
  'Industrial & Systems Eng.',
  'Materials Science Engineering',
  'Mechanical Engineering',
  'Welding Engineering',
]);

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : null;
}

function validEmail(email: string): boolean {
  if (email.length > 254 || CONTROL_CHARACTER.test(email)) return false;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return false;
  return EMAIL_LOCAL_PART.test(email.slice(0, at))
    && VALID_EMAIL_DOMAINS.has(email.slice(at + 1));
}

function normalizedMajor(major: string): string | null {
  if (MAJORS.has(major)) return major;
  if (!major.startsWith(OTHER_MAJOR_PREFIX)) return null;
  const custom = major.slice(OTHER_MAJOR_PREFIX.length).trim();
  return custom.length >= 1
    && custom.length <= 150
    && !CONTROL_CHARACTER.test(custom)
    ? `${OTHER_MAJOR_PREFIX}${custom}`
    : null;
}

function validGraduationYear(value: string, now: number): boolean {
  if (value === 'Alumni') return true;
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  const currentYear = new Date(now).getUTCFullYear();
  // The one-year cushion avoids a false rejection around a UTC/local New Year
  // boundary while still bounding arbitrary client input.
  return year >= currentYear - 1 && year <= currentYear + 6;
}

async function hasPdfMagic(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer());
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * Resource validation before any challenge or privileged Storage/database work.
 * PostgreSQL repeats all metadata/path checks; the bucket repeats MIME/size
 * limits. The browser's checks are only user feedback and are never trusted.
 */
export async function parseResumeFormData(
  form: FormData,
  now = Date.now(),
): Promise<ResumeSubmission | null> {
  const fullName = textField(form, 'full_name');
  const email = textField(form, 'email')?.toLowerCase() ?? null;
  const major = textField(form, 'major');
  const graduationYear = textField(form, 'graduation_year');
  const submissionId = textField(form, 'submission_id');
  const startedAtText = textField(form, 'submission_started_at');
  const turnstileToken = textField(form, 'turnstile_token');
  const file = form.get('file');

  if (
    !fullName || fullName.length > 200 || CONTROL_CHARACTER.test(fullName)
    || !email || !validEmail(email)
    || !major || major.length > 158
    || !graduationYear || !validGraduationYear(graduationYear, now)
    || !submissionId || !UUID.test(submissionId)
    || !startedAtText || !/^\d{13}$/.test(startedAtText)
    || !turnstileToken || turnstileToken.length > 2048
    || !(file instanceof File)
    || file.type.toLowerCase() !== 'application/pdf'
    || file.size < MIN_RESUME_BYTES
    || file.size > MAX_RESUME_BYTES
  ) {
    return null;
  }

  const canonicalMajor = normalizedMajor(major);
  if (!canonicalMajor) return null;

  const submissionStartedAt = Number(startedAtText);
  if (
    !Number.isSafeInteger(submissionStartedAt)
    || submissionStartedAt < now - 24 * 60 * 60_000
    || submissionStartedAt > now + 5 * 60_000
    || !(await hasPdfMagic(file))
  ) {
    return null;
  }

  return {
    full_name: fullName,
    email,
    major: canonicalMajor,
    graduation_year: graduationYear,
    submission_id: submissionId.toLowerCase(),
    submission_started_at: submissionStartedAt,
    turnstile_token: turnstileToken,
    file,
  };
}

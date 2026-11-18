import { inspectStaticResumePdf } from './pdf-inspection.ts';

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
  // Absence is a legacy client, while '' / [] explicitly clears a choice.
  linkedin_url?: string;
  company_ids?: string[];
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

function normalizedLinkedInUrl(value: string): string | null {
  if (!value.trim()) return '';
  if (value.length > 2048 || /[\s\\]/u.test(value)
    || [...value].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || (code >= 127 && code <= 159);
    })) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:'
      || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    const match = /^\/in\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    const profile = decodeURIComponent(match[1]);
    if (/[\s/\\?#]/u.test(profile) || [...profile].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || (code >= 127 && code <= 159);
    })) return null;
    return `https://www.linkedin.com/in/${match[1]}/`;
  } catch {
    return null;
  }
}

function normalizedCompanyIds(value: string): string[] | null {
  // Bound the JSON itself before parsing, as well as the number of IDs.
  if (value.length > 8192) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 100
      || !parsed.every((id) => typeof id === 'string' && UUID.test(id))) return null;
    return [...new Set((parsed as string[]).map((id) => id.toLowerCase()))].sort();
  } catch {
    return null;
  }
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

/** Run only AFTER valid Turnstile and durable quotas, before reservations/upload. */
export async function validateResumePdf(file: File): Promise<boolean> {
  if (file.type.toLowerCase() !== 'application/pdf'
    || file.size < MIN_RESUME_BYTES || file.size > MAX_RESUME_BYTES) return false;
  return inspectStaticResumePdf(new Uint8Array(await file.arrayBuffer()));
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
  const linkedinProvided = form.has('linkedin_url');
  const companiesProvided = form.has('company_ids');
  const linkedinField = form.get('linkedin_url');
  const companiesField = form.get('company_ids');
  if ((linkedinProvided && (typeof linkedinField !== 'string' || form.getAll('linkedin_url').length !== 1))
    || (companiesProvided && (typeof companiesField !== 'string' || form.getAll('company_ids').length !== 1))) return null;
  const linkedinUrl = linkedinProvided ? normalizedLinkedInUrl(linkedinField as string) : undefined;
  const companyIds = companiesProvided ? normalizedCompanyIds(companiesField as string) : undefined;
  if (linkedinUrl === null || companyIds === null) return null;

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
    ...(linkedinProvided ? { linkedin_url: linkedinUrl as string } : {}),
    ...(companiesProvided ? { company_ids: companyIds as string[] } : {}),
  };
}

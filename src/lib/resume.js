import { protectedSubmissionFailureReason } from './protectedSubmission.js';

export const MAX_RESUME_BYTES = 250 * 1024;
export const MIN_RESUME_BYTES = 10 * 1024;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const VALID_EMAIL_DOMAINS = new Set([
  'osu.edu',
  'alumni.osu.edu',
  'buckeyemail.osu.edu',
]);

export function formatFileSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export function buildGraduationYears(now = new Date()) {
  const current = now.getFullYear();
  return [...Array.from({ length: 6 }, (_, index) => String(current + index)), 'Alumni'];
}

export function createSubmissionId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function createResumeDraftKey(now = Date.now(), cryptoImpl = globalThis.crypto) {
  return { id: createSubmissionId(cryptoImpl), startedAt: now };
}

export async function isValidPDF(file) {
  const buffer = await file.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

export function isOSUEmail(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator !== normalized.indexOf('@')) return false;
  return VALID_EMAIL_DOMAINS.has(normalized.slice(separator + 1));
}

/** The only browser path for resume files and metadata. */
export async function submitResume(
  client,
  { fields, file, submissionId, submissionStartedAt, turnstileToken }
) {
  if (!turnstileToken) return { ok: false, reason: 'verification_required' };

  const body = new FormData();
  body.set('full_name', fields.full_name);
  body.set('email', fields.email);
  body.set('major', fields.major);
  body.set('graduation_year', fields.graduation_year);
  body.set('submission_id', submissionId);
  body.set('submission_started_at', String(submissionStartedAt));
  body.set('turnstile_token', turnstileToken);
  body.set('file', file);

  try {
    const { data, error } = await client.functions.invoke('submit-resume', {
      body,
      // Worst-case server bounds are roughly 45s: Siteverify, six sequential
      // database calls, and Storage. Leave cold-start/network headroom so the
      // browser does not abandon a request that Edge may still commit.
      timeout: 60_000,
    });
    if (error) {
      return { ok: false, reason: await protectedSubmissionFailureReason(error) };
    }
    if (data?.status !== 'accepted') return { ok: false, reason: 'service_unavailable' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }
}

export function resumeErrorMessage(reason) {
  switch (reason) {
    case 'verification_required':
      return 'Please complete the verification before submitting.';
    case 'verification_failed':
      return 'Verification expired or could not be confirmed. Please try it again.';
    case 'rate_limited':
      return 'Too many resume attempts were received. Please wait before trying again.';
    case 'invalid_submission':
      return 'The server could not validate that submission. Check every field and PDF, then try again.';
    case 'invalid_pdf':
      return 'Please export your resume as a standard PDF without a password, forms, or attachments, then upload it again (up to 10 pages).';
    case 'idempotency_conflict':
      return 'Those details changed after an earlier upload attempt. Review them, then submit again to start a fresh upload.';
    default:
      return 'We could not confirm your upload. Complete a fresh verification and try once more, then contact an E-Board member if it still fails.';
  }
}

import type { ResumeSubmission } from './resume-validation.ts';

async function sha256Hex(value: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Binds a browser-generated idempotency key to one exact normalized draft.
 * The short-lived Turnstile token is deliberately excluded so a legitimate
 * retry can use a fresh token without changing the reserved submission.
 */
export async function resumeFingerprint(submission: ResumeSubmission): Promise<string> {
  const fileHash = await sha256Hex(await submission.file.arrayBuffer());
  const canonical = JSON.stringify({
    full_name: submission.full_name,
    email: submission.email,
    major: submission.major,
    graduation_year: submission.graduation_year,
    submission_id: submission.submission_id,
    submission_started_at: submission.submission_started_at,
    file_sha256: fileHash,
  });
  return sha256Hex(new TextEncoder().encode(canonical));
}

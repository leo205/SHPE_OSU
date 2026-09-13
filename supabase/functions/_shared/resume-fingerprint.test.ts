import { describe, expect, it } from 'vitest';
import { resumeFingerprint } from './resume-fingerprint.ts';
import type { ResumeSubmission } from './resume-validation.ts';

function submission(overrides: Partial<ResumeSubmission> = {}): ResumeSubmission {
  return {
    full_name: 'Brutus Buckeye',
    email: 'buckeye.1@osu.edu',
    major: 'Mechanical Engineering',
    graduation_year: '2027',
    submission_id: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
    submission_started_at: 1788364800000,
    turnstile_token: 'token-is-intentionally-excluded',
    file: new File(['%PDF-one'], 'one.pdf', { type: 'application/pdf' }),
    ...overrides,
  };
}

describe('resume idempotency fingerprint', () => {
  it('is stable across an exact retry and never depends on the one-use challenge', async () => {
    const first = await resumeFingerprint(submission());
    const retry = await resumeFingerprint(submission({ turnstile_token: 'fresh-token' }));

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(retry).toBe(first);
  });

  it('changes when metadata or file content changes under the same submission id', async () => {
    const original = await resumeFingerprint(submission());
    const changedEmail = await resumeFingerprint(submission({ email: 'other.2@osu.edu' }));
    const changedFile = await resumeFingerprint(submission({
      file: new File(['%PDF-two'], 'two.pdf', { type: 'application/pdf' }),
    }));

    expect(changedEmail).not.toBe(original);
    expect(changedFile).not.toBe(original);
  });
});

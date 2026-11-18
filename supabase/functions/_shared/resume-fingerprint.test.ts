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
  it('preserves the exact pre-extension fingerprint for legacy retries', async () => {
    expect(await resumeFingerprint(submission()))
      .toBe('81a38d2519c97488e2df766c8aa9c35b4e20f9fc644d2acd47afe56916cb33c8');
  });

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

  it('binds optional LinkedIn and company selections including explicit empty values', async () => {
    const legacy = await resumeFingerprint(submission());
    const emptyLinkedIn = await resumeFingerprint(submission({ linkedin_url: '' }));
    const emptyCompanies = await resumeFingerprint(submission({ company_ids: [] }));
    const profile = await resumeFingerprint(submission({ linkedin_url: 'https://www.linkedin.com/in/sample/' }));
    const company = await resumeFingerprint(submission({ company_ids: ['aa85ed37-f923-4197-ad85-0f921ea143b5'] }));
    expect(new Set([legacy, emptyLinkedIn, emptyCompanies, profile, company]).size).toBe(5);
  });

  it('converges reordered and duplicate company choices with a fresh challenge', async () => {
    const first = 'aa85ed37-f923-4197-ad85-0f921ea143b5';
    const second = 'bb85ed37-f923-4197-ad85-0f921ea143b5';
    const canonical = await resumeFingerprint(submission({ company_ids: [first, second], linkedin_url: '' }));
    const retry = await resumeFingerprint(submission({ company_ids: [second.toUpperCase(), first, second], linkedin_url: '', turnstile_token: 'fresh-token' }));
    expect(retry).toBe(canonical);
    expect(await resumeFingerprint(submission({ company_ids: [first], linkedin_url: '' }))).not.toBe(canonical);
  });
});

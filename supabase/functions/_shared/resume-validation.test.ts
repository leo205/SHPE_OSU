import { describe, expect, it } from 'vitest';
import {
  MAX_RESUME_BYTES,
  MIN_RESUME_BYTES,
  parseResumeFormData,
} from './resume-validation.ts';

const NOW = Date.parse('2026-09-02T16:00:00Z');
const ID = 'cb85ed37-f923-4197-ad85-0f921ea143b5';

function validPdf(size = MIN_RESUME_BYTES): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return new File([bytes], 'anything.pdf', { type: 'application/pdf' });
}

function form(overrides: Record<string, string | File> = {}): FormData {
  const values: Record<string, string | File> = {
    full_name: '  Brutus Buckeye  ',
    email: ' Buckeye.1@OSU.edu ',
    major: 'Mechanical Engineering',
    graduation_year: '2027',
    submission_id: ID,
    submission_started_at: String(NOW - 30_000),
    turnstile_token: 'one-use-token',
    file: validPdf(),
    ...overrides,
  };
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe('protected resume request validation', () => {
  it('normalizes a complete submission and never trusts the original filename', async () => {
    const parsed = await parseResumeFormData(form(), NOW);

    expect(parsed).toMatchObject({
      full_name: 'Brutus Buckeye',
      email: 'buckeye.1@osu.edu',
      major: 'Mechanical Engineering',
      graduation_year: '2027',
      submission_id: ID,
      submission_started_at: NOW - 30_000,
      turnstile_token: 'one-use-token',
    });
    expect(parsed?.file).toBeInstanceOf(File);
  });

  it.each([
    'student@osu.edu',
    'student@buckeyemail.osu.edu',
    'graduate@alumni.osu.edu',
  ])('accepts the supported OSU domain %s', async (email) => {
    expect(await parseResumeFormData(form({ email }), NOW)).not.toBeNull();
  });

  it.each([
    'student@gmail.com',
    'student@osu.edu.attacker.example',
    '@osu.edu',
    'a@@osu.edu',
  ])('rejects the untrusted address %s', async (email) => {
    expect(await parseResumeFormData(form({ email }), NOW)).toBeNull();
  });

  it('accepts the canonical custom-major en dash and rejects a hyphen variant', async () => {
    expect(await parseResumeFormData(form({ major: 'Other – Robotics' }), NOW)).not.toBeNull();
    expect(await parseResumeFormData(form({ major: 'Other - Robotics' }), NOW)).toBeNull();
  });

  it('canonicalizes whitespace inside an Other major before fingerprinting', async () => {
    expect((await parseResumeFormData(form({ major: 'Other –   Robotics  ' }), NOW))?.major)
      .toBe('Other – Robotics');
  });

  it.each([
    ['bad UUID', { submission_id: 'not-a-uuid' }],
    ['old retry key', { submission_started_at: String(NOW - 25 * 60 * 60_000) }],
    ['future retry key', { submission_started_at: String(NOW + 6 * 60_000) }],
    ['wrong year', { graduation_year: '2099' }],
    ['control character', { full_name: 'Bad\nName' }],
    ['missing token', { turnstile_token: '' }],
  ])('rejects %s', async (_name, replacement) => {
    expect(await parseResumeFormData(form(replacement), NOW)).toBeNull();
  });

  it.each([
    ['too small', validPdf(MIN_RESUME_BYTES - 1)],
    ['too large', validPdf(MAX_RESUME_BYTES + 1)],
    ['wrong MIME', new File([new Uint8Array(MIN_RESUME_BYTES)], 'resume.pdf', { type: 'text/plain' })],
    ['wrong magic', new File([new Uint8Array(MIN_RESUME_BYTES)], 'resume.pdf', { type: 'application/pdf' })],
  ])('rejects a %s file', async (_name, file) => {
    expect(await parseResumeFormData(form({ file }), NOW)).toBeNull();
  });
});

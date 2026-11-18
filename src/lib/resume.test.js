import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RESUME_BYTES,
  MIN_RESUME_BYTES,
  buildGraduationYears,
  createSubmissionId,
  createResumeDraftKey,
  isOSUEmail,
  isValidPDF,
  resumeErrorMessage,
  submitResume,
} from './resume.js';

describe('resume validation contracts', () => {
  it.each([
    'student@osu.edu',
    'student@buckeyemail.osu.edu',
    'graduate@alumni.osu.edu',
  ])('accepts the supported OSU address %s', (email) => {
    expect(isOSUEmail(email)).toBe(true);
  });

  it.each([
    'spoof@osu.edu.evil.com',
    'student@gmail.com',
    '@osu.edu',
  ])('rejects the non-OSU address %s', (email) => {
    expect(isOSUEmail(email)).toBe(false);
  });

  it('keeps the documented 10–250 KB file window', () => {
    expect(MIN_RESUME_BYTES).toBe(10 * 1024);
    expect(MAX_RESUME_BYTES).toBe(250 * 1024);
  });

  it('checks PDF magic bytes instead of trusting the filename or MIME type', async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'resume.pdf', {
      type: 'application/pdf',
    });
    const fake = new File([new Uint8Array([0x4d, 0x5a, 0x00, 0x00])], 'resume.pdf', {
      type: 'application/pdf',
    });

    expect(await isValidPDF(pdf)).toBe(true);
    expect(await isValidPDF(fake)).toBe(false);
  });

  it('derives a six-year graduation window plus Alumni', () => {
    expect(buildGraduationYears(new Date('2026-06-01T12:00:00-04:00')))
      .toEqual(['2026', '2027', '2028', '2029', '2030', '2031', 'Alumni']);
  });

  it('creates an RFC 4122 v4 id when Safari lacks crypto.randomUUID', () => {
    const fakeCrypto = {
      getRandomValues: (bytes) => {
        bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        return bytes;
      },
    };

    expect(createSubmissionId(fakeCrypto)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('creates the retry key when an upload attempt starts', () => {
    const cryptoImpl = { randomUUID: () => 'cb85ed37-f923-4197-ad85-0f921ea143b5' };
    expect(createResumeDraftKey(1788364800000, cryptoImpl)).toEqual({
      id: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
      startedAt: 1788364800000,
    });
  });
});

describe('protected resume submission gateway', () => {
  it('explains rejected PDF features without exposing parser diagnostics', () => {
    expect(resumeErrorMessage('invalid_pdf')).toContain('without a password, forms, or attachments');
  });
  it('sends one multipart Edge request and never writes storage/database directly', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { status: 'accepted' },
      error: null,
    });
    const client = {
      functions: { invoke },
      storage: { from: vi.fn(() => { throw new Error('direct storage access is forbidden'); }) },
      rpc: vi.fn(() => { throw new Error('direct RPC access is forbidden'); }),
    };
    const file = new File([new Uint8Array(MIN_RESUME_BYTES).fill(1)], 'original-name.pdf', {
      type: 'application/pdf',
    });

    const result = await submitResume(client, {
      fields: {
        full_name: 'Brutus Buckeye',
        email: 'buckeye.1@osu.edu',
        major: 'Mechanical Engineering',
        graduation_year: '2027',
      },
      file,
      submissionId: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
      submissionStartedAt: 1788364800000,
      turnstileToken: 'verified-token',
    });

    expect(result).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe('submit-resume');
    expect(options.timeout).toBe(60_000);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('email')).toBe('buckeye.1@osu.edu');
    expect(options.body.get('full_name')).toBe('Brutus Buckeye');
    expect(options.body.get('major')).toBe('Mechanical Engineering');
    expect(options.body.get('graduation_year')).toBe('2027');
    expect(options.body.get('submission_id')).toBe('cb85ed37-f923-4197-ad85-0f921ea143b5');
    expect(options.body.get('submission_started_at')).toBe('1788364800000');
    expect(options.body.get('file')).toBe(file);
    expect(options.body.get('turnstile_token')).toBe('verified-token');
    expect(options.body.has('linkedin_url')).toBe(false);
    expect(options.body.has('company_ids')).toBe(false);
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ linkedin_url: '', company_ids: [] }, '', '[]'],
    [{ linkedin_url: 'https://www.linkedin.com/in/example-student/', company_ids: ['10000000-0000-4000-8000-000000000001'] }, 'https://www.linkedin.com/in/example-student/', '["10000000-0000-4000-8000-000000000001"]'],
  ])('sends explicit extension values while retaining the protected multipart gateway', async (extensions, linkedin, companies) => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: 'accepted' }, error: null });
    const result = await submitResume({ functions: { invoke } }, {
      fields: { full_name: 'Example Student', email: 'example.student@osu.edu', major: 'Mechanical Engineering', graduation_year: '2028', ...extensions },
      file: new File(['%PDF-fixture'], 'resume.pdf', { type: 'application/pdf' }),
      submissionId: '10000000-0000-4000-8000-000000000002', submissionStartedAt: 1788364800000, turnstileToken: 'verified-token',
    });
    expect(result).toEqual({ ok: true });
    const body = invoke.mock.calls[0][1].body;
    expect(body.has('linkedin_url')).toBe(true); expect(body.get('linkedin_url')).toBe(linkedin);
    expect(body.has('company_ids')).toBe(true); expect(body.get('company_ids')).toBe(companies);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('maps a changed company catalog to review guidance without retrying an upload', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'company_choices_changed' }), { status: 409 }) } });
    const result = await submitResume({ functions: { invoke } }, {
      fields: { full_name: 'Example Student', email: 'example.student@osu.edu', major: 'Mechanical Engineering', graduation_year: '2028', linkedin_url: '', company_ids: [] },
      file: new File(['%PDF-fixture'], 'resume.pdf', { type: 'application/pdf' }),
      submissionId: '10000000-0000-4000-8000-000000000002', submissionStartedAt: 1788364800000, turnstileToken: 'verified-token',
    });
    expect(result).toEqual({ ok: false, reason: 'company_choices_changed' });
    expect(resumeErrorMessage(result.reason)).toContain('Review the updated list');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the function without a verification token', async () => {
    const invoke = vi.fn();
    const result = await submitResume({ functions: { invoke } }, {
      fields: {},
      file: new File([], 'resume.pdf'),
      submissionId: '',
      submissionStartedAt: 0,
      turnstileToken: '',
    });

    expect(result).toEqual({ ok: false, reason: 'verification_required' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

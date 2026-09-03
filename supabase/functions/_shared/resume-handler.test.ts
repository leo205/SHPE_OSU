import { describe, expect, it, vi } from 'vitest';
import { MIN_RESUME_BYTES } from './resume-validation.ts';
import { createResumeHandler } from './resume-handler.ts';

const NOW = Date.parse('2026-09-02T16:00:00Z');
const SUBMISSION_ID = 'cb85ed37-f923-4197-ad85-0f921ea143b5';
const RESUME_PATH = 'submissions/1788364770000_7030c6a7-7d31-40b2-9f8c-cb6c44093b4e.pdf';

const environment = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_current' }),
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_ALLOWED_HOSTNAMES: 'shpeosu.com,www.shpeosu.com',
  RATE_LIMIT_HMAC_SECRET: 'x'.repeat(32),
};

function pdf(): File {
  const bytes = new Uint8Array(MIN_RESUME_BYTES);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return new File([bytes], 'student-name.pdf', { type: 'application/pdf' });
}

function form(overrides: Record<string, string | File> = {}): FormData {
  const values: Record<string, string | File> = {
    full_name: 'Brutus Buckeye',
    email: 'buckeye.1@osu.edu',
    major: 'Mechanical Engineering',
    graduation_year: '2027',
    submission_id: SUBMISSION_ID,
    submission_started_at: String(NOW - 30_000),
    turnstile_token: 'verified-token',
    file: pdf(),
    ...overrides,
  };
  const body = new FormData();
  for (const [name, value] of Object.entries(values)) body.set(name, value);
  return body;
}

function request(body: BodyInit = form(), headers: Record<string, string> = {}): Request {
  return new Request('https://project.supabase.co/functions/v1/submit-resume', {
    method: 'POST',
    headers: {
      origin: 'https://www.shpeosu.com',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body,
  });
}

function setup({
  challenge = 'valid',
  rpc,
  upload,
} = {}) {
  const rpcMock = rpc ?? vi.fn(async (name) => {
    if (name === 'consume_public_submission_rate_limit') return { data: true, error: null };
    if (name === 'reserve_resume_submission') {
      return { data: { status: 'reserved', resume_path: RESUME_PATH }, error: null };
    }
    return { data: 'accepted', error: null };
  });
  const uploadMock = upload ?? vi.fn().mockResolvedValue({ status: 'uploaded', error: null });
  const removeMock = vi.fn().mockResolvedValue({ error: null });
  const createAdmin = vi.fn(() => ({
    rpc: rpcMock,
    storage: { upload: uploadMock, remove: removeMock },
  }));
  const verifyChallenge = vi.fn().mockResolvedValue(challenge);
  const hmac = vi.fn(async (_secret, value) => `hash:${value}`);
  const fingerprint = vi.fn().mockResolvedValue('f'.repeat(64));
  const logError = vi.fn();
  const handler = createResumeHandler({
    env: (name) => environment[name],
    createAdmin,
    verifyChallenge,
    hmac,
    fingerprint,
    now: () => NOW,
    logError,
  });
  return {
    handler,
    rpcMock,
    uploadMock,
    removeMock,
    createAdmin,
    verifyChallenge,
    hmac,
    fingerprint,
    logError,
  };
}

describe('protected resume Edge handler', () => {
  it('rejects a declared oversized request before backend or multipart work', async () => {
    const { handler, createAdmin } = setup();
    const response = await handler(request('x', {
      'content-type': 'text/plain',
      'content-length': String(321 * 1024),
    }));

    expect(response.status).toBe(413);
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it('uses a pre-parse durable ceiling, then rejects malformed multipart input', async () => {
    const { handler, rpcMock, verifyChallenge } = setup();
    const response = await handler(request('not multipart', { 'content-type': 'text/plain' }));

    expect(response.status).toBe(400);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('consume_public_submission_rate_limit', {
      p_rate_key: 'hash:resume:edge:203.0.113.10',
      p_max_requests: 100,
      p_window_seconds: 600,
    });
    expect(verifyChallenge).not.toHaveBeenCalled();
  });

  it.each([
    ['rejected', 403, 'verification_failed'],
    ['unavailable', 503, 'service_unavailable'],
  ])('maps a %s challenge without privileged Storage work', async (challenge, status, error) => {
    const { handler, verifyChallenge, uploadMock } = setup({ challenge });
    const response = await handler(request());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(verifyChallenge).toHaveBeenCalledWith(expect.objectContaining({
      expectedAction: 'resume_submit',
    }));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('isolates resume network/email rate keys and blocks before reservation', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const { handler, uploadMock } = setup({ rpc });
    const response = await handler(request());

    expect(response.status).toBe(429);
    expect(rpc).toHaveBeenNthCalledWith(2, 'consume_public_submission_rate_limit', {
      p_rate_key: 'hash:resume:network:203.0.113.10',
      p_max_requests: 200,
      p_window_seconds: 3600,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, 'consume_public_submission_rate_limit', {
      p_rate_key: 'hash:resume:email:buckeye.1@osu.edu',
      p_max_requests: 5,
      p_window_seconds: 3600,
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('returns an already-queued exact retry without uploading again', async () => {
    const rpc = vi.fn(async (name) => {
      if (name === 'consume_public_submission_rate_limit') return { data: true, error: null };
      if (name === 'reserve_resume_submission') {
        return { data: { status: 'accepted', resume_path: RESUME_PATH }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const { handler, uploadMock } = setup({ rpc });
    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects a reused idempotency key bound to different content', async () => {
    const rpc = vi.fn(async (name) => {
      if (name === 'consume_public_submission_rate_limit') return { data: true, error: null };
      return { data: { status: 'conflict', resume_path: null }, error: null };
    });
    const { handler, uploadMock } = setup({ rpc });
    const response = await handler(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'idempotency_conflict' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('uploads only to the server-reserved path and queues validated metadata', async () => {
    const { handler, rpcMock, uploadMock, fingerprint } = setup();
    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(fingerprint).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith('resumes', RESUME_PATH, expect.any(File));
    expect(rpcMock).toHaveBeenCalledWith('reserve_resume_submission', {
      p_submission_id: SUBMISSION_ID,
      p_submission_started_at: NOW - 30_000,
      p_fingerprint: 'f'.repeat(64),
    });
    expect(rpcMock).toHaveBeenCalledWith('consume_public_submission_rate_limit', {
      p_rate_key: 'hash:resume:global:v1',
      p_max_requests: 500,
      p_window_seconds: 86400,
    });
    expect(rpcMock).toHaveBeenLastCalledWith('queue_resume_submission', {
      p_submission_id: SUBMISSION_ID,
      p_fingerprint: 'f'.repeat(64),
      p_full_name: 'Brutus Buckeye',
      p_email: 'buckeye.1@osu.edu',
      p_major: 'Mechanical Engineering',
      p_graduation_year: '2027',
      p_resume_path: RESUME_PATH,
    });
  });

  it('does not write metadata when Storage fails', async () => {
    const upload = vi.fn().mockResolvedValue({
      status: null,
      error: { code: 'storage_unavailable' },
    });
    const { handler, rpcMock, logError } = setup({ upload });
    const response = await handler(request());

    expect(response.status).toBe(503);
    expect(rpcMock).not.toHaveBeenCalledWith('queue_resume_submission', expect.anything());
    expect(logError).toHaveBeenCalledWith(
      '[submit-resume] Storage upload failed.',
      'storage_unavailable',
    );
  });

  it('keeps an uploaded object on an ambiguous queue outage for safe retry', async () => {
    const rpc = vi.fn(async (name) => {
      if (name === 'consume_public_submission_rate_limit') return { data: true, error: null };
      if (name === 'reserve_resume_submission') {
        return { data: { status: 'reserved', resume_path: RESUME_PATH }, error: null };
      }
      return { data: null, error: { code: 'rpc_unavailable' } };
    });
    const { handler, removeMock } = setup({ rpc });
    const response = await handler(request());

    expect(response.status).toBe(503);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('cleans up a newly uploaded object after a definite queue rejection', async () => {
    const rpc = vi.fn(async (name) => {
      if (name === 'consume_public_submission_rate_limit') return { data: true, error: null };
      if (name === 'reserve_resume_submission') {
        return { data: { status: 'reserved', resume_path: RESUME_PATH }, error: null };
      }
      return { data: 'invalid_submission', error: null };
    });
    const { handler, removeMock } = setup({ rpc });
    const response = await handler(request());

    expect(response.status).toBe(400);
    expect(removeMock).toHaveBeenCalledWith('resumes', [RESUME_PATH]);
  });
});

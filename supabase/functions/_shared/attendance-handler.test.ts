import { describe, expect, it, vi } from 'vitest';
import { createAttendanceHandler } from './attendance-handler.ts';

const body = {
  event_id: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
  event_name: '9/3 - GBM #1',
  first_name: 'Maria',
  last_name_dotnum: 'Buckeye.1',
  year: '2nd Year',
  is_first_meeting: false,
  feedback: null,
  major: null,
  how_heard: null,
  turnstile_token: 'verified-token',
};

const environment = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_current' }),
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_ALLOWED_HOSTNAMES: 'shpeosu.com,www.shpeosu.com',
  RATE_LIMIT_HMAC_SECRET: 'x'.repeat(32),
};

function request(payload = body, init = {}) {
  return new Request('https://project.supabase.co/functions/v1/submit-attendance', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.shpeosu.com',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(payload),
    ...init,
  });
}

function setup({ challenge = 'valid', rpc } = {}) {
  const rpcMock = rpc ?? vi.fn().mockResolvedValue({ data: 'accepted', error: null });
  const createAdmin = vi.fn(() => ({ rpc: rpcMock }));
  const verifyChallenge = vi.fn().mockResolvedValue(challenge);
  const hmac = vi.fn(async (_secret, value) => `hash:${value}`);
  const logError = vi.fn();
  const handler = createAttendanceHandler({
    env: (name) => environment[name],
    createAdmin,
    verifyChallenge,
    hmac,
    logError,
  });
  return { handler, rpcMock, createAdmin, verifyChallenge, hmac, logError };
}

describe('protected attendance Edge handler', () => {
  it('handles local preview CORS preflight without touching a backend', async () => {
    const { handler, createAdmin } = setup();
    const response = await handler(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:4173' },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:4173');
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it('rejects malformed input before Turnstile or database work', async () => {
    const { handler, createAdmin, verifyChallenge } = setup();
    const response = await handler(request({ ...body, year: 'Freshman' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_submission' });
    expect(createAdmin).not.toHaveBeenCalled();
    expect(verifyChallenge).not.toHaveBeenCalled();
  });

  it('requires the exact JSON media type, allowing only normal parameters', async () => {
    const rejected = setup();
    const rejectedResponse = await rejected.handler(request(body, {
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'application/jsonp',
      },
    }));
    expect(rejectedResponse.status).toBe(415);
    expect(rejected.createAdmin).not.toHaveBeenCalled();

    const accepted = setup();
    const acceptedResponse = await accepted.handler(request(body, {
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'Application/JSON; charset=utf-8',
      },
    }));
    expect(acceptedResponse.status).toBe(200);
  });

  it('cancels a chunked body as soon as it crosses the byte cap', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"padding":"'));
        controller.enqueue(new Uint8Array(24 * 1024));
      },
      cancel,
    });
    const init = {
      method: 'POST',
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'application/json',
      },
      body: stream,
      duplex: 'half',
    } as RequestInit;
    const dependencies = setup();

    const response = await dependencies.handler(new Request('https://example.com', init));

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(dependencies.createAdmin).not.toHaveBeenCalled();
  });

  it('preserves the shared Wi-Fi allowance after more invalid attempts than the retired edge ceiling', async () => {
    const { handler, rpcMock, createAdmin, verifyChallenge, hmac } = setup({ challenge: 'rejected' });
    for (let attempt = 0; attempt < 501; attempt += 1) {
      const rejected = await handler(request({ ...body, turnstile_token: `invalid-${attempt}` }));
      expect(rejected.status).toBe(403);
    }

    expect(rpcMock).not.toHaveBeenCalled();
    expect(createAdmin).not.toHaveBeenCalled();
    expect(hmac).not.toHaveBeenCalled();

    verifyChallenge.mockResolvedValue('valid');
    const accepted = await handler(request());
    expect(accepted.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('submit_attendance', expect.objectContaining({
      p_network_rate_key: 'hash:attendance:network:203.0.113.10',
    }));
  });

  it.each([
    ['rejected', 403, 'verification_failed'],
    ['unavailable', 503, 'service_unavailable'],
  ])('maps a %s Turnstile result without consuming quotas or writing attendance', async (challenge, status, error) => {
    const { handler, rpcMock, createAdmin } = setup({ challenge });
    const response = await handler(request());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it('passes only validated fields and HMAC keys to the service-only RPC', async () => {
    const { handler, rpcMock, createAdmin, verifyChallenge } = setup();
    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(createAdmin).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'sb_secret_current',
    );
    expect(verifyChallenge).toHaveBeenCalledWith(expect.objectContaining({
      expectedAction: 'attendance_submit',
      allowedHostnames: new Set(['shpeosu.com', 'www.shpeosu.com']),
      remoteIp: '203.0.113.10',
    }));
    expect(rpcMock).toHaveBeenLastCalledWith('submit_attendance', expect.objectContaining({
      p_network_rate_key: 'hash:attendance:network:203.0.113.10',
      p_identity_rate_key: 'hash:attendance:identity:buckeye.1',
      p_event_id: body.event_id,
      p_event_name: '9/3 - GBM #1',
      p_first_name: 'Maria',
    }));
  });

  it('maps the database limiter and database outage separately', async () => {
    const limitedRpc = vi.fn()
      .mockResolvedValueOnce({ data: 'rate_limited', error: null });
    const limited = setup({ rpc: limitedRpc });
    const limitedResponse = await limited.handler(request());
    expect(limitedResponse.status).toBe(429);
    expect(limited.verifyChallenge).toHaveBeenCalledTimes(1);
    expect(await limitedResponse.json()).toEqual({ error: 'rate_limited' });

    const failedRpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'rpc_unavailable' } });
    const failed = setup({ rpc: failedRpc });
    const failedResponse = await failed.handler(request());
    expect(failedResponse.status).toBe(503);
    expect(await failedResponse.json()).toEqual({ error: 'service_unavailable' });
    expect(failed.logError).toHaveBeenCalledWith(
      '[submit-attendance] Database request failed.',
      'rpc_unavailable',
    );
  });
});

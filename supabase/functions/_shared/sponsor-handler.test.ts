import { describe, expect, it, vi } from 'vitest';
import { createSponsorInquiryHandler } from './sponsor-handler.ts';

const body = {
  inquiry_id: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
  company_name: 'Acme Corp',
  contact_name: 'Jane Smith',
  reply_to: 'JANE@ACME.EXAMPLE',
  tier: 'Carmen ($1,000)',
  message: 'We would like to partner.',
  turnstile_token: 'verified-token',
};

const environment = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_current' }),
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_ALLOWED_HOSTNAMES: 'shpeosu.com,www.shpeosu.com',
  RATE_LIMIT_HMAC_SECRET: 'x'.repeat(32),
  EMAILJS_SERVICE_ID: 'service_test',
  EMAILJS_TEMPLATE_ID: 'template_test',
  EMAILJS_PUBLIC_KEY: 'public_test',
  EMAILJS_PRIVATE_KEY: 'private_test',
  SPONSOR_INQUIRY_DAILY_LIMIT: '20',
  SPONSOR_INQUIRY_MONTHLY_LIMIT: '150',
};

function request(payload = body, init = {}) {
  return new Request('https://project.supabase.co/functions/v1/submit-sponsor-inquiry', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.shpeosu.com',
      'cf-connecting-ip': '203.0.113.10',
    },
    body: JSON.stringify(payload),
    ...init,
  });
}

function setup({ challenge = 'valid', rpc, sendResult = 'sent', env = environment } = {}) {
  const rpcMock = rpc ?? vi.fn().mockResolvedValue({ data: true, error: null });
  const createAdmin = vi.fn(() => ({ rpc: rpcMock }));
  const verifyChallenge = vi.fn().mockResolvedValue(challenge);
  const hmac = vi.fn(async (_secret, value) => `hash:${value}`);
  const sendInquiry = vi.fn().mockResolvedValue(sendResult);
  const logError = vi.fn();
  const handler = createSponsorInquiryHandler({
    env: (name) => env[name],
    createAdmin,
    verifyChallenge,
    hmac,
    sendInquiry,
    logError,
  });
  return { handler, rpcMock, createAdmin, verifyChallenge, hmac, sendInquiry, logError };
}

describe('protected sponsor inquiry Edge handler', () => {
  it('handles exact-origin CORS and rejects unsupported methods and content types', async () => {
    const dependencies = setup();
    const preflight = await dependencies.handler(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:4173' },
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4173');

    const getResponse = await dependencies.handler(new Request('https://example.com', {
      method: 'GET',
      headers: { origin: 'https://www.shpeosu.com' },
    }));
    expect(getResponse.status).toBe(405);

    const wrongOrigin = await dependencies.handler(new Request('https://example.com', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    expect(wrongOrigin.status).toBe(403);

    const wrongType = await dependencies.handler(request(body, {
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'text/plain',
      },
    }));
    expect(wrongType.status).toBe(415);

    const misleadingJsonType = await dependencies.handler(request(body, {
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'application/jsonp',
      },
    }));
    expect(misleadingJsonType.status).toBe(415);
    expect(dependencies.createAdmin).not.toHaveBeenCalled();
  });

  it('accepts application/json media-type parameters', async () => {
    const dependencies = setup();
    const response = await dependencies.handler(request(body, {
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'Application/JSON; charset=utf-8',
      },
    }));

    expect(response.status).toBe(200);
    expect(dependencies.sendInquiry).toHaveBeenCalledTimes(1);
  });

  it('bounds both declared and actual request bytes before parsing', async () => {
    const declared = setup();
    const declaredResponse = await declared.handler(request(body, {
      headers: {
        origin: 'https://www.shpeosu.com',
        'content-type': 'application/json',
        'content-length': String(16 * 1024 + 1),
      },
    }));
    expect(declaredResponse.status).toBe(413);

    const actual = setup();
    const actualResponse = await actual.handler(request({ padding: 'x'.repeat(17 * 1024) }));
    expect(actualResponse.status).toBe(413);
    expect(actual.createAdmin).not.toHaveBeenCalled();
  });

  it('cancels a chunked body as soon as it crosses the byte cap', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"padding":"'));
        controller.enqueue(new Uint8Array(16 * 1024));
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

  it('rejects malformed input before Turnstile, database, or email work', async () => {
    const dependencies = setup();
    const response = await dependencies.handler(request({ ...body, tier: 'Free' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_submission' });
    expect(dependencies.createAdmin).not.toHaveBeenCalled();
    expect(dependencies.verifyChallenge).not.toHaveBeenCalled();
    expect(dependencies.sendInquiry).not.toHaveBeenCalled();
  });

  it('still blocks verified submissions when the durable network allowance is exhausted', async () => {
    const dependencies = setup({ rpc: vi.fn().mockResolvedValue({ data: false, error: null }) });
    const response = await dependencies.handler(request());

    expect(response.status).toBe(429);
    expect(dependencies.verifyChallenge).toHaveBeenCalledTimes(1);
    expect(dependencies.sendInquiry).not.toHaveBeenCalled();
  });

  it('preserves the shared Wi-Fi allowance after more invalid attempts than the retired edge ceiling', async () => {
    const dependencies = setup({ challenge: 'rejected' });
    for (let attempt = 0; attempt < 101; attempt += 1) {
      const response = await dependencies.handler(request({ ...body, turnstile_token: `invalid-${attempt}` }));
      expect(response.status).toBe(403);
    }

    expect(dependencies.createAdmin).not.toHaveBeenCalled();
    expect(dependencies.rpcMock).not.toHaveBeenCalled();
    expect(dependencies.hmac).not.toHaveBeenCalled();
    expect(dependencies.sendInquiry).not.toHaveBeenCalled();

    dependencies.verifyChallenge.mockResolvedValue('valid');
    expect((await dependencies.handler(request())).status).toBe(200);
    expect(dependencies.sendInquiry).toHaveBeenCalledTimes(1);
    expect(dependencies.rpcMock).toHaveBeenCalledTimes(5);
  });

  it('verifies the sponsor-specific action then enforces every durable bucket', async () => {
    const dependencies = setup();
    const response = await dependencies.handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(dependencies.verifyChallenge).toHaveBeenCalledWith(expect.objectContaining({
      expectedAction: 'sponsor_inquiry',
      allowedHostnames: new Set(['shpeosu.com', 'www.shpeosu.com']),
      remoteIp: '203.0.113.10',
    }));
    expect(dependencies.hmac.mock.calls.map(([, value]) => value)).toEqual([
      'sponsor:network:203.0.113.10',
      'sponsor:email:jane@acme.example',
      'sponsor:global:provider:v1',
      'sponsor:global:daily:v1',
      'sponsor:global:monthly:v1',
    ]);
    expect(dependencies.rpcMock).toHaveBeenCalledTimes(5);
    expect(dependencies.rpcMock).toHaveBeenNthCalledWith(
      3,
      'consume_public_submission_rate_limit',
      expect.objectContaining({ p_max_requests: 1, p_window_seconds: 1 }),
    );
    expect(dependencies.rpcMock).toHaveBeenNthCalledWith(
      4,
      'consume_public_submission_rate_limit',
      expect.objectContaining({ p_max_requests: 20, p_window_seconds: 86_400 }),
    );
    expect(dependencies.rpcMock).toHaveBeenNthCalledWith(
      5,
      'consume_public_submission_rate_limit',
      expect.objectContaining({ p_max_requests: 150, p_window_seconds: 2_678_400 }),
    );
    expect(dependencies.sendInquiry).toHaveBeenCalledTimes(1);
    expect(dependencies.sendInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ reply_to: 'jane@acme.example' }),
      {
        serviceId: 'service_test',
        templateId: 'template_test',
        publicKey: 'public_test',
        privateKey: 'private_test',
      },
    );
    expect(dependencies.sendInquiry.mock.calls[0][0]).not.toHaveProperty('turnstile_token');
  });

  it('never sends email when Turnstile or any post-verification bucket rejects', async () => {
    const rejectedChallenge = setup({ challenge: 'rejected' });
    expect((await rejectedChallenge.handler(request())).status).toBe(403);
    expect(rejectedChallenge.sendInquiry).not.toHaveBeenCalled();
    expect(rejectedChallenge.rpcMock).not.toHaveBeenCalled();

    const postRateRpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValue({ data: true, error: null });
    const limited = setup({ rpc: postRateRpc });
    expect((await limited.handler(request())).status).toBe(429);
    expect(limited.sendInquiry).not.toHaveBeenCalled();
  });

  it('paces the provider first and does not consume monthly budget after daily closes', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null }) // network
      .mockResolvedValueOnce({ data: true, error: null }) // email
      .mockResolvedValueOnce({ data: true, error: null }) // provider pacing
      .mockResolvedValueOnce({ data: false, error: null }); // daily
    const dependencies = setup({ rpc });

    const response = await dependencies.handler(request());

    expect(response.status).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(dependencies.hmac.mock.calls.map(([, value]) => value)).toEqual([
      'sponsor:network:203.0.113.10',
      'sponsor:email:jane@acme.example',
      'sponsor:global:provider:v1',
      'sponsor:global:daily:v1',
    ]);
    expect(dependencies.sendInquiry).not.toHaveBeenCalled();
  });

  it('does not consume daily or monthly budgets when provider pacing rejects', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null }) // network
      .mockResolvedValueOnce({ data: true, error: null }) // email
      .mockResolvedValueOnce({ data: false, error: null }); // provider pacing
    const dependencies = setup({ rpc });

    const response = await dependencies.handler(request());

    expect(response.status).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(dependencies.hmac.mock.calls.map(([, value]) => value)).toEqual([
      'sponsor:network:203.0.113.10',
      'sponsor:email:jane@acme.example',
      'sponsor:global:provider:v1',
    ]);
    expect(dependencies.sendInquiry).not.toHaveBeenCalled();
  });

  it('fails closed when Turnstile or the durable limiter is unavailable', async () => {
    const challengeUnavailable = setup({ challenge: 'unavailable' });
    const challengeResponse = await challengeUnavailable.handler(request());
    expect(challengeResponse.status).toBe(503);
    expect(challengeUnavailable.sendInquiry).not.toHaveBeenCalled();
    expect(challengeUnavailable.rpcMock).not.toHaveBeenCalled();
    expect(challengeUnavailable.createAdmin).not.toHaveBeenCalled();

    const rateUnavailable = setup({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'rpc_unavailable' } }),
    });
    const rateResponse = await rateUnavailable.handler(request());
    expect(rateResponse.status).toBe(503);
    expect(rateUnavailable.verifyChallenge).toHaveBeenCalledTimes(1);
    expect(rateUnavailable.sendInquiry).not.toHaveBeenCalled();
    expect(JSON.stringify(rateUnavailable.logError.mock.calls)).not.toMatch(
      /Acme|Jane|jane@|203\.0\.113\.10|verified-token/,
    );
  });

  it('allows an omitted optional private key but fails closed for missing required provider configuration', async () => {
    const freePlan = setup({ env: { ...environment, EMAILJS_PRIVATE_KEY: '' } });
    expect((await freePlan.handler(request())).status).toBe(200);
    expect(freePlan.sendInquiry).toHaveBeenCalledWith(
      expect.any(Object),
      expect.not.objectContaining({ privateKey: expect.anything() }),
    );

    const misconfigured = setup({ env: { ...environment, EMAILJS_PUBLIC_KEY: '' } });
    expect((await misconfigured.handler(request())).status).toBe(503);
    expect(misconfigured.createAdmin).not.toHaveBeenCalled();

    const placeholderPrivateKey = setup({
      env: { ...environment, EMAILJS_PRIVATE_KEY: 'replace-with-private-key' },
    });
    expect((await placeholderPrivateKey.handler(request())).status).toBe(503);
    expect(placeholderPrivateKey.createAdmin).not.toHaveBeenCalled();

    const providerFailure = setup({ sendResult: 'failed' });
    const response = await providerFailure.handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'delivery_unconfirmed' });
    expect(providerFailure.sendInquiry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['bad daily limit', { SPONSOR_INQUIRY_DAILY_LIMIT: '20x' }],
    ['zero daily limit', { SPONSOR_INQUIRY_DAILY_LIMIT: '0' }],
    ['bad monthly limit', { SPONSOR_INQUIRY_MONTHLY_LIMIT: 'lots' }],
  ])('rejects %s as unsafe server configuration', async (_label, replacement) => {
    const dependencies = setup({ env: { ...environment, ...replacement } });
    const response = await dependencies.handler(request());

    expect(response.status).toBe(503);
    expect(dependencies.createAdmin).not.toHaveBeenCalled();
    expect(dependencies.sendInquiry).not.toHaveBeenCalled();
  });
});

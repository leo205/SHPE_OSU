import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile.ts';

const validResult = () => ({
  success: true,
  challenge_ts: new Date().toISOString(),
  hostname: 'www.shpeosu.com',
  action: 'attendance_submit',
});

const options = {
  token: 'one-use-token',
  remoteIp: '203.0.113.10',
  secret: 'server-only-secret',
  allowedHostnames: new Set(['shpeosu.com', 'www.shpeosu.com']),
  expectedAction: 'attendance_submit',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Turnstile server verification', () => {
  it('accepts only a successful result with the expected action and hostname', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(validResult()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await verifyTurnstile(options)).toBe('valid');
    const [, request] = fetchMock.mock.calls[0];
    expect(request.method).toBe('POST');
    expect(request.body.get('secret')).toBe('server-only-secret');
    expect(request.body.get('response')).toBe('one-use-token');
    expect(request.body.get('remoteip')).toBe('203.0.113.10');
  });

  it.each([
    ['wrong action', { action: 'resume_submit' }],
    ['wrong hostname', { hostname: 'attacker.example' }],
    ['expired timestamp', { challenge_ts: new Date(Date.now() - 6 * 60_000).toISOString() }],
    ['unsuccessful challenge', { success: false }],
  ])('rejects a %s response', async (_name, replacement) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...validResult(), ...replacement }), { status: 200 })
    ));

    expect(await verifyTurnstile(options)).toBe('rejected');
  });

  it('reports Siteverify infrastructure failure separately from a bad token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await verifyTurnstile(options)).toBe('unavailable');
  });

  it('supports a distinct action for another protected form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...validResult(),
      action: 'resume_submit',
    }), { status: 200 })));

    expect(await verifyTurnstile({ ...options, expectedAction: 'resume_submit' })).toBe('valid');
  });
});

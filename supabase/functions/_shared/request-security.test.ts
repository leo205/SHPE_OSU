import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  corsHeaders,
  hmacSha256,
  isAllowedOrigin,
  isTurnstileSecretAllowed,
  requestIp,
} from './request-security.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Edge request security helpers', () => {
  it('allows only exact production/local origins by default', () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });

    expect(isAllowedOrigin('https://www.shpeosu.com')).toBe(true);
    expect(isAllowedOrigin('http://localhost:4173')).toBe(true);
    expect(isAllowedOrigin('https://shpe-osu-git-security.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://shpeosu.com.attacker.example')).toBe(false);
  });

  it('allows an exact preview origin only when configured', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (name) => name === 'PUBLIC_SITE_ORIGINS'
          ? 'https://www.shpeosu.com,https://shpe-osu-git-security.vercel.app'
          : undefined,
      },
    });

    expect(isAllowedOrigin('https://shpe-osu-git-security.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://another-project.vercel.app')).toBe(false);
  });

  it('reflects only an allowed origin in CORS headers', () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });

    expect(corsHeaders('http://127.0.0.1:4173')).toMatchObject({
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    expect(corsHeaders('https://attacker.example'))
      .not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('prefers the gateway-provided Cloudflare address and never stores it directly', async () => {
    const request = new Request('https://example.com', {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.99, 10.0.0.1',
      },
    });

    expect(requestIp(request)).toBe('203.0.113.10');
    const digest = await hmacSha256('a sufficiently long secret', `network:${requestIp(request)}`);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('203.0.113.10');
  });

  it('uses the final forwarded hop when trusted gateway headers are unavailable', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.10' },
    });
    expect(requestIp(request)).toBe('203.0.113.10');
  });

  it('refuses Cloudflare test secrets against a deployed Supabase URL', () => {
    const alwaysPass = '1x0000000000000000000000000000000AA';
    const alwaysFail = '2x0000000000000000000000000000000AA';

    expect(isTurnstileSecretAllowed(alwaysPass, 'https://project.supabase.co')).toBe(false);
    expect(isTurnstileSecretAllowed(alwaysFail, 'https://functions.example.org')).toBe(false);
    expect(isTurnstileSecretAllowed(alwaysPass, 'http://127.0.0.1:54321')).toBe(true);
    expect(isTurnstileSecretAllowed(alwaysPass, 'http://kong:8000')).toBe(true);
    expect(isTurnstileSecretAllowed('real-production-secret', 'https://project.supabase.co'))
      .toBe(true);
  });
});

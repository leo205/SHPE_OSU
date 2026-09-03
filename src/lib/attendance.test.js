import { describe, expect, it, vi } from 'vitest';
import {
  buildAttendanceRequest,
  shouldOfferAttendanceFallback,
  submitAttendance,
} from './attendance.js';

const payload = {
  event_name: '9/3 - GBM #1',
  first_name: 'Maria',
  last_name_dotnum: 'Buckeye.1',
  year: '2nd Year',
  is_first_meeting: false,
  feedback: null,
  major: null,
  how_heard: null,
};

describe('attendance submission gateway', () => {
  it('preserves the event label and uses a database UUID when one exists', () => {
    expect(buildAttendanceRequest({
      payload,
      event: { id: 'cb85ed37-f923-4197-ad85-0f921ea143b5', source: 'db' },
      turnstileToken: 'verified-token',
    })).toEqual({
      ...payload,
      event_id: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
      turnstile_token: 'verified-token',
    });
  });

  it('uses a null database ID for a bundled fallback event', () => {
    expect(buildAttendanceRequest({
      payload,
      event: { id: 4, source: 'static' },
      turnstileToken: 'verified-token',
    }).event_id).toBeNull();
  });

  it('calls the protected function exactly once and never writes to attendance directly', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: 'accepted' }, error: null });
    const client = {
      functions: { invoke },
      from: vi.fn(() => { throw new Error('direct table access is forbidden'); }),
    };

    const result = await submitAttendance(client, {
      payload,
      event: { id: 'cb85ed37-f923-4197-ad85-0f921ea143b5', source: 'db' },
      turnstileToken: 'verified-token',
    });

    expect(result).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('submit-attendance', {
      body: expect.objectContaining({
        event_id: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
        event_name: '9/3 - GBM #1',
        turnstile_token: 'verified-token',
      }),
      timeout: 25_000,
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('does not send a request without a bot-challenge token', async () => {
    const invoke = vi.fn();
    const client = { functions: { invoke } };

    expect(await submitAttendance(client, {
      payload,
      event: { id: 'cb85ed37-f923-4197-ad85-0f921ea143b5', source: 'db' },
      turnstileToken: '',
    })).toEqual({ ok: false, reason: 'verification_required' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['rate_limited', 'invalid_submission', 'verification_failed'])(
    'keeps the backup form hidden for an expected %s rejection',
    async (reason) => {
      const response = new Response(JSON.stringify({ error: reason }), {
        status: reason === 'rate_limited' ? 429 : 400,
        headers: { 'content-type': 'application/json' },
      });
      const client = {
        functions: {
          invoke: vi.fn().mockResolvedValue({ data: null, error: { context: response } }),
        },
      };

      const result = await submitAttendance(client, {
        payload,
        event: { id: 'cb85ed37-f923-4197-ad85-0f921ea143b5', source: 'db' },
        turnstileToken: 'verified-token',
      });

      expect(result).toEqual({ ok: false, reason });
      expect(shouldOfferAttendanceFallback(result.reason)).toBe(false);
    }
  );

  it('offers the backup only for a genuine service failure', async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: new Error('network down') }),
      },
    };

    const result = await submitAttendance(client, {
      payload,
      event: { id: 'cb85ed37-f923-4197-ad85-0f921ea143b5', source: 'db' },
      turnstileToken: 'verified-token',
    });

    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
    expect(shouldOfferAttendanceFallback(result.reason)).toBe(false);
    expect(shouldOfferAttendanceFallback(result.reason, 2)).toBe(true);
  });

  it('keeps the backup hidden for an unknown 4xx security rejection', async () => {
    const response = new Response(JSON.stringify({ error: 'new_security_rule' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: { context: response } }),
      },
    };

    const result = await submitAttendance(client, {
      payload,
      event: { id: 'cb85ed37-f923-4197-ad85-0f921ea143b5', source: 'db' },
      turnstileToken: 'verified-token',
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_submission' });
    expect(shouldOfferAttendanceFallback(result.reason)).toBe(false);
  });
});

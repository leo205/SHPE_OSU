import { describe, expect, it, vi } from 'vitest';
import {
  createInquiryId,
  prepareInquiryDraft,
  SPONSOR_TIERS,
  SPONSOR_TIER_LABELS,
  sponsorInquiryErrorMessage,
  submitSponsorInquiry,
} from './sponsorInquiry.js';
import { SPONSOR_TIER_OPTIONS } from '../../supabase/functions/_shared/sponsor-validation.ts';

const fields = {
  company_name: 'Acme Corp',
  contact_name: 'Jane Smith',
  reply_to: 'jane@acme.example',
  tier: 'Carmen ($1,000)',
  message: 'We would like to partner.',
};

describe('sponsor inquiry submission gateway', () => {
  it('derives every purchasable form label from the pricing-card definition', () => {
    expect(SPONSOR_TIERS.map(({ label }) => label)).toEqual(
      SPONSOR_TIER_LABELS.filter((label) => label !== 'Custom'),
    );
    expect(SPONSOR_TIERS.every(({ name, price, label }) => (
      label === `${name} (${price})`
    ))).toBe(true);
  });

  it('keeps browser tier labels in lockstep with the server allowlist', () => {
    expect([...SPONSOR_TIER_OPTIONS]).toEqual(SPONSOR_TIER_LABELS);
  });

  it('uses the protected function and never exposes provider credentials', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: 'accepted' }, error: null });
    const client = { functions: { invoke } };

    await expect(submitSponsorInquiry(client, {
      fields,
      inquiryId: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
      turnstileToken: 'verified-token',
    })).resolves.toEqual({ ok: true });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('submit-sponsor-inquiry', {
      body: {
        ...fields,
        inquiry_id: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
        turnstile_token: 'verified-token',
      },
      timeout: 50_000,
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/service_id|template_id|accessToken/i);
  });

  it('does not call the function without a one-time challenge token', async () => {
    const invoke = vi.fn();

    await expect(submitSponsorInquiry(
      { functions: { invoke } },
      {
        fields,
        inquiryId: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
        turnstileToken: '',
      },
    )).resolves.toEqual({ ok: false, reason: 'verification_required' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps security rejections distinct from provider availability failures', async () => {
    const limited = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: { context: limited } }),
      },
    };

    await expect(submitSponsorInquiry(client, {
      fields,
      inquiryId: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
      turnstileToken: 'verified-token',
    })).resolves.toEqual({ ok: false, reason: 'rate_limited' });

    expect(sponsorInquiryErrorMessage('rate_limited')).toMatch(/too many/i);
    expect(sponsorInquiryErrorMessage('service_unavailable')).toMatch(/could not confirm/i);
  });

  it('treats a lost Edge response as delivery-unknown and never retries', async () => {
    const invoke = vi.fn().mockRejectedValue(new TypeError('offline'));
    const result = await submitSponsorInquiry(
      { functions: { invoke } },
      {
        fields,
        inquiryId: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
        turnstileToken: 'verified-token',
      },
    );

    expect(result).toEqual({ ok: false, reason: 'delivery_unconfirmed' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('recognizes the Supabase SDK resolved fetch-error shape as delivery-unknown', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsFetchError',
        context: new TypeError('network response was lost'),
      },
    });

    const result = await submitSponsorInquiry(
      { functions: { invoke } },
      {
        fields,
        inquiryId: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
        turnstileToken: 'verified-token',
      },
    );

    expect(result).toEqual({ ok: false, reason: 'delivery_unconfirmed' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('creates a UUID without requiring randomUUID support', () => {
    const cryptoImpl = {
      getRandomValues: (bytes) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      },
    };

    expect(createInquiryId(cryptoImpl)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('retains one inquiry ID for an exact manual retry and rotates after edits', () => {
    const cryptoImpl = {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce('3f65dd7b-e5a8-42f4-860f-0ea690b76ac7')
        .mockReturnValueOnce('bf6f02ae-28f9-4b4f-9736-d4944ea9c5a6'),
    };
    const first = prepareInquiryDraft(null, fields, cryptoImpl);
    const retry = prepareInquiryDraft(first, { ...fields }, cryptoImpl);
    const edited = prepareInquiryDraft(first, { ...fields, message: 'Changed' }, cryptoImpl);

    expect(retry).toBe(first);
    expect(edited.id).not.toBe(first.id);
    expect(cryptoImpl.randomUUID).toHaveBeenCalledTimes(2);
  });
});

import { protectedSubmissionFailureReason } from './protectedSubmission.js';

const TIER_DEFINITIONS = [
  {
    name: 'Buckeye',
    price: '$500',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
    ],
  },
  {
    name: 'Carmen',
    price: '$1,000',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
      'Industry Competition Invitation',
      'Company Logo on Merch',
      'Social Media Feature',
      'Workshop Session',
    ],
  },
  {
    name: 'Scarlet & Gray',
    price: '$1,500',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
      'Industry Competition Invitation',
      'Company Logo on Merch',
      'Social Media Feature',
      'Workshop Session',
      'Sponsor National Convention Attendance',
      'Tabling at a General Meeting',
    ],
  },
  {
    name: 'Platinum',
    price: '$2,000',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
      'Industry Competition Invitation',
      'Company Logo on Merch',
      'Social Media Feature',
      'Workshop Session',
      'Sponsor National Convention Attendance',
      'Tabling at a General Meeting',
      'Community Outreach Invitation (K-12)',
      'SHPEasada Invitation',
      'Primary Sponsor Status',
    ],
  },
];

/** One source of truth for pricing cards and sponsor inquiry labels. */
export const SPONSOR_TIERS = Object.freeze(TIER_DEFINITIONS.map((tier) => Object.freeze({
  ...tier,
  benefits: Object.freeze([...tier.benefits]),
  label: `${tier.name} (${tier.price})`,
})));

export const SPONSOR_TIER_LABELS = Object.freeze([
  ...SPONSOR_TIERS.map(({ label }) => label),
  'Custom',
]);

/** Safari 14-compatible UUID used to correlate a manual retry of one draft. */
export function createInquiryId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();

  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/** Keep one correlation ID for an exact retry, but never reuse it after edits. */
export function prepareInquiryDraft(currentDraft, fields, cryptoImpl = globalThis.crypto) {
  const fingerprint = JSON.stringify(fields);
  if (currentDraft?.fingerprint === fingerprint) return currentDraft;
  return { id: createInquiryId(cryptoImpl), fingerprint };
}

/** The only browser path for sponsor inquiries. Provider keys stay server-side. */
export async function submitSponsorInquiry(
  client,
  { fields, inquiryId, turnstileToken },
) {
  if (!turnstileToken) return { ok: false, reason: 'verification_required' };

  try {
    const { data, error } = await client.functions.invoke('submit-sponsor-inquiry', {
      body: {
        ...fields,
        inquiry_id: inquiryId,
        turnstile_token: turnstileToken,
      },
      // Siteverify, durable limits, an Edge cold start, and one bounded provider
      // attempt must all finish. The server never retries the email side effect.
      timeout: 50_000,
    });

    if (error) {
      const reason = await protectedSubmissionFailureReason(error);
      return {
        ok: false,
        // Without an HTTP response, the Edge Function may have sent before the
        // connection was lost. Treat that as ambiguous and discourage retry.
        reason: reason === 'service_unavailable' && (
          error?.name === 'FunctionsFetchError'
          || error?.name === 'FunctionsRelayError'
          || typeof error?.context?.json !== 'function'
        )
          ? 'delivery_unconfirmed'
          : reason,
      };
    }
    if (data?.status !== 'accepted') return { ok: false, reason: 'service_unavailable' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'delivery_unconfirmed' };
  }
}

export function sponsorInquiryErrorMessage(reason) {
  switch (reason) {
    case 'verification_required':
      return 'Please complete the verification before submitting.';
    case 'verification_failed':
      return 'Verification expired or could not be confirmed. Please try it again.';
    case 'rate_limited':
      return 'Too many sponsor inquiries were received. Please wait before trying again.';
    case 'invalid_submission':
      return 'That inquiry could not be validated. Check each field and try again.';
    case 'delivery_unconfirmed':
      return 'We could not confirm whether the email service accepted your inquiry. To avoid an accidental duplicate, email us directly or retry later.';
    default:
      return 'We could not confirm your inquiry. Please email us directly or try again later.';
  }
}

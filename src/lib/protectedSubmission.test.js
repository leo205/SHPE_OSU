import { describe, expect, it } from 'vitest';
import {
  protectedSubmissionFailureReason,
  shouldOfferOutageFallback,
} from './protectedSubmission.js';

function functionError(status, body) {
  return { context: new Response(JSON.stringify(body), { status }) };
}

describe('protected public-submission failures', () => {
  it('preserves a safe idempotency conflict without treating it as an outage', async () => {
    const reason = await protectedSubmissionFailureReason(
      functionError(409, { error: 'idempotency_conflict' }),
    );

    expect(reason).toBe('idempotency_conflict');
    expect(shouldOfferOutageFallback(reason, 10)).toBe(false);
  });

  it('preserves an ambiguous email-provider result for honest retry guidance', async () => {
    const reason = await protectedSubmissionFailureReason(
      functionError(502, { error: 'delivery_unconfirmed' }),
    );

    expect(reason).toBe('delivery_unconfirmed');
    expect(shouldOfferOutageFallback(reason, 10)).toBe(false);
  });

  it('maps unknown client errors to invalid and server errors to unavailable', async () => {
    expect(await protectedSubmissionFailureReason(functionError(400, { error: 'private_detail' })))
      .toBe('invalid_submission');
    expect(await protectedSubmissionFailureReason(functionError(503, { error: 'private_detail' })))
      .toBe('service_unavailable');
  });

  it('offers an emergency fallback only after two availability failures', () => {
    expect(shouldOfferOutageFallback('service_unavailable', 1)).toBe(false);
    expect(shouldOfferOutageFallback('service_unavailable', 2)).toBe(true);
    expect(shouldOfferOutageFallback('verification_failed', 2)).toBe(false);
  });
});

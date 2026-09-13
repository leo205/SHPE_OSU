const KNOWN_REJECTION_REASONS = new Set([
  'invalid_submission',
  'idempotency_conflict',
  'delivery_unconfirmed',
  'rate_limited',
  'verification_failed',
  'verification_required',
]);

/** Map Supabase Function errors without turning an unknown 4xx into a bypass. */
export async function protectedSubmissionFailureReason(error) {
  const context = error?.context;
  if (!context || typeof context.json !== 'function') return 'service_unavailable';

  try {
    const response = typeof context.clone === 'function' ? context.clone() : context;
    const body = await response.json();
    if (KNOWN_REJECTION_REASONS.has(body?.error)) return body.error;
    return context.status >= 500 ? 'service_unavailable' : 'invalid_submission';
  } catch {
    return context.status >= 500 ? 'service_unavailable' : 'invalid_submission';
  }
}

/** Emergency fallbacks appear only after two actual availability failures. */
export function shouldOfferOutageFallback(reason, failedAttempts = 1) {
  return reason === 'service_unavailable' && failedAttempts >= 2;
}

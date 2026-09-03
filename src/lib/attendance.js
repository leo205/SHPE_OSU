import {
  protectedSubmissionFailureReason,
  shouldOfferOutageFallback,
} from './protectedSubmission.js';

/**
 * Build the narrow request accepted by the protected attendance Edge Function.
 *
 * `event_name` remains the historical M/D - title label. A database UUID is
 * included when available so the server can derive (and therefore distrust)
 * that label; bundled fallback events deliberately send null and must still
 * match a canonical row in `public.events` on the server.
 */
export function buildAttendanceRequest({ payload, event, turnstileToken }) {
  const databaseEventId = event?.source === 'db' && typeof event.id === 'string'
    ? event.id
    : null;

  return {
    ...payload,
    event_id: databaseEventId,
    turnstile_token: turnstileToken,
  };
}

/**
 * The only browser path for attendance writes.
 *
 * The Edge Function verifies Turnstile and applies the durable rate limit before
 * calling the service-role-only database function. There is intentionally no
 * fallback to `from('attendance').insert(...)`: keeping that path would let a
 * script bypass every server-side control added here.
 */
export async function submitAttendance(client, { payload, event, turnstileToken }) {
  if (!turnstileToken) return { ok: false, reason: 'verification_required' };

  try {
    const { data, error } = await client.functions.invoke('submit-attendance', {
      body: buildAttendanceRequest({ payload, event, turnstileToken }),
      // A stalled mobile connection must return control to the student and
      // expose the outage fallback rather than leaving "Submitting…" forever.
      // The Edge path has at most two 5s database calls plus a 5s Siteverify
      // verification, leaving room for a cold start while bounding the wait.
      timeout: 25_000,
    });

    if (error) return { ok: false, reason: await protectedSubmissionFailureReason(error) };
    if (data?.status !== 'accepted') return { ok: false, reason: 'service_unavailable' };

    return { ok: true };
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }
}

/** The backup form is an outage path, never a way around a security decision. */
export function shouldOfferAttendanceFallback(reason, failedAttempts = 1) {
  return shouldOfferOutageFallback(reason, failedAttempts);
}

export function attendanceErrorMessage(reason) {
  switch (reason) {
    case 'verification_required':
      return 'Please complete the verification before submitting.';
    case 'verification_failed':
      return 'Verification expired or could not be confirmed. Please try it again.';
    case 'rate_limited':
      return 'Too many check-in attempts came from this network. Please wait a few minutes or let an E-Board member know.';
    case 'invalid_submission':
      return 'That check-in could not be validated. Refresh the event list and try again.';
    default:
      return 'We could not confirm your check-in. Complete a fresh verification and press Submit once more.';
  }
}

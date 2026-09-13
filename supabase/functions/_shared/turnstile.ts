type SiteverifyResponse = {
  success?: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
};

type VerifyOptions = {
  token: string;
  remoteIp: string;
  secret: string;
  allowedHostnames: Set<string>;
  expectedAction: string;
};

export type TurnstileVerification = 'valid' | 'rejected' | 'unavailable';

/** Server-side verification is mandatory; a browser token alone proves nothing. */
export async function verifyTurnstile({
  token,
  remoteIp,
  secret,
  allowedHostnames,
  expectedAction,
}: VerifyOptions): Promise<TurnstileVerification> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp,
      idempotency_key: crypto.randomUUID(),
    });
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body,
        signal: controller.signal,
      },
    );
    if (!response.ok) return 'unavailable';

    const result = await response.json() as SiteverifyResponse;
    if (!result.success || result.action !== expectedAction) return 'rejected';
    if (!result.hostname || !allowedHostnames.has(result.hostname.toLowerCase())) return 'rejected';

    // Cloudflare already enforces the five-minute, single-use token rule. This
    // timestamp check additionally rejects malformed or unexpectedly old data.
    const challengeTime = Date.parse(result.challenge_ts ?? '');
    const age = Date.now() - challengeTime;
    return Number.isFinite(challengeTime) && age >= -60_000 && age <= 5 * 60_000
      ? 'valid'
      : 'rejected';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

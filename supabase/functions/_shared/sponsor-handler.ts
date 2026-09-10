import type { EmailJsConfig } from './emailjs-provider.ts';
import type { SponsorInquiry } from './sponsor-validation.ts';
import { parseSponsorInquiryRequest } from './sponsor-validation.ts';
import {
  corsHeaders,
  isAllowedOrigin,
  isTurnstileSecretAllowed,
  jsonResponse,
  requestIp,
} from './request-security.ts';
import type { TurnstileVerification } from './turnstile.ts';

const MAX_REQUEST_BYTES = 16 * 1024;
const MONTH_SECONDS = 31 * 24 * 60 * 60;

type RpcError = { code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

type EmailInquiry = Omit<SponsorInquiry, 'turnstile_token'>;

export type SponsorInquiryHandlerDependencies = {
  env: (name: string) => string | undefined;
  createAdmin: (url: string, secretKey: string) => AdminClient;
  verifyChallenge: (options: {
    token: string;
    remoteIp: string;
    secret: string;
    allowedHostnames: Set<string>;
    expectedAction: string;
  }) => Promise<TurnstileVerification>;
  hmac: (secret: string, value: string) => Promise<string>;
  sendInquiry: (inquiry: EmailInquiry, config: EmailJsConfig) => Promise<'sent' | 'failed'>;
  logError?: (message: string, code?: string) => void;
};

function allowedTurnstileHostnames(
  env: SponsorInquiryHandlerDependencies['env'],
): Set<string> {
  return new Set(
    (env('TURNSTILE_ALLOWED_HOSTNAMES') || 'shpeosu.com,www.shpeosu.com')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

function supabaseSecretKey(env: SponsorInquiryHandlerDependencies['env']): string | null {
  const currentKeys = env('SUPABASE_SECRET_KEYS');
  if (currentKeys) {
    try {
      const parsed = JSON.parse(currentKeys) as Record<string, unknown>;
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default;
    } catch {
      return null;
    }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') || null;
}

function positiveLimit(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : null;
}

function configuredEmailJs(env: SponsorInquiryHandlerDependencies['env']): EmailJsConfig | null {
  const serviceId = env('EMAILJS_SERVICE_ID')?.trim();
  const templateId = env('EMAILJS_TEMPLATE_ID')?.trim();
  const publicKey = env('EMAILJS_PUBLIC_KEY')?.trim();
  const privateKey = env('EMAILJS_PRIVATE_KEY')?.trim();

  if (
    !serviceId || !templateId || !publicKey
    || [serviceId, templateId, publicKey].some((value) => value.startsWith('replace-'))
    || privateKey?.startsWith('replace-')
  ) {
    return null;
  }
  return {
    serviceId,
    templateId,
    publicKey,
    ...(privateKey ? { privateKey } : {}),
  };
}

async function readJson(request: Request): Promise<
  | { status: 'ok'; value: unknown }
  | { status: 'invalid' | 'too_large' }
> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { status: 'too_large' };
  }

  if (!request.body) return { status: 'invalid' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { status: 'too_large' };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    return { status: 'ok', value: JSON.parse(text) as unknown };
  } catch {
    return { status: 'invalid' };
  }
}

export function createSponsorInquiryHandler(
  dependencies: SponsorInquiryHandlerDependencies,
) {
  const logError = dependencies.logError
    ?? ((message: string, code?: string) => console.error(message, code ? { code } : undefined));

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');

    if (!isAllowedOrigin(origin)) {
      return jsonResponse({ error: 'invalid_submission' }, 403, null);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'invalid_submission' }, 405, origin);
    }
    const mediaType = request.headers.get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== 'application/json') {
      return jsonResponse({ error: 'invalid_submission' }, 415, origin);
    }

    const parsedBody = await readJson(request);
    if (parsedBody.status === 'too_large') {
      return jsonResponse({ error: 'invalid_submission' }, 413, origin);
    }
    if (parsedBody.status === 'invalid') {
      return jsonResponse({ error: 'invalid_submission' }, 400, origin);
    }

    const inquiry = parseSponsorInquiryRequest(parsedBody.value);
    if (!inquiry) {
      return jsonResponse({ error: 'invalid_submission' }, 400, origin);
    }

    const supabaseUrl = dependencies.env('SUPABASE_URL');
    const secretKey = supabaseSecretKey(dependencies.env);
    const turnstileSecret = dependencies.env('TURNSTILE_SECRET_KEY');
    const rateLimitSecret = dependencies.env('RATE_LIMIT_HMAC_SECRET');
    const emailJs = configuredEmailJs(dependencies.env);
    const dailyLimit = positiveLimit(dependencies.env('SPONSOR_INQUIRY_DAILY_LIMIT'), 5);
    const monthlyLimit = positiveLimit(dependencies.env('SPONSOR_INQUIRY_MONTHLY_LIMIT'), 150);
    if (
      !supabaseUrl || !secretKey || !turnstileSecret
      || !isTurnstileSecretAllowed(turnstileSecret, supabaseUrl) || !emailJs
      || !rateLimitSecret || rateLimitSecret.length < 32 || rateLimitSecret.startsWith('replace-')
      || dailyLimit === null || monthlyLimit === null
    ) {
      logError('[submit-sponsor-inquiry] Required server configuration is missing.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    const remoteIp = requestIp(request);
    const admin = dependencies.createAdmin(supabaseUrl, secretKey);

    const consume = async (
      namespace: string,
      maxRequests: number,
      windowSeconds: number,
    ): Promise<'allowed' | 'limited' | 'unavailable'> => {
      const rateKey = await dependencies.hmac(rateLimitSecret, namespace);
      const { data, error } = await admin.rpc('consume_public_submission_rate_limit', {
        p_rate_key: rateKey,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });
      if (error) {
        logError('[submit-sponsor-inquiry] Durable rate-limit check failed.', error.code);
        return 'unavailable';
      }
      return data === true ? 'allowed' : 'limited';
    };

    // Reject automated token spraying before it can consume unlimited
    // Cloudflare Siteverify requests.
    const edgeRate = await consume(`sponsor:edge:${remoteIp}`, 100, 600);
    if (edgeRate === 'unavailable') {
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (edgeRate === 'limited') {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }

    const challenge = await dependencies.verifyChallenge({
      token: inquiry.turnstile_token,
      remoteIp,
      secret: turnstileSecret,
      allowedHostnames: allowedTurnstileHostnames(dependencies.env),
      expectedAction: 'sponsor_inquiry',
    });
    if (challenge === 'unavailable') {
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (challenge !== 'valid') {
      return jsonResponse({ error: 'verification_failed' }, 403, origin);
    }

    const identityBuckets: Array<[string, number, number]> = [
      [`sponsor:network:${remoteIp}`, 10, 3600],
      [`sponsor:email:${inquiry.reply_to}`, 3, 86_400],
    ];
    const globalBuckets: Array<[string, number, number]> = [
      ['sponsor:global:provider:v1', 1, 1],
      ['sponsor:global:daily:v1', dailyLimit, 86_400],
      ['sponsor:global:monthly:v1', monthlyLimit, MONTH_SECONDS],
    ];

    // The two independent identity buckets can run concurrently. They go first
    // so an already-limited attacker cannot consume the plan-wide budget.
    const identityResults = await Promise.all(
      identityBuckets.map(([namespace, maxRequests, windowSeconds]) => (
        consume(namespace, maxRequests, windowSeconds)
      )),
    );
    if (identityResults.includes('unavailable')) {
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (identityResults.includes('limited')) {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }

    // Global budgets are deliberately gated in order. Provider pacing goes
    // first so requests it rejects cannot consume the finite daily/monthly
    // inquiry allowance; daily goes before monthly so daily overflow also
    // cannot consume the longer-lived budget.
    for (const [namespace, maxRequests, windowSeconds] of globalBuckets) {
      const result = await consume(namespace, maxRequests, windowSeconds);
      if (result === 'unavailable') {
        return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      }
      if (result === 'limited') {
        return jsonResponse({ error: 'rate_limited' }, 429, origin);
      }
    }

    const { turnstile_token: _discardedToken, ...emailInquiry } = inquiry;
    const delivery = await dependencies.sendInquiry(emailInquiry, emailJs);
    if (delivery !== 'sent') {
      // Do not log names, email, message, IP, token, or provider response body.
      // The UUID is safe for correlating a user's manual report or duplicate.
      logError('[submit-sponsor-inquiry] Provider delivery unconfirmed.', inquiry.inquiry_id);
      return jsonResponse({ error: 'delivery_unconfirmed' }, 502, origin);
    }

    return jsonResponse({ status: 'accepted' }, 200, origin);
  };
}

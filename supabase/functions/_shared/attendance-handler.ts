import { parseAttendanceRequest } from './attendance-validation.ts';
import {
  corsHeaders,
  isAllowedOrigin,
  isTurnstileSecretAllowed,
  jsonResponse,
  requestIp,
} from './request-security.ts';
import type { TurnstileVerification } from './turnstile.ts';

const MAX_REQUEST_BYTES = 24 * 1024;

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

type RpcError = { code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

export type AttendanceHandlerDependencies = {
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
  logError?: (message: string, code?: string) => void;
};

function allowedTurnstileHostnames(env: AttendanceHandlerDependencies['env']): Set<string> {
  return new Set(
    (env('TURNSTILE_ALLOWED_HOSTNAMES') || 'shpeosu.com,www.shpeosu.com')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

function supabaseSecretKey(env: AttendanceHandlerDependencies['env']): string | null {
  const currentKeys = env('SUPABASE_SECRET_KEYS');
  if (currentKeys) {
    try {
      const parsed = JSON.parse(currentKeys) as Record<string, unknown>;
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default;
    } catch {
      return null;
    }
  }

  // Temporary compatibility for projects that have not generated Supabase's
  // replacement sb_secret key yet. The legacy key is deprecated at end-2026.
  return env('SUPABASE_SERVICE_ROLE_KEY') || null;
}

export function createAttendanceHandler(dependencies: AttendanceHandlerDependencies) {
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

    const attendance = parseAttendanceRequest(parsedBody.value);
    if (!attendance) {
      return jsonResponse({ error: 'invalid_submission' }, 400, origin);
    }

    const supabaseUrl = dependencies.env('SUPABASE_URL');
    const secretKey = supabaseSecretKey(dependencies.env);
    const turnstileSecret = dependencies.env('TURNSTILE_SECRET_KEY');
    const rateLimitSecret = dependencies.env('RATE_LIMIT_HMAC_SECRET');
    if (
      !supabaseUrl
      || !secretKey
      || !turnstileSecret
      || !isTurnstileSecretAllowed(turnstileSecret, supabaseUrl)
      || !rateLimitSecret
      || rateLimitSecret.length < 32
      || rateLimitSecret.startsWith('replace-')
    ) {
      logError('[submit-attendance] Required server configuration is missing.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    const remoteIp = requestIp(request);
    const supabaseAdmin = dependencies.createAdmin(supabaseUrl, secretKey);

    // Coarse pre-verification ceiling: invalid tokens never reach attendance,
    // but without this bucket they could consume unlimited Siteverify calls.
    const edgeRateKey = await dependencies.hmac(rateLimitSecret, `attendance:edge:${remoteIp}`);
    const { data: edgeAllowed, error: edgeRateError } = await supabaseAdmin.rpc(
      'consume_public_submission_rate_limit',
      {
        p_rate_key: edgeRateKey,
        p_max_requests: 500,
        p_window_seconds: 600,
      },
    );
    if (edgeRateError) {
      logError('[submit-attendance] Edge rate-limit check failed.', edgeRateError.code);
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (edgeAllowed !== true) {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }

    const challengeResult = await dependencies.verifyChallenge({
      token: attendance.turnstile_token,
      remoteIp,
      secret: turnstileSecret,
      allowedHostnames: allowedTurnstileHostnames(dependencies.env),
      expectedAction: 'attendance_submit',
    });
    if (challengeResult === 'unavailable') {
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (challengeResult !== 'valid') {
      return jsonResponse({ error: 'verification_failed' }, 403, origin);
    }

    const [networkRateKey, identityRateKey] = await Promise.all([
      dependencies.hmac(rateLimitSecret, `attendance:network:${remoteIp}`),
      dependencies.hmac(
        rateLimitSecret,
        `attendance:identity:${attendance.last_name_dotnum.toLowerCase()}`,
      ),
    ]);

    const { data, error } = await supabaseAdmin.rpc('submit_attendance', {
      p_network_rate_key: networkRateKey,
      p_identity_rate_key: identityRateKey,
      p_event_id: attendance.event_id,
      p_event_name: attendance.event_name,
      p_first_name: attendance.first_name,
      p_last_name_dotnum: attendance.last_name_dotnum,
      p_year: attendance.year,
      p_is_first_meeting: attendance.is_first_meeting,
      p_feedback: attendance.feedback,
      p_major: attendance.major,
      p_how_heard: attendance.how_heard,
    });

    if (error) {
      // Never log the request body: it contains identity and private feedback.
      logError('[submit-attendance] Database request failed.', error.code);
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    if (data === 'rate_limited') {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }
    if (data !== 'accepted') {
      return jsonResponse({ error: 'invalid_submission' }, 400, origin);
    }

    return jsonResponse({ status: 'accepted' }, 200, origin);
  };
}

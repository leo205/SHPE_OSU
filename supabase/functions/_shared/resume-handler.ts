import { resumeFingerprint } from './resume-fingerprint.ts';
import { parseResumeFormData } from './resume-validation.ts';
import {
  corsHeaders,
  isAllowedOrigin,
  isTurnstileSecretAllowed,
  jsonResponse,
  requestIp,
} from './request-security.ts';
import type { TurnstileVerification } from './turnstile.ts';

const MAX_REQUEST_BYTES = 320 * 1024;
const RESERVED_PATH = /^submissions\/(\d{13})_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

type ServiceError = { code?: string } | null;
type RpcResult = { data: unknown; error: ServiceError };
type StorageUploadResult = {
  status: 'uploaded' | 'exists' | null;
  error: ServiceError;
};
type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  storage: {
    upload: (bucket: string, path: string, file: Blob) => Promise<StorageUploadResult>;
    remove: (bucket: string, paths: string[]) => Promise<{ error: ServiceError }>;
  };
};

export type ResumeHandlerDependencies = {
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
  fingerprint?: typeof resumeFingerprint;
  now?: () => number;
  logError?: (message: string, code?: string) => void;
};

function allowedTurnstileHostnames(env: ResumeHandlerDependencies['env']): Set<string> {
  return new Set(
    (env('TURNSTILE_ALLOWED_HOSTNAMES') || 'shpeosu.com,www.shpeosu.com')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

function supabaseSecretKey(env: ResumeHandlerDependencies['env']): string | null {
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

async function boundedFormData(request: Request): Promise<FormData | null> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return null;
  }
}

async function consumeRateLimit(
  admin: AdminClient,
  rateKey: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<'allowed' | 'limited' | 'unavailable'> {
  const { data, error } = await admin.rpc('consume_public_submission_rate_limit', {
    p_rate_key: rateKey,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error) return 'unavailable';
  return data === true ? 'allowed' : 'limited';
}

function reservationData(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : null;
}

export function createResumeHandler(dependencies: ResumeHandlerDependencies) {
  const logError = dependencies.logError
    ?? ((message: string, code?: string) => console.error(message, code ? { code } : undefined));
  const fingerprint = dependencies.fingerprint ?? resumeFingerprint;
  const now = dependencies.now ?? Date.now;

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

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'invalid_submission' }, 413, origin);
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
      logError('[submit-resume] Required server configuration is missing.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    const remoteIp = requestIp(request);
    const admin = dependencies.createAdmin(supabaseUrl, secretKey);
    const edgeRateKey = await dependencies.hmac(
      rateLimitSecret,
      `resume:edge:${remoteIp}`,
    );
    const edgeRate = await consumeRateLimit(admin, edgeRateKey, 100, 600);
    if (edgeRate === 'unavailable') {
      logError('[submit-resume] Edge rate-limit check failed.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (edgeRate === 'limited') {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }

    const form = await boundedFormData(request);
    const submission = form ? await parseResumeFormData(form, now()) : null;
    if (!submission) {
      return jsonResponse({ error: 'invalid_submission' }, 400, origin);
    }

    const challenge = await dependencies.verifyChallenge({
      token: submission.turnstile_token,
      remoteIp,
      secret: turnstileSecret,
      allowedHostnames: allowedTurnstileHostnames(dependencies.env),
      expectedAction: 'resume_submit',
    });
    if (challenge === 'unavailable') {
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (challenge !== 'valid') {
      return jsonResponse({ error: 'verification_failed' }, 403, origin);
    }

    const [networkRateKey, emailRateKey, globalRateKey] = await Promise.all([
      dependencies.hmac(rateLimitSecret, `resume:network:${remoteIp}`),
      dependencies.hmac(rateLimitSecret, `resume:email:${submission.email}`),
      dependencies.hmac(rateLimitSecret, 'resume:global:v1'),
    ]);
    const networkRate = await consumeRateLimit(admin, networkRateKey, 200, 3600);
    if (networkRate === 'unavailable') {
      logError('[submit-resume] Submission rate-limit check failed.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (networkRate === 'limited') {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }
    const emailRate = await consumeRateLimit(admin, emailRateKey, 5, 3600);
    if (emailRate === 'unavailable') {
      logError('[submit-resume] Submission rate-limit check failed.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (emailRate === 'limited') {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }
    const globalRate = await consumeRateLimit(admin, globalRateKey, 500, 86400);
    if (globalRate === 'unavailable') {
      logError('[submit-resume] Submission rate-limit check failed.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (globalRate === 'limited') {
      return jsonResponse({ error: 'rate_limited' }, 429, origin);
    }

    const draftFingerprint = await fingerprint(submission);
    const { data: rawReservation, error: reservationError } = await admin.rpc(
      'reserve_resume_submission',
      {
        p_submission_id: submission.submission_id,
        p_submission_started_at: submission.submission_started_at,
        p_fingerprint: draftFingerprint,
      },
    );
    if (reservationError) {
      logError('[submit-resume] Reservation request failed.', reservationError.code);
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    const reservation = reservationData(rawReservation);
    if (reservation?.status === 'conflict') {
      return jsonResponse({ error: 'idempotency_conflict' }, 409, origin);
    }
    if (reservation?.status === 'accepted') {
      return jsonResponse({ status: 'accepted' }, 200, origin);
    }

    const resumePath = reservation?.resume_path;
    const pathMatch = typeof resumePath === 'string' ? RESERVED_PATH.exec(resumePath) : null;
    if (
      reservation?.status !== 'reserved'
      || !pathMatch
      || Number(pathMatch[1]) !== submission.submission_started_at
    ) {
      logError('[submit-resume] Reservation returned an invalid state.');
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    const upload = await admin.storage.upload('resumes', resumePath, submission.file);
    if (upload.error || (upload.status !== 'uploaded' && upload.status !== 'exists')) {
      logError('[submit-resume] Storage upload failed.', upload.error?.code);
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }

    const { data, error } = await admin.rpc('queue_resume_submission', {
      p_submission_id: submission.submission_id,
      p_fingerprint: draftFingerprint,
      p_full_name: submission.full_name,
      p_email: submission.email,
      p_major: submission.major,
      p_graduation_year: submission.graduation_year,
      p_resume_path: resumePath,
    });
    if (error) {
      // The RPC may have committed before the response was interrupted. Keep
      // the reserved object so an exact retry can safely converge.
      logError('[submit-resume] Queue request failed.', error.code);
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
    if (data === 'conflict') {
      if (upload.status === 'uploaded') {
        const cleanup = await admin.storage.remove('resumes', [resumePath]);
        if (cleanup.error) {
          logError('[submit-resume] Rejected-upload cleanup failed.', cleanup.error.code);
        }
      }
      return jsonResponse({ error: 'idempotency_conflict' }, 409, origin);
    }
    if (data !== 'accepted') {
      if (upload.status === 'uploaded') {
        const cleanup = await admin.storage.remove('resumes', [resumePath]);
        if (cleanup.error) {
          logError('[submit-resume] Rejected-upload cleanup failed.', cleanup.error.code);
        }
      }
      return jsonResponse({ error: 'invalid_submission' }, 400, origin);
    }

    return jsonResponse({ status: 'accepted' }, 200, origin);
  };
}

import type { AdminAuthorization } from './admin-auth.ts';
import { corsHeaders, isAllowedOrigin, jsonResponse } from './request-security.ts';

const BATCH_SIZE = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RpcResult = { data: unknown; error: { code?: string } | null };
type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  storage: { remove: (bucket: string, paths: string[]) => Promise<{ error: unknown }> };
};
type Dependencies = {
  env: (name: string) => string | undefined;
  authorize: (url: string, secretKey: string, token: string) => Promise<AdminAuthorization>;
  createAdmin: (url: string, secretKey: string) => AdminClient;
};
type CleanupClaim = { id: string; resume_path: string; lease_token: string };

function isClaim(value: unknown): value is CleanupClaim {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.id === 'string' && UUID.test(claim.id)
    && typeof claim.lease_token === 'string' && UUID.test(claim.lease_token)
    && typeof claim.resume_path === 'string' && claim.resume_path.length > 0
    && claim.resume_path.length <= 1024 && !claim.resume_path.startsWith('/')
    && !claim.resume_path.split('/').some((part) => part === '..' || part === '.')
    && !/[\u0000-\u001f\u007f]/.test(claim.resume_path);
}

function secretKey(env: Dependencies['env']): string | null {
  const configured = env('SUPABASE_SECRET_KEYS');
  if (configured) {
    try {
      const keys = JSON.parse(configured);
      if (typeof keys.default === 'string' && keys.default) return keys.default;
    } catch { return null; }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') || null;
}

/** Only authenticated admins can process server-selected retired resume files. */
export function createResumeCleanupHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'forbidden' }, 403, null);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') return jsonResponse({ error: 'invalid_submission' }, 405, origin);

    const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') || '');
    if (!bearer || bearer[1].length > 8192) {
      return jsonResponse({ error: 'unauthorized' }, 401, origin);
    }
    const url = dependencies.env('SUPABASE_URL');
    const key = secretKey(dependencies.env);
    if (!url || !key) return jsonResponse({ error: 'service_unavailable' }, 503, origin);

    try {
      const authorization = await dependencies.authorize(url, key, bearer[1]);
      if (authorization !== 'admin') {
        const status = authorization === 'unavailable' ? 503 : authorization === 'forbidden' ? 403 : 401;
        return jsonResponse({ error: authorization === 'unavailable' ? 'service_unavailable' : authorization }, status, origin);
      }

      // Request bodies never select files, paths, bucket names, or batch sizes.
      // The private database queue is the sole source of deletion authority.
      await request.body?.cancel();
      const admin = dependencies.createAdmin(url, key);
      const claimed = await admin.rpc('claim_resume_file_cleanup', { p_limit: BATCH_SIZE });
      if (claimed.error || !Array.isArray(claimed.data)
        || claimed.data.length > BATCH_SIZE || !claimed.data.every(isClaim)) {
        return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      }

      let removed = 0;
      let needsRetry = false;
      for (const claim of claimed.data) {
        let success = false;
        try {
          const result = await admin.storage.remove('resumes', [claim.resume_path]);
          success = !result.error;
        } catch { /* Persist a retry even if the Storage client throws. */ }
        const finished = await admin.rpc('finish_resume_file_cleanup', {
          p_cleanup_id: claim.id,
          p_lease_token: claim.lease_token,
          p_success: success,
        });
        if (success && !finished.error && finished.data === 'completed') removed += 1;
        else needsRetry = true;
      }

      const pending = await admin.rpc('pending_resume_file_cleanup_count', {});
      if (pending.error || typeof pending.data !== 'number'
        || !Number.isSafeInteger(pending.data) || pending.data < 0) {
        return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      }
      return jsonResponse({
        status: needsRetry || pending.data > 0 ? 'pending' : 'complete',
        removed,
        remaining: pending.data,
      }, 200, origin);
    } catch {
      // Claims have leases: interrupted requests can be safely retried later.
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
  };
}

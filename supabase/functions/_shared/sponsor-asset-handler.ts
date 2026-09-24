import type { AdminAuthorization } from './admin-auth.ts';
import { corsHeaders, isAllowedOrigin, jsonResponse } from './request-security.ts';
import { MAX_SPONSOR_ASSET_BYTES, validateSponsorAsset } from './sponsor-asset-validation.ts';

export const MAX_SPONSOR_ASSET_REQUEST_BYTES = MAX_SPONSOR_ASSET_BYTES + 16 * 1024;
const BATCH_SIZE = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ASSET_PATH = /^logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
type RpcResult = { data: unknown; error: unknown };
type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  storage: {
    upload: (bucket: string, path: string, file: Blob) => Promise<{ status: string | null; error: unknown }>;
    remove: (bucket: string, paths: string[]) => Promise<{ error: unknown }>;
  };
};
type Dependencies = {
  env: (name: string) => string | undefined;
  authorize: (url: string, secretKey: string, token: string) => Promise<AdminAuthorization>;
  createAdmin: (url: string, secretKey: string) => AdminClient;
  randomUUID?: () => string;
};
type CleanupClaim = { id: string; path: string; lease_token: string };

function isClaim(value: unknown): value is CleanupClaim {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.id === 'string' && UUID.test(claim.id)
    && typeof claim.lease_token === 'string' && UUID.test(claim.lease_token)
    && typeof claim.path === 'string' && ASSET_PATH.test(claim.path)
    && claim.path.startsWith(`logos/${claim.id}.`);
}

function secretKey(env: Dependencies['env']): string | null {
  const configured = env('SUPABASE_SECRET_KEYS');
  if (configured) {
    try {
      const keys = JSON.parse(configured);
      return typeof keys?.default === 'string' && keys.default ? keys.default : null;
    } catch { return null; }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') || null;
}

async function boundedBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function cleanup(admin: AdminClient, origin: string | null): Promise<Response> {
  const claimed = await admin.rpc('claim_sponsor_asset_cleanup', { p_limit: BATCH_SIZE });
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > BATCH_SIZE
    || !claimed.data.every(isClaim)
    || new Set(claimed.data.map((claim) => claim.id)).size !== claimed.data.length) {
    return jsonResponse({ error: 'service_unavailable' }, 503, origin);
  }
  let removed = 0;
  let pending = false;
  for (const claim of claimed.data) {
    let success = false;
    try {
      success = !(await admin.storage.remove('sponsor-assets', [claim.path])).error;
    } catch { /* A leased, tracked claim remains retryable after transport errors. */ }
    try {
      const finished = await admin.rpc('finish_sponsor_asset_cleanup', {
        p_asset_id: claim.id, p_lease_token: claim.lease_token, p_success: success,
      });
      if (success && !finished.error && finished.data === 'completed') removed += 1;
      else pending = true;
    } catch { pending = true; }
  }
  try {
    // Claimability is not queue emptiness: another worker may hold a lease, or
    // a failed deletion may be waiting for retry backoff.
    const remaining = await admin.rpc('pending_sponsor_asset_cleanup_count', {});
    if (remaining.error || typeof remaining.data !== 'number'
      || !Number.isSafeInteger(remaining.data) || remaining.data < 0 || remaining.data > 0) pending = true;
  } catch { pending = true; }
  return jsonResponse({ status: pending ? 'pending' : 'complete', removed }, 200, origin);
}

/** Admin Auth precedes body reads, image decoding, registry and Storage work. */
export function createSponsorAssetHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'forbidden' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') return jsonResponse({ error: 'invalid_submission' }, 405, origin);
    const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') || '');
    if (!bearer || bearer[1].length > 8192) return jsonResponse({ error: 'unauthorized' }, 401, origin);
    const url = dependencies.env('SUPABASE_URL');
    const key = secretKey(dependencies.env);
    if (!url || !key) return jsonResponse({ error: 'service_unavailable' }, 503, origin);

    try {
      const authorization = await dependencies.authorize(url, key, bearer[1]);
      if (authorization !== 'admin') {
        const status = authorization === 'unavailable' ? 503 : authorization === 'forbidden' ? 403 : 401;
        return jsonResponse({ error: authorization === 'unavailable' ? 'service_unavailable' : authorization }, status, origin);
      }
      const contentType = request.headers.get('content-type') || '';
      const mediaType = contentType.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json' && mediaType !== 'multipart/form-data') {
        return jsonResponse({ error: 'invalid_submission' }, 400, origin);
      }
      const body = await boundedBody(request, mediaType === 'application/json' ? 256 : MAX_SPONSOR_ASSET_REQUEST_BYTES);
      if (!body) return jsonResponse({ error: 'invalid_submission' }, 400, origin);
      if (mediaType === 'application/json') {
        let action: unknown;
        try { action = JSON.parse(new TextDecoder().decode(body)); } catch { /* Invalid JSON is rejected below. */ }
        if (!action || typeof action !== 'object' || Array.isArray(action)
          || Object.keys(action).length !== 1 || (action as Record<string, unknown>).action !== 'cleanup') {
          return jsonResponse({ error: 'invalid_submission' }, 400, origin);
        }
        return await cleanup(dependencies.createAdmin(url, key), origin);
      }
      let form: FormData;
      try { form = await new Response(body, { headers: { 'content-type': contentType } }).formData(); }
      catch { return jsonResponse({ error: 'invalid_submission' }, 400, origin); }
      const entries = [...form.entries()];
      if (entries.length !== 1 || entries[0][0] !== 'file' || !(entries[0][1] instanceof File)) {
        return jsonResponse({ error: 'invalid_submission' }, 400, origin);
      }
      const asset = await validateSponsorAsset(entries[0][1]);
      if (!asset) return jsonResponse({ error: 'invalid_image' }, 400, origin);

      const id = (dependencies.randomUUID ?? (() => crypto.randomUUID()))();
      if (!UUID.test(id)) return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      const path = `logos/${id}.${asset.extension}`;
      const admin = dependencies.createAdmin(url, key);
      const reserved = await admin.rpc('reserve_sponsor_asset', {
        p_asset_id: id, p_extension: asset.extension, p_content_type: asset.contentType, p_size: asset.file.size,
      });
      if (reserved.error || reserved.data !== path) return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      const uploaded = await admin.storage.upload('sponsor-assets', path, asset.file);
      if (uploaded.error || uploaded.status !== 'uploaded') return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      const completed = await admin.rpc('complete_sponsor_asset', { p_asset_id: id });
      if (completed.error || completed.data !== path) return jsonResponse({ error: 'service_unavailable' }, 503, origin);
      return jsonResponse({ status: 'uploaded', path }, 200, origin);
    } catch {
      // Reservations precede uploads. Ambiguous/partial failures retain the
      // registry row for reference-checked cleanup; never delete ad hoc here.
      return jsonResponse({ error: 'service_unavailable' }, 503, origin);
    }
  };
}

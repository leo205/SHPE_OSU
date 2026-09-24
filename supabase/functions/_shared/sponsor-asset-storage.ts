import { createRestAdmin } from './supabase-admin.ts';

/** Isolated raster adapter: private resume uploads retain their PDF contract. */
export function createSponsorAssetAdmin(url: string, secretKey: string, fetchImpl: typeof fetch = fetch) {
  const admin = createRestAdmin(url, secretKey, fetchImpl);
  return {
    rpc: admin.rpc,
    storage: {
      remove: admin.storage.remove,
      async upload(bucket: string, path: string, file: Blob) {
        if (bucket !== 'sponsor-assets' || !/^logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(path)
          || file.type !== 'image/png' || file.size < 1 || file.size > 2 * 1024 * 1024) {
          return { status: null, error: { code: 'invalid_asset' } };
        }
        try {
          const headers: Record<string, string> = {
            apikey: secretKey,
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'x-upsert': 'false',
          };
          if (secretKey.startsWith('eyJ')) headers.Authorization = `Bearer ${secretKey}`;
          const response = await fetchImpl(`${url}/storage/v1/object/sponsor-assets/${path}`, {
            method: 'POST', headers, body: file, signal: AbortSignal.timeout(10_000),
          });
          // Even a duplicate is not proof this request uploaded its bytes.
          // Leave the reservation tracked until a cleanup worker can retry.
          if (response.ok) return { status: 'uploaded' as const, error: null };
          return { status: null, error: { code: `http_${response.status}` } };
        } catch {
          return { status: null, error: { code: 'storage_unavailable' } };
        }
      },
    },
  };
}

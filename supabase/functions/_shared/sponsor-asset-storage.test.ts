import { describe, expect, it, vi } from 'vitest';
import { createSponsorAssetAdmin } from './sponsor-asset-storage.ts';

const path = 'logos/f16746e6-9719-42cf-88f3-200000000001.png';
describe('isolated immutable sponsor raster storage', () => {
  it.each(['sb_secret_server-only', 'eyJlegacy-jwt'])('sends the normalized MIME and immutable upload headers with %s', async (secret) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const file = new Blob(['png'], { type: 'image/png' });
    const result = await createSponsorAssetAdmin('https://project.supabase.co', secret, fetcher).storage.upload('sponsor-assets', path, file);
    expect(result).toEqual({ status: 'uploaded', error: null });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`https://project.supabase.co/storage/v1/object/sponsor-assets/${path}`);
    expect(options.headers).toMatchObject({ apikey: secret, 'Content-Type': 'image/png', 'x-upsert': 'false' });
    expect(options.headers.Authorization).toBe(secret.startsWith('eyJ') ? `Bearer ${secret}` : undefined);
    expect(options.body).toBe(file);
  });
  it('never treats duplicate objects or interrupted uploads as confirmed uploads', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 409 })).mockRejectedValueOnce(new Error('timeout'));
    const admin = createSponsorAssetAdmin('https://project.supabase.co', 'secret', fetcher);
    const file = new Blob(['png'], { type: 'image/png' });
    expect((await admin.storage.upload('sponsor-assets', path, file)).error).toBeTruthy();
    expect((await admin.storage.upload('sponsor-assets', path, file)).error).toBeTruthy();
  });
  it('refuses other buckets, traversal, PDF MIME and oversized blobs', async () => {
    const fetcher = vi.fn(); const admin = createSponsorAssetAdmin('https://project.supabase.co', 'secret', fetcher);
    for (const [bucket, destination, blob] of [
      ['resumes', path, new Blob(['png'], { type: 'image/png' })],
      ['sponsor-assets', '../active.png', new Blob(['png'], { type: 'image/png' })],
      ['sponsor-assets', path, new Blob(['pdf'], { type: 'application/pdf' })],
      ['sponsor-assets', path, new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' })],
    ] as const) expect((await admin.storage.upload(bucket, destination, blob)).error).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

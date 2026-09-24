import { describe, expect, it, vi } from 'vitest';
import { cleanupSponsorAssets, loadSponsors, saveSponsor, sponsorLogoUrl, uploadSponsorLogo } from './sponsors';
import { EMPTY_SPONSOR } from './sponsorValidation';

const id = '11111111-1111-4111-8111-111111111111';
const row = { ...EMPTY_SPONSOR, id, name: 'Example', status: 'published', version: 1 };

function mockClient(responses) {
  const query = {};
  for (const method of ['select', 'order', 'range', 'eq', 'abortSignal', 'insert', 'update', 'maybeSingle']) {
    query[method] = vi.fn(() => query);
  }
  let calls = 0;
  query.then = (resolve, reject) => Promise.resolve(responses[calls++]).then(resolve, reject);
  return { from: vi.fn(() => query), query };
}

describe('sponsor directory loading', () => {
  it('keeps an empty successful directory empty', async () => {
    const client = mockClient([{ data: [], count: 0, error: null }]);
    expect(await loadSponsors(client)).toEqual({ status: 'ready', data: [] });
    expect(client.query.eq).toHaveBeenCalledWith('status', 'published');
  });
  it('loads every counted page and applies tier order', async () => {
    const platinum = { ...row, id: '22222222-2222-4222-8222-222222222222', tier_key: 'platinum' };
    const client = mockClient([{ data: [row], count: 2 }, { data: [platinum], count: 2 }]);
    expect((await loadSponsors(client, { admin: true })).data).toEqual([platinum, row]);
    expect(client.query.range).toHaveBeenNthCalledWith(2, 1, 1000);
    expect(client.query.eq).not.toHaveBeenCalled();
  });
  it.each([
    [{ data: [], count: 0, error: { code: 'offline' } }],
    [{ data: [row], count: 2 }, { data: [], count: 2 }],
    [{ data: [row], count: 2 }, { data: [row], count: 2 }],
    [{ data: [row], count: 2 }, { data: [], count: 1 }],
    [{ data: [{ ...row, status: 'draft' }], count: 1 }],
    [{ data: [], count: null }],
  ])('does not disguise failures/partial/draft data as the public roster', async (...responses) => {
    expect((await loadSponsors(mockClient(responses))).status).toBe('error');
  });
  it('cancels before contacting the server', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = mockClient([]);
    expect(await loadSponsors(client, { signal: controller.signal })).toEqual({ status: 'cancelled' });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('sponsor saving', () => {
  it('inserts only normalized editable fields', async () => {
    const client = mockClient([{ data: row, error: null }]);
    expect(await saveSponsor(client, row, { creationId: id })).toEqual({ ok: true, data: row });
    expect(client.query.insert.mock.calls[0][0]).not.toHaveProperty('version');
    expect(client.query.insert.mock.calls[0][0]).toHaveProperty('id', id);
  });
  it('includes the expected version when editing and confirms a returned record', async () => {
    const client = mockClient([{ data: { ...row, version: 2 }, error: null }]);
    expect((await saveSponsor(client, row, { id, version: 1 })).ok).toBe(true);
    expect(client.query.eq).toHaveBeenCalledWith('version', 1);
    expect(client.query.eq).toHaveBeenCalledWith('id', id);
  });
  it('treats zero-row optimistic updates as conflicts, not success', async () => {
    const client = mockClient([{ data: null, error: null }]);
    expect(await saveSponsor(client, row, { id, version: 1 })).toMatchObject({ ok: false, conflict: true });
  });
  it('does not save invalid data or a missing revision', async () => {
    const client = mockClient([]);
    expect((await saveSponsor(client, { ...row, name: '' })).ok).toBe(false);
    expect((await saveSponsor(client, row, { id })).ok).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });
  it('reports denied writes without leaking arbitrary database messages', async () => {
    const client = mockClient([{ data: null, error: { code: '42501', message: 'private internals' } }]);
    expect((await saveSponsor(client, row, { creationId: id })).error).toContain('admin account');
  });
  it('does not retry ambiguous saves', async () => {
    const client = mockClient([{ data: null, error: { code: 'network' } }]);
    expect((await saveSponsor(client, row, { creationId: id })).error).toContain('Refresh the listings');
    expect(client.from).toHaveBeenCalledTimes(1);
  });
  it('converges on the same creation ID after an INSERT response is lost', async () => {
    const stored = { ...row, website_url: null, academic_year: null };
    const client = mockClient([{ data: null, error: { code: '23505' } }, { data: stored, error: null }]);
    expect(await saveSponsor(client, row, { creationId: id })).toEqual({ ok: true, data: stored });
    expect(client.query.insert).toHaveBeenCalledTimes(1);
    expect(client.query.eq).toHaveBeenCalledWith('id', id);
  });
  it('returns the existing row for comparison when an ambiguous draft retry was edited', async () => {
    const stored = { ...row, website_url: null, academic_year: null, name: 'Saved company' };
    const client = mockClient([{ data: null, error: { code: '23505' } }, { data: stored, error: null }]);
    expect(await saveSponsor(client, row, { creationId: id })).toMatchObject({ ok: false, conflict: true, existing: stored });
  });
});

describe('managed logo operations', () => {
  const path = `logos/${id}.png`;
  it('invokes the protected admin endpoint, not Storage upload', async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: { status: 'uploaded', path }, error: null }) } };
    const file = new Blob(['fake fixture, backend validation is separate'], { type: 'image/png' });
    expect(await uploadSponsorLogo(client, file)).toEqual({ ok: true, path });
    expect(client.functions.invoke).toHaveBeenCalledWith('manage-sponsor-assets', { body: expect.any(FormData), timeout: 30_000 });
  });
  it('never accepts a returned external asset URL', async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: { status: 'uploaded', path: 'https://evil.test/logo.png' } }) } };
    expect((await uploadSponsorLogo(client, new Blob(['a'], { type: 'image/png' }))).ok).toBe(false);
  });
  it('derives managed URLs from the fixed bucket and preserves migrated assets', () => {
    const bucket = { getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://project.supabase.co/logo' } })) };
    const client = { storage: { from: vi.fn(() => bucket) } };
    expect(sponsorLogoUrl(client, null)).toBeNull();
    expect(sponsorLogoUrl(client, '/photos/sponsors/honda.webp')).toBe('/photos/sponsors/honda.webp');
    expect(sponsorLogoUrl(client, path)).toBe('https://project.supabase.co/logo');
    expect(client.storage.from).toHaveBeenCalledWith('sponsor-assets');
  });
  it('cleanup never sends client-chosen object paths', async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: { status: 'pending', removed: 2 }, error: null }) } };
    expect(await cleanupSponsorAssets(client)).toEqual({ ok: true, pending: true, removed: 2 });
    expect(client.functions.invoke).toHaveBeenCalledWith('manage-sponsor-assets', { body: { action: 'cleanup' }, timeout: 30_000 });
  });
});

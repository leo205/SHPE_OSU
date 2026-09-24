import { describe, expect, it, vi } from 'vitest';
import { createSponsorAssetHandler, MAX_SPONSOR_ASSET_REQUEST_BYTES } from './sponsor-asset-handler.ts';
import { sponsorImageFile } from './sponsor-asset-test-fixtures.ts';

const id = 'f16746e6-9719-42cf-88f3-200000000001';
const path = `logos/${id}.png`;
const claim = { id, path, lease_token: 'f16746e6-9719-42cf-88f3-200000000002' };
const url = 'https://project.supabase.co/functions/v1/manage-sponsor-assets';
function setup() {
  const authorize = vi.fn().mockResolvedValue('admin');
  const rpc = vi.fn(async (name) => ({
    data: name === 'claim_sponsor_asset_cleanup' ? [claim]
      : name === 'finish_sponsor_asset_cleanup' ? 'completed'
        : name === 'pending_sponsor_asset_cleanup_count' ? 0 : path,
    error: null,
  }));
  const upload = vi.fn().mockResolvedValue({ status: 'uploaded', error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createAdmin = vi.fn(() => ({ rpc, storage: { upload, remove } }));
  const handler = createSponsorAssetHandler({
    env: (name) => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-key' })[name],
    authorize, createAdmin, randomUUID: () => id,
  });
  return { handler, authorize, rpc, upload, remove, createAdmin };
}
function uploadRequest(form?: FormData, headers: Record<string, string> = {}) {
  if (!form) { form = new FormData(); form.append('file', sponsorImageFile('jpeg')); }
  return new Request(url, {
    method: 'POST', body: form,
    headers: { Origin: 'https://shpeosu.com', Authorization: 'Bearer user-jwt', ...headers },
  });
}
function cleanupRequest(body: unknown = { action: 'cleanup' }) {
  return new Request(url, { method: 'POST', body: JSON.stringify(body), headers: {
    'Content-Type': 'application/json', Origin: 'https://shpeosu.com', Authorization: 'Bearer user-jwt',
  } });
}

describe('admin-only sponsor asset endpoint', () => {
  it.each(['unauthorized', 'forbidden', 'unavailable'])('denies %s before reading a body or accessing the service client', async (state) => {
    const s = setup(); s.authorize.mockResolvedValue(state);
    const request = uploadRequest();
    const getReader = vi.spyOn(request.body!, 'getReader');
    expect((await s.handler(request)).status).toBe(state === 'unavailable' ? 503 : state === 'forbidden' ? 403 : 401);
    expect(getReader).not.toHaveBeenCalled(); expect(s.createAdmin).not.toHaveBeenCalled();
  });

  it('requires bearer auth and exact CORS origins', async () => {
    const s = setup();
    expect((await s.handler(uploadRequest(undefined, { Authorization: '' }))).status).toBe(401);
    expect((await s.handler(uploadRequest(undefined, { Origin: 'https://shpeosu.com.evil.test' }))).status).toBe(403);
    expect(s.authorize).not.toHaveBeenCalled(); expect(s.createAdmin).not.toHaveBeenCalled();
    const preflight = await s.handler(new Request(url, { method: 'OPTIONS', headers: { Origin: 'https://shpeosu.com' } }));
    expect(preflight.status).toBe(204); expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://shpeosu.com');
  });

  it('validates and registers normalized bytes before immutable upload and completion', async () => {
    const s = setup(); const response = await s.handler(uploadRequest());
    expect(await response.json()).toEqual({ status: 'uploaded', path });
    expect(s.authorize).toHaveBeenCalledExactlyOnceWith('https://project.supabase.co', 'server-key', 'user-jwt');
    const stored = s.upload.mock.calls[0][2];
    expect(stored.type).toBe('image/png');
    expect(s.rpc).toHaveBeenNthCalledWith(1, 'reserve_sponsor_asset', {
      p_asset_id: id, p_extension: 'png', p_content_type: 'image/png', p_size: stored.size,
    });
    expect(s.upload).toHaveBeenCalledExactlyOnceWith('sponsor-assets', path, stored);
    expect(s.rpc).toHaveBeenNthCalledWith(2, 'complete_sponsor_asset', { p_asset_id: id });
    expect(s.rpc.mock.invocationCallOrder[0]).toBeLessThan(s.upload.mock.invocationCallOrder[0]);
    expect(s.upload.mock.invocationCallOrder[0]).toBeLessThan(s.rpc.mock.invocationCallOrder[1]);
    expect(s.remove).not.toHaveBeenCalled();
  });

  it.each(['duplicate-file', 'extra-field', 'client-path', 'text-file'])('rejects ambiguous multipart: %s', async (kind) => {
    const s = setup(); const form = new FormData();
    form.append('file', kind === 'text-file' ? 'not a file' : sponsorImageFile());
    if (kind === 'duplicate-file') form.append('file', sponsorImageFile());
    if (kind === 'extra-field') form.append('action', 'upload');
    if (kind === 'client-path') form.append('path', 'logos/chosen.png');
    expect((await s.handler(uploadRequest(form))).status).toBe(400);
    expect(s.createAdmin).not.toHaveBeenCalled();
  });

  it('rejects oversized declared bodies before buffering and actual streams despite a lying length', async () => {
    const s = setup();
    expect((await s.handler(uploadRequest(undefined, { 'Content-Length': String(MAX_SPONSOR_ASSET_REQUEST_BYTES + 1) }))).status).toBe(400);
    const canceled = vi.fn();
    const request = new Request(url, {
      method: 'POST', duplex: 'half', headers: {
        Authorization: 'Bearer user-jwt', 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '1',
      },
      body: new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(MAX_SPONSOR_ASSET_REQUEST_BYTES + 1)); },
        cancel: canceled,
      }),
    });
    expect((await s.handler(request)).status).toBe(400);
    expect(canceled).toHaveBeenCalledOnce(); expect(s.createAdmin).not.toHaveBeenCalled();
  });

  it('fails closed if reservation returns an error or a different path', async () => {
    for (const result of [{ data: null, error: { code: 'error' } }, { data: 'logos/other.png', error: null }]) {
      const s = setup(); s.rpc.mockResolvedValue(result);
      expect((await s.handler(uploadRequest())).status).toBe(503);
      expect(s.upload).not.toHaveBeenCalled(); expect(s.remove).not.toHaveBeenCalled();
    }
  });

  it.each(['error', 'duplicate', 'throw'])('keeps upload %s tracked without completion or opportunistic deletion', async (failure) => {
    const s = setup();
    if (failure === 'throw') s.upload.mockRejectedValue(new Error('timeout'));
    else s.upload.mockResolvedValue(failure === 'duplicate' ? { status: 'exists', error: null } : { status: null, error: {} });
    expect((await s.handler(uploadRequest())).status).toBe(503);
    expect(s.rpc).toHaveBeenCalledOnce(); expect(s.rpc.mock.calls[0][0]).toBe('reserve_sponsor_asset');
    expect(s.remove).not.toHaveBeenCalled();
  });

  it('leaves a successful upload tracked when completion acknowledgment is lost', async () => {
    const s = setup(); s.rpc.mockResolvedValueOnce({ data: path, error: null }).mockRejectedValueOnce(new Error('timeout'));
    expect((await s.handler(uploadRequest())).status).toBe(503);
    expect(s.upload).toHaveBeenCalledOnce(); expect(s.remove).not.toHaveBeenCalled();
  });
});

describe('server-selected leased sponsor cleanup', () => {
  it.each([
    { action: 'cleanup', path }, { action: 'cleanup', bucket: 'resumes' },
    { action: 'cleanup', limit: 500 }, { action: 'upload' }, [], null,
  ])('rejects any caller-selected cleanup parameters: %j', async (body) => {
    const s = setup(); expect((await s.handler(cleanupRequest(body))).status).toBe(400);
    expect(s.createAdmin).not.toHaveBeenCalled();
  });

  it('deletes only database-claimed paths and acknowledges the exact lease', async () => {
    const s = setup(); expect(await (await s.handler(cleanupRequest())).json()).toEqual({ status: 'complete', removed: 1 });
    expect(s.rpc).toHaveBeenNthCalledWith(1, 'claim_sponsor_asset_cleanup', { p_limit: 5 });
    expect(s.remove).toHaveBeenCalledExactlyOnceWith('sponsor-assets', [path]);
    expect(s.rpc).toHaveBeenNthCalledWith(2, 'finish_sponsor_asset_cleanup', {
      p_asset_id: id, p_lease_token: claim.lease_token, p_success: true,
    });
    expect(s.upload).not.toHaveBeenCalled();
  });

  it.each(['error', 'throw'])('persists Storage %s for retry', async (failure) => {
    const s = setup();
    if (failure === 'throw') s.remove.mockRejectedValue(new Error('timeout'));
    else s.remove.mockResolvedValue({ error: {} });
    expect(await (await s.handler(cleanupRequest())).json()).toEqual({ status: 'pending', removed: 0 });
    expect(s.rpc).toHaveBeenCalledWith('finish_sponsor_asset_cleanup', expect.objectContaining({ p_success: false }));
  });

  it('does not claim completion after lost cleanup acknowledgment', async () => {
    const s = setup(); s.rpc.mockResolvedValueOnce({ data: [claim], error: null }).mockRejectedValueOnce(new Error('timeout'));
    expect(await (await s.handler(cleanupRequest())).json()).toEqual({ status: 'pending', removed: 0 });
  });

  it.each([1, 5])('reports %s leased/backoff entries as pending even when no files can be claimed', async (count) => {
    const s = setup();
    s.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: count, error: null });
    expect(await (await s.handler(cleanupRequest())).json()).toEqual({ status: 'pending', removed: 0 });
    expect(s.rpc).toHaveBeenCalledWith('pending_sponsor_asset_cleanup_count', {});
    expect(s.remove).not.toHaveBeenCalled();
  });

  it.each([null, -1, '0', 1.5])('reports uncertainty rather than completion for invalid remaining count %j', async (count) => {
    const s = setup();
    s.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: count, error: null });
    expect(await (await s.handler(cleanupRequest())).json()).toEqual({ status: 'pending', removed: 0 });
  });

  it.each(['../active.png', 'submissions/resume.pdf', 'logos/../resume.pdf', `logos/${claim.lease_token}.png`])('rejects malformed or mismatched server claims: %s', async (invalidPath) => {
    const s = setup(); s.rpc.mockResolvedValue({ data: [{ ...claim, path: invalidPath }], error: null });
    expect((await s.handler(cleanupRequest())).status).toBe(503); expect(s.remove).not.toHaveBeenCalled();
  });

  it('rejects duplicate claims and avoids Storage for an empty claim set', async () => {
    const s = setup(); s.rpc.mockResolvedValueOnce({ data: [claim, claim], error: null });
    expect((await s.handler(cleanupRequest())).status).toBe(503); expect(s.remove).not.toHaveBeenCalled();
    s.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await (await s.handler(cleanupRequest())).json()).toEqual({ status: 'complete', removed: 0 });
  });
});

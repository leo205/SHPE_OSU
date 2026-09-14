import { describe, expect, it, vi } from 'vitest';
import { createResumeCleanupHandler } from './resume-cleanup-handler.ts';

const claim = { id: 'f16746e6-9719-42cf-88f3-200000000001', resume_path: 'submissions/retired.pdf', lease_token: 'f16746e6-9719-42cf-88f3-200000000002' };
function setup() {
  const authorize = vi.fn().mockResolvedValue('admin');
  const rpc = vi.fn(async (name) => ({
    data: name === 'claim_resume_file_cleanup' ? [claim] : name === 'finish_resume_file_cleanup' ? 'completed' : 0,
    error: null,
  }));
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createAdmin = vi.fn(() => ({ rpc, storage: { remove } }));
  const handler = createResumeCleanupHandler({
    env: (name) => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-key' })[name],
    authorize, createAdmin,
  });
  return { handler, authorize, rpc, remove, createAdmin };
}
function request(headers: Record<string, string> = {}, body = '{}') {
  return new Request('https://project.supabase.co/functions/v1/cleanup-resume-files', {
    method: 'POST', body,
    headers: { Origin: 'https://shpeosu.com', Authorization: 'Bearer user-jwt', ...headers },
  });
}
describe('admin-only retired resume cleanup', () => {
  it.each(['unauthorized', 'forbidden', 'unavailable'])('cannot claim or delete when Auth is %s', async (state) => {
    const s = setup(); s.authorize.mockResolvedValue(state);
    expect((await s.handler(request())).status).toBe(state === 'unavailable' ? 503 : state === 'forbidden' ? 403 : 401);
    expect(s.createAdmin).not.toHaveBeenCalled(); expect(s.remove).not.toHaveBeenCalled();
  });
  it('rejects a missing bearer before contacting Auth', async () => {
    const s = setup(); expect((await s.handler(request({ Authorization: '' }))).status).toBe(401);
    expect(s.authorize).not.toHaveBeenCalled();
  });
  it('rejects foreign origins before authorizing', async () => {
    const s = setup(); expect((await s.handler(request({ Origin: 'https://untrusted.example' }))).status).toBe(403);
    expect(s.authorize).not.toHaveBeenCalled();
  });
  it('only deletes paths from the private queue, ignoring caller supplied paths', async () => {
    const s = setup();
    const result = await s.handler(request({}, JSON.stringify({ paths: ['active.pdf'], bucket: 'events', limit: 1000 })));
    expect(await result.json()).toEqual({ status: 'complete', removed: 1, remaining: 0 });
    expect(s.rpc).toHaveBeenCalledWith('claim_resume_file_cleanup', { p_limit: 5 });
    expect(s.remove).toHaveBeenCalledExactlyOnceWith('resumes', [claim.resume_path]);
    expect(s.rpc).toHaveBeenCalledWith('finish_resume_file_cleanup', { p_cleanup_id: claim.id, p_lease_token: claim.lease_token, p_success: true });
  });
  it('persists a failed Storage attempt for retry without reporting completion', async () => {
    const s = setup(); s.remove.mockResolvedValue({ error: { code: 'unavailable' } });
    s.rpc.mockImplementation(async (name) => ({ data: name === 'claim_resume_file_cleanup' ? [claim] : name === 'finish_resume_file_cleanup' ? 'retry_scheduled' : 1, error: null }));
    expect(await (await s.handler(request())).json()).toEqual({ status: 'pending', removed: 0, remaining: 1 });
    expect(s.rpc).toHaveBeenCalledWith('finish_resume_file_cleanup', expect.objectContaining({ p_success: false }));
  });
  it('keeps an interrupted acknowledgement retryable', async () => {
    const s = setup();
    s.rpc.mockImplementation(async (name) => name === 'finish_resume_file_cleanup'
      ? { data: null, error: { code: 'unavailable' } }
      : { data: name === 'claim_resume_file_cleanup' ? [claim] : 1, error: null });
    expect((await (await s.handler(request())).json()).status).toBe('pending');
  });
  it('refuses malformed claims without touching Storage', async () => {
    const s = setup(); s.rpc.mockResolvedValue({ data: [{ ...claim, resume_path: '../active.pdf' }], error: null });
    expect((await s.handler(request())).status).toBe(503); expect(s.remove).not.toHaveBeenCalled();
  });
  it('does not call Storage for an empty queue', async () => {
    const s = setup(); s.rpc.mockImplementation(async (name) => ({ data: name === 'claim_resume_file_cleanup' ? [] : 0, error: null }));
    expect((await (await s.handler(request())).json()).status).toBe('complete'); expect(s.remove).not.toHaveBeenCalled();
  });
});

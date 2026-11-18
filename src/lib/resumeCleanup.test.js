import { describe, expect, it, vi } from 'vitest';
import { cleanupRetiredResumeFiles } from './resumeCleanup';

describe('admin resume cleanup feedback', () => {
  it.each(['pending', 'complete'])('reports server cleanup status %s', async (status) => {
    const invoke = vi.fn().mockResolvedValue({ data: { status }, error: null });
    expect(await cleanupRetiredResumeFiles({ functions: { invoke } })).toEqual({ status, pending: status === 'pending' });
    expect(invoke).toHaveBeenCalledWith('cleanup-resume-files', { body: {}, timeout: 65_000 });
  });
  it('does not invent pending files when a check fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('network'));
    expect(await cleanupRetiredResumeFiles({ functions: { invoke } })).toEqual({ status: 'unavailable', pending: false });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it.each([
    { data: null, error: { message: 'unavailable' } },
    { data: { status: 'complete' }, error: { message: 'unavailable' } },
    { data: { status: 'unknown' }, error: null },
    { data: { status: 'complete', remaining: 1 }, error: null },
    { data: { status: 'pending', remaining: -1 }, error: null },
  ])('keeps malformed/failed responses distinct from confirmed work (%j)', async (response) => {
    const invoke = vi.fn().mockResolvedValue(response);
    expect(await cleanupRetiredResumeFiles({ functions: { invoke } })).toEqual({ status: 'unavailable', pending: false });
  });
  it('accepts the live handler’s complete and pending count payloads', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ data: { status: 'complete', remaining: 0, removed: 0 }, error: null })
      .mockResolvedValueOnce({ data: { status: 'pending', remaining: 2, removed: 3 }, error: null });
    const client = { functions: { invoke } };
    expect(await cleanupRetiredResumeFiles(client)).toEqual({ status: 'complete', pending: false });
    expect(await cleanupRetiredResumeFiles(client)).toEqual({ status: 'pending', pending: true });
  });
});

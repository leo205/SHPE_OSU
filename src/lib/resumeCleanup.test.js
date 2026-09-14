import { describe, expect, it, vi } from 'vitest';
import { cleanupRetiredResumeFiles } from './resumeCleanup';

describe('admin resume cleanup feedback', () => {
  it.each(['pending', 'complete'])('reports server cleanup status %s', async (status) => {
    const invoke = vi.fn().mockResolvedValue({ data: { status }, error: null });
    expect(await cleanupRetiredResumeFiles({ functions: { invoke } })).toEqual({ pending: status === 'pending' });
    expect(invoke).toHaveBeenCalledWith('cleanup-resume-files', { body: {}, timeout: 65_000 });
  });
  it('keeps retry feedback when the server cannot confirm completion', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('network'));
    expect(await cleanupRetiredResumeFiles({ functions: { invoke } })).toEqual({ pending: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

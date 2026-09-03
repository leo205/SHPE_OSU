import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('submit-sponsor-inquiry Edge entry point', () => {
  it('loads and registers one Deno handler', async () => {
    const serve = vi.fn();
    vi.stubGlobal('Deno', {
      env: { get: vi.fn(() => undefined) },
      serve,
    });

    await import('./index.ts');

    expect(serve).toHaveBeenCalledTimes(1);
    expect(serve).toHaveBeenCalledWith(expect.any(Function));
  });
});

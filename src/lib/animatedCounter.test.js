import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeAnimatedCount } from './animatedCounter.js';

describe('animated counter lifecycle', () => {
  let observers;

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    vi.stubGlobal('window', { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for visibility, starts once, and stops at the target', () => {
    const onCount = vi.fn();
    const element = {};
    const cleanup = observeAnimatedCount(element, { target: 100, duration: 1600, onCount });
    expect(observers[0].observe).toHaveBeenCalledWith(element);
    observers[0].callback([{ isIntersecting: false }]);
    expect(vi.getTimerCount()).toBe(0);

    observers[0].callback([{ isIntersecting: true }]);
    observers[0].callback([{ isIntersecting: true }]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1600);
    expect(onCount).toHaveBeenLastCalledWith(100);
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
  });

  it('stops timer updates and queued observer callbacks after unmount', () => {
    const onCount = vi.fn();
    const cleanup = observeAnimatedCount({}, { target: 100, duration: 1600, onCount });
    observers[0].callback([{ isIntersecting: true }]);
    vi.advanceTimersByTime(32);
    expect(onCount).toHaveBeenLastCalledWith(2);

    cleanup();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    onCount.mockClear();
    observers[0].callback([{ isIntersecting: true }]);
    vi.advanceTimersByTime(2000);
    expect(onCount).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])(
    'restarts after a StrictMode setup/cleanup/setup replay (started: %s)', (started) => {
      const onCount = vi.fn();
      const options = { target: 100, duration: 1600, onCount };
      const firstCleanup = observeAnimatedCount({}, options);
      if (started) {
        observers[0].callback([{ isIntersecting: true }]);
        vi.advanceTimersByTime(32);
      }
      firstCleanup();

      const secondCleanup = observeAnimatedCount({}, options);
      // A queued callback belonging to the removed setup cannot start work.
      observers[0].callback([{ isIntersecting: true }]);
      expect(vi.getTimerCount()).toBe(0);
      observers[1].callback([{ isIntersecting: true }]);
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(1600);
      expect(onCount).toHaveBeenLastCalledWith(100);
      expect(vi.getTimerCount()).toBe(0);
      secondCleanup();
    },
  );

  it('honors reduced motion without creating an observer or timer', () => {
    window.matchMedia.mockReturnValue({ matches: true });
    const onCount = vi.fn();
    observeAnimatedCount({}, { target: 100, duration: 1600, onCount });
    expect(onCount).toHaveBeenCalledExactlyOnceWith(100);
    expect(observers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

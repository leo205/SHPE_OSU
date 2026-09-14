/** Start one visible counter animation; the caller owns the returned cleanup. */
export function observeAnimatedCount(element, { target, duration, onCount }) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onCount(target);
    return undefined;
  }

  // Keep lifecycle state inside this setup. React StrictMode replays effects,
  // so the replacement setup must be able to start after its predecessor stops.
  let started = false;
  let cancelled = false;
  let timer = null;
  onCount(0);

  const observer = new IntersectionObserver(([entry]) => {
    if (cancelled || started || !entry.isIntersecting) return;
    started = true;
    let count = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    timer = setInterval(() => {
      count = Math.min(target, count + step);
      onCount(count);
      if (count >= target) {
        clearInterval(timer);
        timer = null;
      }
    }, 16);
  }, { threshold: 0.5 });

  if (element) observer.observe(element);
  return () => {
    cancelled = true;
    observer.disconnect();
    if (timer !== null) clearInterval(timer);
  };
}

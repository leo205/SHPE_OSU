import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Sends every route change to the top of the page, instantly.
 *
 * Two things made this visibly wrong before:
 *
 * 1. `index.css` sets `html { scroll-behavior: smooth }`, which is what makes
 *    the in-page anchor links (#become-a-sponsor, #spotlight-heading) glide
 *    nicely. But it also applied to `window.scrollTo(0, 0)` — so navigating
 *    from the bottom of one page ANIMATED all the way up and you watched the
 *    new page scroll past you.
 *
 * 2. `useEffect` runs *after* the browser paints, giving one frame of the new
 *    page rendered at the old scroll offset — the "loads at the bottom" flash.
 *    `useLayoutEffect` runs before paint, so the page is never shown scrolled.
 *
 * The fix for (1) is deliberately NOT `scrollTo({ behavior: 'instant' })`.
 * `ScrollBehavior` is a WebIDL enum, and an invalid member throws a TypeError
 * rather than being ignored — `'instant'` only shipped in Chrome/Firefox 97 and
 * Safari 15.4 (early 2022), while this build targets Vite's default floor of
 * chrome87 / firefox78 / safari14. On anything older the call would throw
 * during the commit phase, and with no error boundary in the tree React would
 * unmount the entire root: a blank white page on every route. That is an
 * unacceptable risk for a site handed out by QR code to students on whatever
 * device they happen to own.
 *
 * Suppressing the CSS property around the jump achieves the same thing with no
 * enum involved, so it behaves identically on every browser.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;

    html.style.scrollBehavior = 'auto'; // opt this one jump out of the smooth rule
    window.scrollTo(0, 0);
    html.style.scrollBehavior = previous;
  }, [pathname]);

  return null;
}

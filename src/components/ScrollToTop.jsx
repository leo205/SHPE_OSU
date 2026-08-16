import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Every route change starts at the top of the page.
 *
 * In a single-page app the document never actually reloads, so the scroll
 * position simply carries over from the previous page — click a nav tab from the
 * bottom of a long page and the new one renders already scrolled down. That is
 * what this corrects.
 *
 * Two details make it behave like a real page load rather than a visible jump:
 *
 *  - `useLayoutEffect`, not `useEffect`. Layout effects run before the browser
 *    paints, so the page is never shown at the old offset. With `useEffect` you
 *    get one frame of the new page scrolled down before the correction lands —
 *    the "starts at the bottom" flash.
 *
 *  - No `scroll-behavior: smooth` in the stylesheet any more (see index.css).
 *    While that rule was global it applied here too, so this scroll ANIMATED
 *    from the old position to the top and you watched the whole page slide by.
 *    Suppressing it from JS around the call was unreliable, because setting and
 *    reverting an inline style in one synchronous block may never trigger a
 *    style recalculation. Removing the rule is what actually fixed it; in-page
 *    anchors now opt into smooth via lib/scroll.js instead.
 *
 * Deliberately NOT using `scrollTo({ behavior: 'instant' })`: ScrollBehavior is
 * a WebIDL enum, an unrecognised member throws a TypeError rather than being
 * ignored, and 'instant' only shipped in Safari 15.4 / Chrome 97. This build
 * targets Vite's default floor (safari14), and with no error boundary in the
 * tree a throw here would unmount the entire app — a blank page on every route.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

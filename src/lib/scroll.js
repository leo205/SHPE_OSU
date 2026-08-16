/**
 * Smooth-scrolls to an element on the current page.
 *
 * This exists because the global `html { scroll-behavior: smooth }` had to go —
 * it also applied to the scroll-to-top on every route change, which made
 * navigation animate up from wherever you had been reading. Smooth scrolling is
 * genuinely nice for in-page jumps though, so those opt in here instead of the
 * whole site opting in and route changes having to fight their way out.
 *
 * Note `behavior: 'smooth'` is safe on every browser this project targets.
 * It is `'instant'` that only arrived in 2022 — and because ScrollBehavior is a
 * WebIDL enum, an unrecognised member throws a TypeError rather than being
 * ignored, which would take the whole React root down. Never pass 'instant'.
 */
export function scrollToAnchor(event, elementId) {
  const target = document.getElementById(elementId);
  if (!target) return; // let the browser's native jump handle it

  event.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

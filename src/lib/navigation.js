/**
 * The site's primary navigation, in display order.
 *
 * Single source for the Navbar and the Footer. They used to keep separate
 * hand-written copies, and they drifted: the footer was missing Home and
 * Prof. Dev., so two pages were unreachable from the bottom of every page.
 *
 * Add a route here and it appears in both places. If a link should show in only
 * one of them, add a flag rather than forking the list again.
 */
export const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/events', label: 'Events' },
  { to: '/eboard', label: 'E-Board' },
  { to: '/sponsors', label: 'Sponsors' },
  { to: '/resources', label: 'Resources' },
  { to: '/professional-development', label: 'Prof. Dev.' },
];

// Reuse Intl's formatting rules instead of rebuilding them for every table row.
// Keep the existing locale, options, and browser-local timezone unchanged.
const adminDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});

export function formatAdminDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  // Intl.format throws for invalid dates; the old Date method returned text.
  return Number.isNaN(date.getTime()) ? 'Invalid Date' : adminDateFormatter.format(date);
}

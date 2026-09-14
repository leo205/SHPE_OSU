import { describe, expect, it } from 'vitest';
import { formatAdminDate } from './adminDate';

describe('unchanged admin date presentation', () => {
  it.each([
    '2026-09-14T16:00:00Z',
    '2026-09-14T01:00:00Z',
    '2026-01-01T00:30:00Z',
    '2026-03-08T07:00:00Z',
    '2026-11-01T06:00:00Z',
    '2024-02-29T12:00:00Z',
    '2026-09-14',
  ])('matches the old formatter for %s in the current timezone', (value) => {
    expect(formatAdminDate(value)).toBe(new Date(value).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }));
  });

  it.each([null, undefined, ''])('preserves the missing-date placeholder for %s', (value) => {
    expect(formatAdminDate(value)).toBe('—');
  });

  it('preserves invalid-date feedback instead of crashing the dashboard', () => {
    expect(formatAdminDate('not-a-date')).toBe('Invalid Date');
  });
});

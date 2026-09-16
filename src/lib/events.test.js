import { describe, expect, it } from 'vitest';
import {
  attendanceEventDate,
  eventOptionLabel,
  mergeEvents,
  sortForCheckIn,
} from './events.js';

// Vitest runs under Node. Setting TZ through globalThis keeps this regression
// portable across macOS, Linux, and Windows shells.
globalThis.process.env.TZ = 'America/New_York';

describe('event data contracts', () => {
  it('keeps the production attendance event label format', () => {
    expect(eventOptionLabel({ date: '2026-09-03', title: 'GBM #1' }))
      .toBe('9/3 - GBM #1');
  });

  it('keeps tonight\'s event first during an Eastern evening check-in', () => {
    const events = [
      { id: 'next', date: '2026-09-10', title: 'Next GBM' },
      { id: 'today', date: '2026-09-03', title: 'Tonight GBM' },
      { id: 'past', date: '2026-09-02', title: 'Yesterday GBM' },
    ];
    // 8:30 PM EDT is already September 4 in UTC. A toISOString()-based
    // implementation therefore fails this case while local calendar logic does not.
    const eveningInColumbus = new Date('2026-09-03T20:30:00-04:00');

    expect(sortForCheckIn(events, { today: eveningInColumbus }).map((event) => event.id))
      .toEqual(['today', 'next']);
  });

  it('returns an empty check-in list when all events are in the past', () => {
    const events = [
      { id: 'older', date: '2025-10-01', title: 'Older' },
      { id: 'newer', date: '2025-11-01', title: 'Newer' },
    ];

    expect(sortForCheckIn(events, { today: new Date('2026-09-03T12:00:00-04:00') }))
      .toEqual([]);
  });

  it('ignores null dates and prefers the database copy of a duplicate event', () => {
    const databaseEvent = {
      id: 'db',
      date: '2026-09-03',
      title: 'GBM #1',
      location: 'Database room',
    };
    const fallback = [
      { id: 'broken', date: null, title: 'Broken row' },
      { id: 'static', date: '2026-09-03', title: 'GBM #1', location: 'Static room' },
      { id: 'extra', date: '2026-09-10', title: 'GBM #2' },
    ];

    expect(mergeEvents([databaseEvent], fallback)).toEqual([
      databaseEvent,
      { ...fallback[2], source: 'static' },
    ]);
  });

  it('plots late check-ins on the event date without rewriting the audit timestamp', () => {
    expect(attendanceEventDate('8/28 - General Body Meeting', '2026-08-29'))
      .toBe('2026-08-28');
    expect(attendanceEventDate('12/31 - Winter Social', '2027-01-01'))
      .toBe('2026-12-31');
  });
});

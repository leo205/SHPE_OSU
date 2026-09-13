import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarUrl,
  buildICS,
  escapeICS,
  parseTimeTo24h,
} from './calendar.js';

const event = {
  id: 'event-1',
  title: 'GBM #1',
  date: '2026-09-03',
  time: '6:00 PM',
  endTime: '7:00 PM',
  description: 'Welcome, SHPE; bring questions\nand ideas.',
  location: 'Bolz Hall',
};

describe('calendar export contracts', () => {
  it.each([
    ['6:00 PM', '180000'],
    ['12:00 AM', '000000'],
    ['12:00 PM', '120000'],
    ['garbage', null],
  ])('parses %s safely', (input, expected) => {
    expect(parseTimeTo24h(input)).toBe(expected);
  });

  it('exports local Eastern time to ICS instead of pretending it is UTC', () => {
    const output = buildICS(event);

    expect(output).toContain('DTSTART;TZID=America/New_York:20260903T180000');
    expect(output).not.toMatch(/DTSTART[^\r\n]*T\d{6}Z(?:\r?\n|$)/);
  });

  it('emits Google Calendar dates in the accepted compact form', () => {
    const url = new URL(buildGoogleCalendarUrl(event));

    expect(url.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}\/\d{8}T\d{6}$/);
  });

  it('escapes iCalendar punctuation and newlines', () => {
    expect(escapeICS('one; two, three\nfour')).toBe('one\\; two\\, three\\nfour');
  });
});

import { describe, expect, it } from 'vitest';
import { parseAttendanceRequest } from './attendance-validation.ts';

const validRequest = {
  event_id: 'cb85ed37-f923-4197-ad85-0f921ea143b5',
  event_name: '9/3 - GBM #1',
  first_name: ' Maria ',
  last_name_dotnum: ' Buckeye.1 ',
  year: '2nd Year',
  is_first_meeting: false,
  feedback: ' Great meeting! ',
  major: null,
  how_heard: null,
  turnstile_token: 'verified-token',
};

describe('Edge attendance request validation', () => {
  it('normalizes a valid returning-member request', () => {
    expect(parseAttendanceRequest(validRequest)).toEqual({
      ...validRequest,
      first_name: 'Maria',
      last_name_dotnum: 'Buckeye.1',
      feedback: 'Great meeting!',
    });
  });

  it('requires first-timer fields from the existing whitelists', () => {
    expect(parseAttendanceRequest({
      ...validRequest,
      is_first_meeting: true,
      major: 'Other – Data Science',
      how_heard: 'Friend / Word of mouth',
    })).not.toBeNull();

    expect(parseAttendanceRequest({
      ...validRequest,
      is_first_meeting: true,
      major: 'Made Up Major',
      how_heard: 'Friend / Word of mouth',
    })).toBeNull();
  });

  it.each([
    ['missing challenge', { turnstile_token: '' }],
    ['oversized challenge', { turnstile_token: 'x'.repeat(2049) }],
    ['bad event UUID', { event_id: 'not-a-uuid' }],
    ['arbitrary event label', { event_name: 'totally fake' }],
    ['oversized first name', { first_name: 'x'.repeat(101) }],
    ['control character in identity', { last_name_dotnum: 'Buckeye.1\nadmin' }],
    ['invalid year', { year: 'Freshman' }],
    ['oversized feedback', { feedback: 'x'.repeat(2001) }],
  ])('rejects %s', (_name, replacement) => {
    expect(parseAttendanceRequest({ ...validRequest, ...replacement })).toBeNull();
  });

  it('forces first-timer-only fields to null for returning members', () => {
    expect(parseAttendanceRequest({
      ...validRequest,
      major: 'Mechanical Engineering',
      how_heard: 'Instagram (@shpeosu)',
    })).toMatchObject({ major: null, how_heard: null });
  });
});

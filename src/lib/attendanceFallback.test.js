import { describe, expect, it } from 'vitest';
import { buildFallbackUrl, FALLBACK_FORM } from './attendanceFallback.js';

const sensitivePayload = {
  event_name: '9/3 - GBM #1',
  first_name: 'PrivateFirst-8f142',
  last_name_dotnum: 'PrivateLast.91357',
  year: 'PrivateYear-c821',
  is_first_meeting: false,
  feedback: 'PrivateFeedback-b53a',
  major: 'PrivateMajor-f671',
  how_heard: 'PrivateSource-288a',
};

describe('attendance emergency fallback URL', () => {
  it('never places attendee details in the default fallback URL', () => {
    const result = buildFallbackUrl(sensitivePayload);
    const url = new URL(result);
    const exposedValues = [...url.searchParams.values()];

    expect([...url.searchParams.keys()]).toEqual(['usp']);
    expect(url.searchParams.get('usp')).toBe('pp_url');
    for (const [field, value] of Object.entries(sensitivePayload)) {
      if (field === 'event_name') continue;
      expect(exposedValues, field).not.toContain(String(value));
      expect(decodeURIComponent(result), field).not.toContain(String(value));
    }
  });

  it('prefills only the canonical event label even if unsafe mappings are supplied', () => {
    const form = {
      baseUrl: 'https://docs.google.com/forms/d/example/viewform?hl=en&embedded=true&entry.88=stale-answer#form-start',
      entries: {
        event_name: 'entry.999',
        first_name: 'entry.1',
        last_name_dotnum: 'entry.2',
        year: 'entry.3',
        is_first_meeting: 'entry.4',
        feedback: 'entry.5',
        major: 'entry.6',
        how_heard: 'entry.7',
      },
    };

    const result = buildFallbackUrl(sensitivePayload, form);
    const url = new URL(result);

    expect(url.searchParams.get('entry.999')).toBe(sensitivePayload.event_name);
    expect(url.searchParams.get('hl')).toBe('en');
    expect(url.searchParams.get('embedded')).toBe('true');
    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.has('entry.88')).toBe(false);
    expect(url.hash).toBe('#form-start');
    expect([...url.searchParams.keys()].filter((key) => key.startsWith('entry.')))
      .toEqual(['entry.999']);
  });

  it('does not guess a Google Forms entry ID when the event mapping is unknown', () => {
    const result = buildFallbackUrl(sensitivePayload, FALLBACK_FORM);
    const url = new URL(result);

    expect(FALLBACK_FORM.entries.event_name).toBe('');
    expect([...url.searchParams.keys()].some((key) => key.startsWith('entry.'))).toBe(false);
  });
});

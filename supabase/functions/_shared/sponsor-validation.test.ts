import { describe, expect, it } from 'vitest';
import { parseSponsorInquiryRequest } from './sponsor-validation.ts';

const validRequest = {
  inquiry_id: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
  company_name: '  Acme Corp  ',
  contact_name: ' Jane Smith ',
  reply_to: ' JANE@ACME.EXAMPLE ',
  tier: 'Carmen ($1,000)',
  message: '  We would like to partner.  ',
  turnstile_token: 'verified-token',
};

describe('sponsor inquiry validation', () => {
  it('normalizes a valid request into the only fields sent to EmailJS', () => {
    expect(parseSponsorInquiryRequest(validRequest)).toEqual({
      inquiry_id: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
      company_name: 'Acme Corp',
      contact_name: 'Jane Smith',
      reply_to: 'jane@acme.example',
      tier: 'Carmen ($1,000)',
      message: 'We would like to partner.',
      turnstile_token: 'verified-token',
    });
  });

  it.each([
    ['bad inquiry UUID', { inquiry_id: 'not-a-uuid' }],
    ['missing company', { company_name: ' ' }],
    ['oversized company', { company_name: 'x'.repeat(151) }],
    ['header injection', { contact_name: 'Jane\r\nBcc: attacker@example.com' }],
    ['invalid email', { reply_to: 'not-an-email' }],
    ['email control character', { reply_to: 'jane@example.com\n' }],
    ['invented tier', { tier: 'Unlimited ($0)' }],
    ['oversized message', { message: 'x'.repeat(2001) }],
    ['message NUL', { message: 'hello\0world' }],
    ['message carriage return', { message: 'hello\rworld' }],
    ['missing challenge', { turnstile_token: '' }],
    ['oversized challenge', { turnstile_token: 'x'.repeat(2049) }],
  ])('rejects %s', (_label, replacement) => {
    expect(parseSponsorInquiryRequest({ ...validRequest, ...replacement })).toBeNull();
  });

  it('accepts an empty optional message and normal newlines', () => {
    expect(parseSponsorInquiryRequest({ ...validRequest, message: '   ' })?.message).toBe('');
    expect(parseSponsorInquiryRequest({ ...validRequest, message: 'Line one\nLine two' })?.message)
      .toBe('Line one\nLine two');
  });

  it('rejects extra client-owned routing data', () => {
    expect(parseSponsorInquiryRequest({
      ...validRequest,
      to_email: 'attacker@example.com',
    })).toBeNull();
  });

  it('rejects arrays and non-plain objects', () => {
    expect(parseSponsorInquiryRequest([])).toBeNull();
    expect(parseSponsorInquiryRequest(Object.assign(Object.create({ inherited: true }), validRequest)))
      .toBeNull();
  });

  it('applies field caps after trimming harmless outer spaces', () => {
    expect(parseSponsorInquiryRequest({
      ...validRequest,
      company_name: `   ${'x'.repeat(150)}   `,
    })?.company_name).toHaveLength(150);
  });
});

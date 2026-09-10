import { describe, expect, it, vi } from 'vitest';
import { sendEmailJsInquiry } from './emailjs-provider.ts';

const inquiry = {
  inquiry_id: '3f65dd7b-e5a8-42f4-860f-0ea690b76ac7',
  company_name: 'Acme Corp',
  contact_name: 'Jane Smith',
  reply_to: 'jane@acme.example',
  tier: 'Carmen ($1,000)',
  message: 'Hello',
};

const config = {
  serviceId: 'service_test',
  templateId: 'template_test',
  publicKey: 'public_test',
  privateKey: 'private_test',
};

describe('EmailJS server provider', () => {
  it('sends one authenticated JSON request with only the validated template fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

    await expect(sendEmailJsInquiry(inquiry, config, fetchImpl)).resolves.toBe('sent');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({
      service_id: 'service_test',
      template_id: 'template_test',
      user_id: 'public_test',
      accessToken: 'private_test',
      template_params: inquiry,
    });
    expect(init.body).not.toContain('turnstile_token');
  });

  it('omits accessToken when the EmailJS account has no private-key feature', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    const { privateKey: _privateKey, ...freePlanConfig } = config;

    await expect(sendEmailJsInquiry(inquiry, freePlanConfig, fetchImpl)).resolves.toBe('sent');

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      service_id: 'service_test',
      template_id: 'template_test',
      user_id: 'public_test',
      template_params: inquiry,
    });
  });

  it.each([
    ['provider rejection', vi.fn().mockResolvedValue(new Response('no', { status: 429 }))],
    ['unexpected 2xx body', vi.fn().mockResolvedValue(new Response('queued', { status: 200 }))],
    ['empty 2xx body', vi.fn().mockResolvedValue(new Response(null, { status: 204 }))],
    ['network failure', vi.fn().mockRejectedValue(new TypeError('offline'))],
    ['ambiguous timeout', vi.fn().mockRejectedValue(new DOMException('timed out', 'AbortError'))],
  ])('fails closed without retrying after %s', async (_label, fetchImpl) => {
    await expect(sendEmailJsInquiry(inquiry, config, fetchImpl)).resolves.toBe('failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

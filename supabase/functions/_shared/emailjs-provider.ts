import type { SponsorInquiry } from './sponsor-validation.ts';

export type EmailJsConfig = {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
};

type EmailInquiry = Omit<SponsorInquiry, 'turnstile_token'>;
type FetchLike = typeof fetch;

/**
 * Make exactly one EmailJS attempt. A timeout is ambiguous because EmailJS may
 * have accepted the message before the response was lost, so this never retries.
 */
export async function sendEmailJsInquiry(
  inquiry: EmailInquiry,
  config: EmailJsConfig,
  fetchImpl: FetchLike = fetch,
): Promise<'sent' | 'failed'> {
  try {
    const response = await fetchImpl('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        accessToken: config.privateKey,
        template_params: inquiry,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status !== 200) return 'failed';
    const confirmation = await response.text();
    return confirmation.trim() === 'OK' ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

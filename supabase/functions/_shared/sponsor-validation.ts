export const SPONSOR_TIER_OPTIONS = new Set([
  'Buckeye ($500)',
  'Carmen ($1,000)',
  'Scarlet & Gray ($1,500)',
  'Platinum ($2,000)',
  'Custom',
]);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INLINE_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// Message text may contain a tab or LF. CR and every other C0/C1 control are
// rejected so downstream templates receive one predictable plain-text form.
const MESSAGE_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
const EXPECTED_KEYS = new Set([
  'inquiry_id',
  'company_name',
  'contact_name',
  'reply_to',
  'tier',
  'message',
  'turnstile_token',
]);

export type SponsorInquiry = {
  inquiry_id: string;
  company_name: string;
  contact_name: string;
  reply_to: string;
  tier: string;
  message: string;
  turnstile_token: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rawString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Strictly parse the only payload shape permitted to reach the email provider. */
export function parseSponsorInquiryRequest(value: unknown): SponsorInquiry | null {
  if (!isPlainRecord(value)) return null;

  const keys = Object.keys(value);
  if (keys.length !== EXPECTED_KEYS.size || keys.some((key) => !EXPECTED_KEYS.has(key))) {
    return null;
  }

  const rawInquiryId = rawString(value.inquiry_id);
  const rawCompanyName = rawString(value.company_name);
  const rawContactName = rawString(value.contact_name);
  const rawReplyTo = rawString(value.reply_to);
  const rawTier = rawString(value.tier);
  const rawMessageValue = rawString(value.message);
  const rawToken = rawString(value.turnstile_token);

  // Check controls before trimming so a trailing newline cannot be silently
  // removed from a header-like value and accepted.
  if (
    rawInquiryId === null || INLINE_CONTROL.test(rawInquiryId)
    || rawCompanyName === null || INLINE_CONTROL.test(rawCompanyName)
    || rawContactName === null || INLINE_CONTROL.test(rawContactName)
    || rawReplyTo === null || INLINE_CONTROL.test(rawReplyTo)
    || rawTier === null || INLINE_CONTROL.test(rawTier)
    || rawMessageValue === null || MESSAGE_CONTROL.test(rawMessageValue)
    || rawToken === null || INLINE_CONTROL.test(rawToken)
  ) {
    return null;
  }

  const inquiryId = rawInquiryId.trim();
  const companyName = rawCompanyName.trim();
  const contactName = rawContactName.trim();
  const replyTo = rawReplyTo.trim().toLowerCase();
  const tier = rawTier.trim();
  const message = rawMessageValue.trim();
  const token = rawToken.trim();

  if (
    !inquiryId || !UUID_V4.test(inquiryId)
    || !companyName || companyName.length > 150
    || !contactName || contactName.length > 120
    || !replyTo || replyTo.length > 254 || !EMAIL.test(replyTo)
    || !tier || !SPONSOR_TIER_OPTIONS.has(tier)
    || message.length > 2000
    || !token || token.length > 2048
  ) {
    return null;
  }

  return {
    inquiry_id: inquiryId.toLowerCase(),
    company_name: companyName,
    contact_name: contactName,
    reply_to: replyTo,
    tier,
    message,
    turnstile_token: token,
  };
}

import { sendEmailJsInquiry } from '../_shared/emailjs-provider.ts';
import { hmacSha256 } from '../_shared/request-security.ts';
import { createRestAdmin } from '../_shared/supabase-admin.ts';
import { createSponsorInquiryHandler } from '../_shared/sponsor-handler.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';

const handler = createSponsorInquiryHandler({
  env: (name) => Deno.env.get(name),
  createAdmin: createRestAdmin,
  verifyChallenge: verifyTurnstile,
  hmac: hmacSha256,
  sendInquiry: sendEmailJsInquiry,
});

Deno.serve(handler);

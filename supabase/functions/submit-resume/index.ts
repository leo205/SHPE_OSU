import { createResumeHandler } from '../_shared/resume-handler.ts';
import { resumeFingerprint } from '../_shared/resume-fingerprint.ts';
import { hmacSha256 } from '../_shared/request-security.ts';
import { createRestAdmin } from '../_shared/supabase-admin.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';

const handler = createResumeHandler({
  env: (name) => Deno.env.get(name),
  createAdmin: createRestAdmin,
  verifyChallenge: verifyTurnstile,
  hmac: hmacSha256,
  fingerprint: resumeFingerprint,
});

Deno.serve(handler);

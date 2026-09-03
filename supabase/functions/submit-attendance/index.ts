import { createAttendanceHandler } from '../_shared/attendance-handler.ts';
import { hmacSha256 } from '../_shared/request-security.ts';
import { createRestAdmin } from '../_shared/supabase-admin.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';

const handler = createAttendanceHandler({
  env: (name) => Deno.env.get(name),
  createAdmin: createRestAdmin,
  verifyChallenge: verifyTurnstile,
  hmac: hmacSha256,
});

Deno.serve(handler);

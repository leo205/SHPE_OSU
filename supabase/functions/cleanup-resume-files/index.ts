import { authorizeAdmin } from '../_shared/admin-auth.ts';
import { createResumeCleanupHandler } from '../_shared/resume-cleanup-handler.ts';
import { createRestAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(createResumeCleanupHandler({
  env: (name) => Deno.env.get(name),
  authorize: authorizeAdmin,
  createAdmin: createRestAdmin,
}));

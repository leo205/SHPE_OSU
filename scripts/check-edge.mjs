import { build } from 'esbuild';

// The Vite build never sees Supabase Edge Functions. Bundle them separately in
// memory so a broken TypeScript import or unsupported syntax fails pre-push
// instead of failing for the first time during a production function deploy.
const result = await build({
  entryPoints: [
    'supabase/functions/submit-attendance/index.ts',
    'supabase/functions/submit-resume/index.ts',
    'supabase/functions/submit-sponsor-inquiry/index.ts',
    'supabase/functions/cleanup-resume-files/index.ts',
    'supabase/functions/manage-sponsor-assets/index.ts',
  ],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2022',
  outdir: 'edge-build',
  write: false,
  logLevel: 'warning',
});

if (result.outputFiles.length !== 5 || result.outputFiles.some((file) => file.contents.length === 0)) {
  throw new Error('Edge Function bundle check did not produce all five outputs.');
}

console.log('Edge Function bundle check passed.');

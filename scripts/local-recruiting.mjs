/* eslint-env node */
// Disposable local backend only. Never reads .env, --linked or a remote DB URL.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workdir = resolve(root, '.recruiting-local');
const cli = resolve(root, 'node_modules/.bin/supabase');
const project = 'shpe-recruiting-local';
const container = `supabase_db_${project}`;
const network = 'shpe-recruiting-loopback';
const api = 'http://127.0.0.1:55531';
const mode = process.argv[2];
const password = 'LocalRecruitingReview2026!'; // Disposable loopback-only fixture.
const accounts = [
  { email: 'recruiting-admin@example.test', role: 'admin' },
  { email: 'recruiting-a@example.test', role: 'sponsor' },
  { email: 'recruiting-b@example.test', role: 'sponsor' },
  { email: 'recruiting-unmapped@example.test', role: 'sponsor' },
  { email: 'recruiting-unrelated@example.test', role: null },
];
if (!['setup', 'functions', 'dev', 'smoke'].includes(mode)) throw new Error('Use: node scripts/local-recruiting.mjs setup|functions|dev|smoke');

function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', input, maxBuffer: 30 * 1024 * 1024 });
  // Status/start output contains disposable keys. Never print raw CLI output.
  if (result.error || result.status !== 0) {
    let detail = '';
    try {
      const error = JSON.parse(result.stdout).error;
      if (typeof error?.message === 'string') detail = error.message
        .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted local token]')
        .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted local key]')
        .replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted local DB URL]')
        .slice(0, 1500);
    } catch { /* Raw output can contain keys; report only structured errors. */ }
    throw new Error(`${command.split('/').pop()} ${args[0]} failed (${result.status ?? 'spawn'}). ${detail || 'Raw output withheld because local tools may print keys.'}`);
  }
  return result.stdout;
}

function status() {
  const result = JSON.parse(run(cli, ['status', '--workdir', workdir, '--output', 'json']));
  if (result.API_URL !== api) throw new Error('Refusing a non-loopback recruiting API.');
  return result;
}

function foreground(command, args, env = process.env) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
  child.on('error', () => { console.error('Local recruiting process failed to start.'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}

async function bundleFunctions() {
  const out = resolve(workdir, 'supabase/functions');
  await build({ entryPoints: [resolve(root, 'supabase/functions/cleanup-resume-files/index.ts')], outfile: resolve(out, 'cleanup-resume-files/index.ts'), bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module', 'main'], logLevel: 'warning' });
  // Cloudflare's official dummy-secret responses omit action and always report
  // example.com. The production verifier correctly rejects those. Only this
  // ignored local entry adapts that official test response. Production entry,
  // action/hostname validation, and production function bundle are untouched.
  const localEntry = `
import { createResumeHandler } from './supabase/functions/_shared/resume-handler.ts';
import { createRestAdmin } from './supabase/functions/_shared/supabase-admin.ts';
import { hmacSha256 } from './supabase/functions/_shared/request-security.ts';
const testSecret = '1x0000000000000000000000000000000AA';
async function verifyLocalChallenge(options) {
  const target = new URL(Deno.env.get('SUPABASE_URL') || 'https://invalid.example');
  if (Deno.env.get('LOCAL_RECRUITING_REHEARSAL') !== 'true' || target.protocol !== 'http:'
    || !['kong','localhost','127.0.0.1','supabase_kong_shpe-recruiting-local'].includes(target.hostname)
    || options.secret !== testSecret || options.token !== 'XXXX.DUMMY.TOKEN.XXXX'
    || options.expectedAction !== 'resume_submit') return 'rejected';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: testSecret, response: options.token }), signal: controller.signal,
    });
    if (!response.ok) return 'unavailable';
    const result = await response.json();
    return result.success === true && result.hostname === 'example.com' ? 'valid' : 'rejected';
  } catch { return 'unavailable'; } finally { clearTimeout(timer); }
}
Deno.serve(createResumeHandler({ env: (name) => Deno.env.get(name), createAdmin: createRestAdmin, verifyChallenge: verifyLocalChallenge, hmac: hmacSha256 }));
`;
  await build({ stdin: { contents: localEntry, resolveDir: root, sourcefile: 'local-recruiting-entry.ts', loader: 'ts' }, outfile: resolve(out, 'submit-resume/index.ts'), bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module', 'main'], logLevel: 'warning' });
  const envFile = resolve(workdir, 'functions.env');
  if (!existsSync(envFile)) writeFileSync(envFile, [
    'LOCAL_RECRUITING_REHEARSAL=true',
    'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA',
    'TURNSTILE_ALLOWED_HOSTNAMES=localhost,127.0.0.1',
    'PUBLIC_SITE_ORIGINS=http://127.0.0.1:5175,http://localhost:5175',
    `RATE_LIMIT_HMAC_SECRET=${randomBytes(32).toString('hex')}`, '',
  ].join('\n'), { mode: 0o600 });
}

if (run('git', ['check-ignore', '.recruiting-local/']).trim() !== '.recruiting-local/') throw new Error('The local runtime folder must be ignored before creating fixture credentials.');
mkdirSync(resolve(workdir, 'supabase'), { recursive: true });
copyFileSync(resolve(root, 'supabase/local/recruiting-review.toml'), resolve(workdir, 'supabase/config.toml'));

if (mode === 'setup') {
  // Current CLI versions validate configured entrypoints during start.
  await bundleFunctions();
  console.log('Starting the separate loopback-only recruiting database…');
  const networks = run('docker', ['network', 'ls', '--format', '{{.Name}}']).trim().split('\n');
  if (!networks.includes(network)) run('docker', ['network', 'create', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network]);
  const networkInfo = JSON.parse(run('docker', ['network', 'inspect', network]))[0];
  if (networkInfo.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') throw new Error('Recruiting Docker network must bind loopback only.');
  const running = run('docker', ['ps', '--format', '{{.Names}}']).trim().split('\n');
  if (running.includes(container)) {
    const instance = JSON.parse(run('docker', ['inspect', container]))[0];
    if (!instance.NetworkSettings.Networks?.[network]) throw new Error('Existing recruiting container uses an unexpected network; no container was changed.');
  }
  run(cli, ['start', '--network-id', network, '--workdir', workdir, '--exclude', 'realtime,imgproxy,studio,postgres-meta,logflare,vector,supavisor']);
  for (const name of run('docker', ['ps', '--format', '{{.Names}}']).trim().split('\n').filter((name) => name.endsWith(`_${project}`))) {
    const instance = JSON.parse(run('docker', ['inspect', name]))[0];
    for (const bindings of Object.values(instance.NetworkSettings.Ports || {})) {
      if ((bindings || []).some((binding) => !['127.0.0.1', '::1'].includes(binding.HostIp))) {
        run(cli, ['stop', '--workdir', workdir]);
        throw new Error('Stopped only the recruiting project because a service was not loopback-only.');
      }
    }
  }
  const info = status();
  const migrations = ['local/recruiting-review-bootstrap.sql', 'attendance-submit.sql', 'attendance-lockdown.sql', 'resume-edge-submit.sql', 'resume-cleanup.sql', 'resume-lockdown.sql', 'recruiting-interests.sql'];
  for (const file of migrations) {
    console.log(`Applying local rehearsal schema: ${file}`);
    run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], "SET shpe.local_recruiting_review = 'true';\n" + readFileSync(resolve(root, 'supabase', file), 'utf8'));
  }
  run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], "NOTIFY pgrst, 'reload schema';");
  const service = createClient(api, info.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = await service.auth.admin.listUsers();
  if (existing.error) throw new Error('Could not inspect disposable recruiting accounts.');
  for (const account of accounts) {
    if (existing.data.users.some((user) => user.email === account.email)) continue;
    const created = await service.auth.admin.createUser({ email: account.email, password, email_confirm: true, app_metadata: account.role ? { role: account.role } : {}, user_metadata: account.role ? {} : { role: 'admin' } });
    if (created.error) throw new Error('Could not create a disposable recruiting fixture account.');
  }
  await bundleFunctions();
  writeFileSync(resolve(workdir, 'review-login.txt'), ['LOCAL REHEARSAL ONLY — SYNTHETIC ACCOUNTS', ...accounts.map((account) => `${account.role || 'unrelated'}: ${account.email}`), `password: ${password}`, ''].join('\n'), { mode: 0o600 });
  console.log('Separate local recruiting schema ready. No hosted connection or sponsor-local container was used.');
  console.log('Fixture login details: .recruiting-local/review-login.txt. Run local:recruiting:functions, then local:recruiting:smoke.');
} else if (mode === 'functions') {
  status(); await bundleFunctions();
  foreground(cli, ['functions', 'serve', '--network-id', network, '--workdir', workdir, '--env-file', resolve(workdir, 'functions.env')]);
} else if (mode === 'dev') {
  const info = status();
  foreground(resolve(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', '5175', '--strictPort'], {
    ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: info.ANON_KEY,
    VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  });
} else {
  status(); foreground(process.execPath, [resolve(root, 'scripts/smoke-recruiting.mjs')]);
}

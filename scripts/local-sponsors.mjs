/* eslint-env node */
// This runner never uses --linked, production .env values, or a remote DB URL.
// It creates an isolated local project with public sponsor seeds and empty
// student datasets. Runtime files are ignored, not application configuration.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workdir = resolve(root, '.sponsor-local');
const cli = resolve(root, 'node_modules/.bin/supabase');
const container = 'supabase_db_shpe-sponsors-local';
const network = 'shpe-sponsors-loopback';
const api = 'http://127.0.0.1:55431';
const email = 'sponsor-admin@example.test';
const password = 'LocalSponsorReview2026!'; // Disposable loopback-only fixture.
const mode = process.argv[2];
if (!['setup', 'dev', 'functions'].includes(mode)) {
  throw new Error('Use: node scripts/local-sponsors.mjs setup|dev|functions');
}

function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', input, maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // CLI status/start can print local keys. Do not echo its raw stdout.
    throw new Error(`${command.split('/').pop()} failed: ${result.error?.message || result.stderr.slice(-2000)}`);
  }
  return result.stdout;
}

function status() {
  const info = JSON.parse(run(cli, ['status', '--workdir', workdir, '--output', 'json']));
  if (info.API_URL !== api) throw new Error('Refusing a non-local Supabase target.');
  return info;
}

function foreground(command, args, env = process.env) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
}

async function bundleAssets() {
  await build({
    entryPoints: [resolve(root, 'supabase/functions/manage-sponsor-assets/index.ts')],
    outfile: resolve(workdir, 'supabase/functions/manage-sponsor-assets/index.ts'),
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    mainFields: ['module', 'main'], logLevel: 'warning',
  });
}

mkdirSync(resolve(workdir, 'supabase'), { recursive: true });
copyFileSync(resolve(root, 'supabase/local/sponsor-review.toml'), resolve(workdir, 'supabase/config.toml'));

if (mode === 'setup') {
  console.log('Starting isolated local Supabase (Docker/Colima must be running)…');
  // Supabase's default published ports bind all interfaces. Use its documented
  // loopback network option, including on Colima/Lima's forwarded host ports.
  const networks = run('docker', ['network', 'ls', '--format', '{{.Name}}']).trim().split('\n');
  if (!networks.includes(network)) run('docker', ['network', 'create', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network]);
  const networkInfo = JSON.parse(run('docker', ['network', 'inspect', network]))[0];
  if (networkInfo.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') {
    throw new Error('Refusing a Docker network without loopback port bindings.');
  }
  const running = run('docker', ['ps', '--format', '{{.Names}}']).trim().split('\n');
  if (running.includes(container)) {
    const db = JSON.parse(run('docker', ['inspect', container]))[0];
    if (!db.NetworkSettings.Networks?.[network]) {
      // stop preserves this project's named volumes; no reset/no-backup flag.
      run(cli, ['stop', '--workdir', workdir]);
    }
  }
  run(cli, ['start', '--network-id', network, '--workdir', workdir, '--exclude', 'realtime,imgproxy,studio,postgres-meta,logflare,vector,supavisor']);
  for (const name of run('docker', ['ps', '--format', '{{.Names}}']).trim().split('\n').filter((name) => name.endsWith('_shpe-sponsors-local'))) {
    const instance = JSON.parse(run('docker', ['inspect', name]))[0];
    for (const bindings of Object.values(instance.NetworkSettings.Ports || {})) {
      if ((bindings || []).some((binding) => binding.HostIp !== '127.0.0.1' && binding.HostIp !== '::1')) {
        run(cli, ['stop', '--workdir', workdir]);
        throw new Error('Stopped local review because a service port was not loopback-only.');
      }
    }
  }
  const info = status();
  const sql = 'SET shpe.local_sponsor_review = \'true\';\n'
    + readFileSync(resolve(root, 'supabase/local/sponsor-review-bootstrap.sql'), 'utf8')
    + '\n' + readFileSync(resolve(root, 'supabase/sponsors-admin.sql'), 'utf8');
  run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql);
  const admin = createClient(api, info.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = await admin.auth.admin.listUsers();
  if (users.error) throw new Error('Could not inspect local fixture accounts.');
  if (!users.data.users.some((user) => user.email === email)) {
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'admin' } });
    if (result.error) throw new Error('Could not create the local review admin.');
  }
  await bundleAssets();
  writeFileSync(resolve(workdir, 'review-login.txt'), `LOCAL REVIEW ONLY\n${email}\n${password}\n`, { mode: 0o600 });
  console.log('Local sponsor schema and five-company seed ready. No production connection was used.');
  console.log('Run npm run local:sponsors:functions, then npm run local:sponsors:dev in another terminal.');
  console.log('Local-only login is in .sponsor-local/review-login.txt.');
} else if (mode === 'functions') {
  status();
  await bundleAssets();
  foreground(cli, ['functions', 'serve', 'manage-sponsor-assets', '--network-id', network, '--workdir', workdir]);
} else {
  const info = status();
  foreground(resolve(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: info.ANON_KEY,
    VITE_TURNSTILE_SITE_KEY: '',
  });
}

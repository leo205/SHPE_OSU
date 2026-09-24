/* eslint-env node */
// Synthetic local-only integration test: never reads .env or hosted config.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { PhotonImage } from '@cf-wasm/photon/node';

const root = resolve(import.meta.dirname, '..');
const status = spawnSync(resolve(root, 'node_modules/.bin/supabase'), [
  'status', '--workdir', resolve(root, '.sponsor-local'), '--output', 'json',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (status.error || status.status !== 0) throw new Error('Local Supabase status is unavailable.');
const local = JSON.parse(status.stdout);
const api = 'http://127.0.0.1:55431';
assert.equal(local.API_URL, api, 'Refusing a non-local target');
const url = `${api}/functions/v1/manage-sponsor-assets`;
const browser = createClient(api, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await browser.auth.signInWithPassword({ email: 'sponsor-admin@example.test', password: 'LocalSponsorReview2026!' });
assert.equal(login.error, null, 'Local fixture admin login failed');
const bearer = login.data.session.access_token;
const headers = { Authorization: `Bearer ${bearer}`, Origin: 'http://127.0.0.1:5173' };
const paths = [];
const admin = createClient(api, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let temporaryUser;

function sql(statement) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_shpe-sponsors-local',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
  { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function body(file) { const form = new FormData(); form.append('file', file); return form; }
const image = new PhotonImage(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
const fixtures = { png: image.get_bytes(), jpeg: image.get_bytes_jpeg(85), webp: image.get_bytes_webp() };
image.free();
try {
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"cleanup"}' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Authorization: 'Bearer invalid' }, body: body(new File([fixtures.png], 'logo.png', { type: 'image/png' })) })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'http://127.0.0.1:5173.evil.test' }, body: body(new File([fixtures.png], 'logo.png', { type: 'image/png' })) })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body: body(new File(['<svg onload="alert(1)"></svg>'], 'logo.png', { type: 'image/png' })) })).status, 400);
  const roleProbe = await admin.auth.admin.createUser({
    email: `sponsor-edge-${crypto.randomUUID()}@example.test`, password: 'LocalSponsorProbe2026!',
    email_confirm: true, app_metadata: { role: 'sponsor' }, user_metadata: { role: 'admin' },
  });
  assert.equal(roleProbe.error, null); temporaryUser = roleProbe.data.user.id;
  const recruiter = createClient(api, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const recruiterLogin = await recruiter.auth.signInWithPassword({ email: roleProbe.data.user.email, password: 'LocalSponsorProbe2026!' });
  assert.equal(recruiterLogin.error, null);
  assert.equal((await fetch(url, { method: 'POST', headers: {
    ...headers, Authorization: `Bearer ${recruiterLogin.data.session.access_token}`, 'Content-Type': 'application/json',
  }, body: '{"action":"cleanup"}' })).status, 403);
  await recruiter.auth.signOut();
  for (const [type, bytes] of Object.entries(fixtures)) {
    const response = await fetch(url, { method: 'POST', headers, body: body(new File([bytes], `fixture.${type}`, { type: `image/${type}` })) });
    const result = await response.json();
    assert.equal(response.status, 200, `${type} upload: ${JSON.stringify(result)}`);
    assert.equal(result.status, 'uploaded');
    assert.match(result.path, /^logos\/[0-9a-f-]{36}\.png$/);
    paths.push(result.path);
    const stored = await fetch(`${api}/storage/v1/object/public/sponsor-assets/${result.path}`);
    assert.equal(stored.status, 200); assert.match(stored.headers.get('Content-Type'), /^image\/png/);
    const decoded = PhotonImage.new_from_byteslice(new Uint8Array(await stored.arrayBuffer()));
    assert.equal(decoded.get_width(), 2); assert.equal(decoded.get_height(), 1); decoded.free();
  }
  // Real existing synthetic objects make a zero-row browser DELETE observable.
  const browserUpload = await browser.storage.from('sponsor-assets').upload(paths[0], fixtures.png, { contentType: 'image/png', upsert: true });
  assert.ok(browserUpload.error, 'Admin browser must not bypass validated upload');
  await browser.storage.from('sponsor-assets').remove([paths[0]]);
  assert.equal((await fetch(`${api}/storage/v1/object/public/sponsor-assets/${paths[0]}`)).status, 200, 'Browser deletion must leave the actual object intact');
  // Only generated paths from this invocation enter SQL; no user data is read.
  const list = paths.map((path) => `'${path}'`).join(',');
  assert.equal(sql(`SELECT count(*) FROM public.sponsor_assets a JOIN storage.objects o ON o.bucket_id = 'sponsor-assets' AND o.name = a.path WHERE a.path IN (${list}) AND a.state = 'ready' AND a.content_type = 'image/png' AND o.metadata->>'size' = a.size_bytes::text;`), '3');
  sql(`UPDATE public.sponsor_assets SET created_at = now() - interval '25 hours' WHERE path IN (${list});`);
  const response = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"action":"cleanup"}' });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.ok(result.removed >= 3);
  assert.equal(sql(`SELECT count(*) FROM public.sponsor_assets WHERE path IN (${list}) AND state = 'deleted';`), '3');
  assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'sponsor-assets' AND name IN (${list});`), '0');
  console.log('Local Edge smoke passed: Auth/CORS/non-admin denials; actual PNG/JPEG/WebP normalized uploads; matching ready registry/Storage; direct-browser mutation denial; leased deletion with retained tombstones.');
} finally {
  if (temporaryUser) await admin.auth.admin.deleteUser(temporaryUser);
  await browser.auth.signOut();
}

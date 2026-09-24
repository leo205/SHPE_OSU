/* eslint-env node */
// Real REST/RLS and domain-client checks against the disposable local project.
// No .env, --linked, remote URL, production key, or production row is used.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const api = 'http://127.0.0.1:55431';
const container = 'supabase_db_shpe-sponsors-local';
const status = spawnSync(resolve(root, 'node_modules/.bin/supabase'), [
  'status', '--workdir', resolve(root, '.sponsor-local'), '--output', 'json',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (status.error || status.status !== 0) throw new Error('Local Supabase status is unavailable.');
const local = JSON.parse(status.stdout);
assert.equal(local.API_URL, api, 'Refusing a non-local target');
const client = (key = local.ANON_KEY) => createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = client();
const admin = client();
const recruiter = client();
const service = client(local.SERVICE_ROLE_KEY);
const bundle = await build({ entryPoints: [resolve(root, 'src/lib/sponsors.js')], bundle: true, format: 'esm', platform: 'node', write: false });
const { loadSponsors, saveSponsor } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const [firstId, secondId, deniedAnonymousId, deniedRecruiterId] = Array.from({ length: 4 }, () => crypto.randomUUID());
const fixtureIds = [firstId, secondId, deniedAnonymousId, deniedRecruiterId];
const fixtureList = fixtureIds.map((id) => `'${id}'`).join(',');
const seedIds = Array.from({ length: 5 }, (_, index) => `682a1b3d-7f16-4d4c-9409-00000000000${index + 1}`);
const seedList = seedIds.map((id) => `'${id}'`).join(',');
let temporaryUser;

function sql(statement) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }).trim();
}
const rows = async (who, table = 'sponsors', id = firstId) => {
  const result = await who.from(table).select('*').eq(table === 'sponsor_audit' ? 'sponsor_id' : 'id', id);
  assert.equal(result.error, null, `Failed allowed ${table} read`);
  return result.data;
};
const input = {
  name: `LOCAL SMOKE Sponsor ${firstId.slice(0, 8)}`, tier_key: 'carmen',
  logo_path: '/photos/sponsors/honda.webp', website_url: 'https://example.test/synthetic-sponsor',
  academic_year: '2026-2027', status: 'draft', display_order: 9900,
};
const seedBefore = sql(`SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id), '[]') FROM public.sponsors s WHERE id IN (${seedList});`);
assert.equal(JSON.parse(seedBefore).length, 5, 'Expected the five migrated local sponsors');
try {
  const login = await admin.auth.signInWithPassword({ email: 'sponsor-admin@example.test', password: 'LocalSponsorReview2026!' });
  assert.equal(login.error, null, 'Local fixture admin login failed');
  const account = await service.auth.admin.createUser({
    email: `sponsor-metadata-${crypto.randomUUID()}@example.test`, password: 'LocalSponsorProbe2026!',
    email_confirm: true, app_metadata: { role: 'sponsor' }, user_metadata: { role: 'admin' },
  });
  assert.equal(account.error, null); temporaryUser = account.data.user.id;
  assert.equal((await recruiter.auth.signInWithPassword({ email: account.data.user.email, password: 'LocalSponsorProbe2026!' })).error, null);

  for (const [who, creationId] of [[anonymous, deniedAnonymousId], [recruiter, deniedRecruiterId]]) {
    assert.equal((await saveSponsor(who, input, { creationId })).ok, false, 'Only admins may create drafts');
    assert.deepEqual(await rows(admin, 'sponsors', creationId), []);
  }
  let saved = await saveSponsor(admin, input, { creationId: firstId });
  assert.equal(saved.ok, true); assert.equal(saved.data.status, 'draft'); assert.equal(saved.data.version, 1);
  assert.equal((await rows(admin)).length, 1);
  assert.deepEqual(await rows(anonymous), []); assert.deepEqual(await rows(recruiter), []);
  assert.equal((await loadSponsors(admin)).data.some((row) => row.id === firstId), false, 'Public page stays published-only for admin viewers');
  assert.equal((await loadSponsors(admin, { admin: true })).data.some((row) => row.id === firstId), true);
  assert.equal((await loadSponsors(recruiter, { admin: true })).data.some((row) => row.id === firstId), false, 'Client flags cannot bypass RLS');

  const retry = await saveSponsor(admin, input, { creationId: firstId });
  assert.equal(retry.ok, true); assert.equal(retry.data.version, 1);
  assert.equal((await rows(admin, 'sponsor_audit')).length, 1, 'Exact retry creates no second row or audit change');
  const changedRetry = await saveSponsor(admin, { ...input, name: `${input.name} changed` }, { creationId: firstId });
  assert.equal(changedRetry.ok, false); assert.equal(changedRetry.conflict, true);
  assert.equal((await rows(admin))[0].name, input.name);

  saved = await saveSponsor(admin, { ...input, status: 'published' }, { id: firstId, version: saved.data.version });
  assert.equal(saved.ok, true); assert.equal(saved.data.version, 2);
  for (const who of [anonymous, recruiter, admin]) assert.equal((await rows(who))[0].status, 'published');
  const baseline = (await rows(admin))[0];
  for (const who of [anonymous, recruiter]) {
    const blocked = await who.from('sponsors').update({ name: 'Unauthorized mutation' }).eq('id', firstId).select();
    assert.ok(blocked.error || blocked.data.length === 0);
    assert.deepEqual((await rows(admin))[0], baseline, 'Denied write must leave a real row unchanged');
    const removed = await who.from('sponsors').delete().eq('id', firstId).select();
    assert.ok(removed.error || removed.data.length === 0);
    assert.equal((await rows(admin)).length, 1, 'Denied deletion must leave the actual row present');
  }
  const stale = await saveSponsor(admin, { ...input, name: 'Stale editor', status: 'published' }, { id: firstId, version: 1 });
  assert.equal(stale.ok, false); assert.equal(stale.conflict, true);
  assert.deepEqual((await rows(admin))[0], baseline);

  const second = await saveSponsor(admin, { ...input, name: `LOCAL SMOKE Second ${secondId.slice(0, 8)}`, status: 'published', display_order: 9901 }, { creationId: secondId });
  assert.equal(second.ok, true);
  saved = await saveSponsor(admin, { ...saved.data, name: `${input.name} edited`, display_order: 9999 }, { id: firstId, version: saved.data.version });
  assert.equal(saved.ok, true); assert.equal(saved.data.version, 3);
  const ordered = (await loadSponsors(anonymous)).data.filter((row) => [firstId, secondId].includes(row.id)).map((row) => row.id);
  assert.deepEqual(ordered, [secondId, firstId]);
  saved = await saveSponsor(admin, { ...saved.data, status: 'archived' }, { id: firstId, version: saved.data.version });
  assert.equal(saved.ok, true); assert.equal(saved.data.version, 4);
  assert.deepEqual(await rows(anonymous), []); assert.deepEqual(await rows(recruiter), []);
  assert.equal((await rows(admin))[0].status, 'archived');

  if (process.argv.includes('--rerun-migration')) {
    // Run only after other isolated concurrency tests have finished. The exact
    // existing row/seed snapshots must survive the repeat-safe migration.
    const before = sql(`SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.sponsors s WHERE id IN (${fixtureList});`);
    sql(readFileSync(resolve(root, 'supabase/sponsors-admin.sql'), 'utf8'));
    assert.equal(sql(`SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.sponsors s WHERE id IN (${fixtureList});`), before);
    assert.equal(sql(`SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id), '[]') FROM public.sponsors s WHERE id IN (${seedList});`), seedBefore);
  }

  saved = await saveSponsor(admin, { ...saved.data, status: 'draft' }, { id: firstId, version: saved.data.version });
  assert.equal(saved.ok, true); assert.equal(saved.data.status, 'draft'); assert.equal(saved.data.version, 5);
  assert.deepEqual(await rows(anonymous), []); assert.deepEqual(await rows(recruiter), []);
  const history = await rows(admin, 'sponsor_audit');
  assert.equal(history.length, 5); assert.ok(history.every((entry) => entry.actor_id === login.data.user.id));
  assert.equal(history.filter((entry) => entry.action === 'INSERT').length, 1);
  for (const who of [anonymous, recruiter]) {
    const privateHistory = await who.from('sponsor_audit').select('*').eq('sponsor_id', firstId);
    assert.ok(privateHistory.error || privateHistory.data.length === 0, 'Audit history must remain private');
  }
  for (const who of [anonymous, recruiter, admin]) {
    assert.ok((await who.from('sponsor_audit').insert({ sponsor_id: firstId, action: 'UPDATE', after_record: {} })).error);
    assert.ok((await who.from('sponsor_audit').update({ actor_id: null }).eq('sponsor_id', firstId)).error);
    assert.ok((await who.from('sponsor_audit').delete().eq('sponsor_id', firstId)).error);
  }
  assert.equal((await rows(admin, 'sponsor_audit')).length, 5);
  assert.ok((await admin.from('sponsors').update({ version: 999 }).eq('id', firstId)).error, 'Version is database-owned');
  assert.ok((await admin.from('sponsors').delete().eq('id', firstId)).error, 'Listings are archived rather than permanently deleted');
  assert.equal(sql(`SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id), '[]') FROM public.sponsors s WHERE id IN (${seedList});`), seedBefore);
  console.log(`Local sponsor metadata smoke passed: real RLS role matrix, stable-ID retry, publish/edit/order/archive/restore, stale-version conflict, private trigger-owned audit${process.argv.includes('--rerun-migration') ? ', repeat-safe migration and unchanged five-company seed' : ''}.`);
} finally {
  // Explicit synthetic IDs only; remove their audit rows first for the FK.
  sql(`BEGIN; DELETE FROM public.sponsor_audit WHERE sponsor_id IN (${fixtureList}); DELETE FROM public.sponsors WHERE id IN (${fixtureList}); COMMIT;`);
  assert.equal(sql(`SELECT count(*) FROM public.sponsors WHERE id IN (${fixtureList});`), '0');
  if (temporaryUser) await service.auth.admin.deleteUser(temporaryUser);
  await Promise.all([admin.auth.signOut(), recruiter.auth.signOut()]);
}

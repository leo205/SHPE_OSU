/* eslint-env node */
// Explicitly authorized, bounded hosted rehearsal. This file contains no keys.
// See --help; it never discovers credentials, edits roles on existing accounts,
// sends emails, deploys code, deletes Storage catalog rows, or runs a whole-queue worker.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Authorized hosted smoke: node scripts/smoke-recruiting-hosted.mjs --config <private-tmp-json> --execute [--cleanup-manifest <private-manifest>]');
  console.log('Config: { authorization:"recruiting-hosted-smoke-2026-11-18", projectRef, url, anonKey, serviceRoleKey, sqlCommand:[absoluteSupabaseCli,"db","query","--linked","--project-ref",projectRef,"--file","{file}","--output-format","json"], allowFixtureCleanupLease:true }');
  console.log('Alternative SQL transport: managementToken or managementTokenFile. Credentials/runtime must be outside the Vite worktree in a current-user-owned 0700 /private/tmp/shpe-recruiting-hosted-* folder; config/token files must be 0600. A successful public Edge submission with a live Turnstile challenge is deliberately separate and unverified by this script.');
  process.exit(0);
}
function option(flag) { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1]; }
assert.ok(args.includes('--execute'), 'Refusing a hosted test without --execute');
assert.ok(option('--config'), 'An explicit private configuration file is required');
const configPath = realpathSync(resolve(option('--config')));
const privateBase = realpathSync(dirname(configPath));
assert.match(privateBase, /^\/private\/tmp\/shpe-recruiting-hosted-[A-Za-z0-9_-]+$/, 'Live credentials must stay outside the Vite filesystem');
function assertPrivateRuntimePath(path, secretFile = false) {
  const name = relative(privateBase, resolve(path));
  assert.ok(name && !name.startsWith('..') && !isAbsolute(name), 'Runtime path escapes the private hosted-test directory');
  let existing = resolve(path);
  while (!existsSync(existing)) existing = dirname(existing);
  const actual = realpathSync(existing);
  assert.ok(actual === privateBase || actual.startsWith(privateBase + '/'), 'Runtime symlink escapes the private hosted-test directory');
  const base = statSync(privateBase);
  assert.equal(base.uid, process.getuid(), 'Private runtime belongs to another user');
  assert.equal(base.mode & 0o777, 0o700, 'Private runtime directory must have mode 0700');
  if (secretFile) {
    const file = statSync(path);
    assert.ok(file.isFile()); assert.equal(file.uid, process.getuid());
    assert.equal(file.mode & 0o777, 0o600, 'Credential files must have mode 0600');
  }
}
assertPrivateRuntimePath(configPath, true);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
assert.equal(config.authorization, 'recruiting-hosted-smoke-2026-11-18', 'Missing explicit hosted-test authorization marker');
assert.match(config.projectRef || '', /^[a-z0-9]{16,32}$/);
assert.equal(config.url, `https://${config.projectRef}.supabase.co`, 'Project identity does not match the explicit HTTPS target');
assert.ok(config.anonKey && config.serviceRoleKey, 'Explicit public and service keys are required');
const api = config.url;
const runId = randomUUID();
const cleanupManifest = option('--cleanup-manifest');
const runtime = cleanupManifest ? dirname(resolve(cleanupManifest)) : resolve(dirname(configPath), 'hosted-smoke', runId);
assertPrivateRuntimePath(runtime); mkdirSync(runtime, { recursive: true, mode: 0o700 }); chmodSync(runtime, 0o700);
const manifestPath = cleanupManifest ? resolve(cleanupManifest) : resolve(runtime, 'manifest.json');
assertPrivateRuntimePath(manifestPath);
const manifest = cleanupManifest ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  version: 1, projectRef: config.projectRef, api, runId, startedAt: new Date().toISOString(),
  accounts: [], companies: [], drafts: [], checks: [], cleanupComplete: false,
};
assert.equal(manifest.projectRef, config.projectRef, 'Cleanup manifest belongs to a different project');
assert.equal(manifest.api, api); assert.match(manifest.runId, /^[0-9a-f-]{36}$/);
const tag = manifest.runId;
function save() { writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 }); }
save();
const quoted = (value) => `'${String(value).replaceAll("'", "''")}'`;
const uuid = (value) => { assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); return `${quoted(value)}::uuid`; };
const uuidArray = (values) => `ARRAY[${values.map(uuid).join(',')}]::uuid[]`;
const textArray = (values) => `ARRAY[${values.map(quoted).join(',')}]::text[]`;
function sqlRows(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['rows', 'data', 'result', 'results']) {
    if (Array.isArray(value?.[key])) return value[key];
    if (value?.[key] && typeof value[key] === 'object') { try { return sqlRows(value[key]); } catch { /* try another envelope */ } }
  }
  throw new Error('Unrecognized SQL result envelope');
}
let queryNumber = 0;
async function query(sql) {
  if (config.sqlCommand) {
    const command = [...config.sqlCommand];
    assert.equal(realpathSync(command[0]), realpathSync(resolve(root, 'node_modules/.bin/supabase')), 'SQL transport must use the installed Supabase CLI');
    assert.deepEqual(command.slice(1), ['db','query','--linked','--project-ref',config.projectRef,'--file','{file}','--output-format','json'], 'Refusing alternate SQL targets or transport flags');
    const file = resolve(runtime, `query-${++queryNumber}.sql`);
    writeFileSync(file, sql, { mode: 0o600 });
    const result = spawnSync(command[0], command.slice(1).map((item) => item === '{file}' ? file : item), { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Fixture SQL transport failed; output withheld');
    return sqlRows(JSON.parse(result.stdout));
  }
  let token = config.managementToken;
  if (config.managementTokenFile) { assertPrivateRuntimePath(resolve(config.managementTokenFile), true); token = readFileSync(config.managementTokenFile, 'utf8').trim(); }
  assert.ok(token, 'A management SQL transport is required');
  const response = await fetch(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error('Fixture SQL transport failed; output withheld');
  return sqlRows(await response.json());
}
const makeClient = (key = config.anonKey) => createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const service = makeClient(config.serviceRoleKey), anonymous = makeClient();
let admin, sponsorA, sponsorB, unrelated;
const check = (name) => { manifest.checks.push(name); save(); };
async function rpc(client, name, parameters = {}) { const result = await client.rpc(name, parameters); assert.equal(result.error, null, `${name} failed`); return result.data; }
const denied = (result) => Boolean(result.error || (Array.isArray(result.data) && result.data.length === 0));
function pdf(name, email) {
  const stream = `BT /F1 12 Tf 60 730 Td (DISPOSABLE HOSTED RECRUITING TEST) Tj 0 -22 Td (${name}) Tj 0 -22 Td (${email}) Tj ET\n`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let text = '%PDF-1.7\n% Synthetic hosted test\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(text.length); text += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  text += `%${' '.repeat(Math.max(0, 11 * 1024 - text.length))}\n`; const xref = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new File([text], 'synthetic-hosted-resume.pdf', { type: 'application/pdf' });
}
async function createAccount(kind, role) {
  const account = { kind, email: `shpe.recruiting.smoke.${tag}.${kind}@example.test`, id: null, role, attempted: false };
  manifest.accounts.push(account); save();
  const existing = await query(`SELECT id FROM auth.users WHERE lower(email) = ${quoted(account.email)};`);
  assert.equal(existing.length, 0, 'Refusing an existing account fixture collision');
  const password = `${randomUUID()}!aA9`; account.attempted = true; save();
  const result = await service.auth.admin.createUser({ email: account.email, password, email_confirm: true, app_metadata: role ? { role } : {}, user_metadata: role ? {} : { role: 'admin' } });
  assert.equal(result.error, null, 'Disposable Auth account creation failed');
  account.id = result.data.user.id; save();
  const client = makeClient(); const signed = await client.auth.signInWithPassword({ email: account.email, password });
  assert.equal(signed.error, null, 'Disposable Auth account sign-in failed');
  return client;
}
async function createCompany(label) {
  const company = { id: null, name: `Disposable SHPE recruiting smoke ${tag} ${label}`, attempted: true };
  manifest.companies.push(company); save();
  assert.equal((await query(`SELECT id FROM public.recruiting_companies WHERE name = ${quoted(company.name)};`)).length, 0, 'Refusing a catalog fixture collision');
  const result = await admin.from('recruiting_companies').insert({ name: company.name, active: true }).select('id,name,active').single();
  assert.equal(result.error, null, 'Admin catalog creation failed'); company.id = result.data.id; save(); return result.data;
}
function draft(label, companyIds, linkedinUrl, legacy = false) {
  const entry = { submissionId: randomUUID(), startedAt: Date.now(), email: `synthetic.recruiting.smoke.${tag}.alpha@osu.edu`, fullName: `Synthetic Hosted Smoke ${tag} Alpha`, path: null, resumeId: null, ownsPath: false, legacy, companyIds, linkedinUrl, label };
  manifest.drafts.push(entry); save(); return entry;
}
async function fingerprint(entry, file) {
  const data = { full_name: entry.fullName, email: entry.email, major: 'Mechanical Engineering', graduation_year: String(new Date().getUTCFullYear() + 2), submission_id: entry.submissionId, submission_started_at: entry.startedAt, file_sha256: createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'), ...(entry.legacy ? {} : { linkedin_url: entry.linkedinUrl, company_ids: [...new Set(entry.companyIds)].sort() }) };
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
async function reserveAndQueue(entry) {
  const file = pdf(entry.fullName, entry.email); const hash = await fingerprint(entry, file); entry.fingerprint = hash; save();
  const reservation = await rpc(service, 'reserve_resume_submission', { p_submission_id: entry.submissionId, p_submission_started_at: entry.startedAt, p_fingerprint: hash });
  assert.equal(reservation.status, 'reserved', 'New fixture reservation was not reserved'); entry.path = reservation.resume_path;
  assert.match(entry.path, /^submissions\/[0-9]{13}_[0-9a-f-]{36}\.pdf$/); save();
  const existing = await query(`SELECT count(*)::integer AS count FROM storage.objects WHERE bucket_id = 'resumes' AND name = ${quoted(entry.path)};`);
  assert.equal(existing[0].count, 0, 'Refusing an existing object fixture collision'); entry.ownsPath = true; save();
  const uploaded = await service.storage.from('resumes').upload(entry.path, file, { contentType: 'application/pdf', upsert: false });
  assert.equal(uploaded.error, null, 'Disposable private PDF upload failed');
  const parameters = { p_submission_id: entry.submissionId, p_fingerprint: hash, p_full_name: entry.fullName, p_email: entry.email, p_major: 'Mechanical Engineering', p_graduation_year: String(new Date().getUTCFullYear() + 2), p_resume_path: entry.path, ...(entry.legacy ? {} : { p_linkedin_url: entry.linkedinUrl, p_company_ids: entry.companyIds, p_linkedin_provided: true, p_company_interests_provided: true }) };
  assert.equal(await rpc(service, entry.legacy ? 'queue_resume_submission' : 'queue_resume_submission_v2', parameters), 'accepted', 'Fixture queue did not accept');
  const row = await admin.from('resumes').select('id,submission_id,email,full_name,resume_path,approved,linkedin_url').eq('submission_id', entry.submissionId).single();
  assert.equal(row.error, null, 'Queued fixture metadata not found'); assert.equal(row.data.email, entry.email); entry.resumeId = row.data.id; save(); return row.data;
}
async function approve(entry) {
  const safety = await query(`SELECT count(*)::integer AS unexpected FROM public.resumes WHERE lower(btrim(email)) = ${quoted(entry.email)} AND NOT coalesce(submission_id = ANY(${uuidArray(manifest.drafts.map((item) => item.submissionId))}), false);`);
  assert.equal(safety[0].unexpected, 0, 'Refusing approval with an unowned email sibling');
  assert.equal(await rpc(admin, 'approve_resume_submission', { p_resume_id: entry.resumeId }), 'accepted');
}
async function book(client, companyId) {
  const ids = manifest.drafts.map((entry) => entry.resumeId).filter(Boolean);
  const result = await client.rpc('list_recruiter_resumes', { p_offset: 0, p_limit: 1000, ...(companyId ? { p_company_id: companyId } : {}) }).in('id', ids);
  assert.equal(result.error, null, 'Company directory lookup failed'); return result.data;
}
async function sign(client, entry, allowed) {
  const response = await client.storage.from('resumes').createSignedUrl(entry.path, 60);
  if (!allowed) { assert.ok(response.error, 'Unexpected access to a private fixture PDF'); return; }
  assert.equal(response.error, null, 'Authorized private PDF signing failed'); assert.equal(new URL(response.data.signedUrl).origin, api);
  const file = await fetch(response.data.signedUrl); assert.equal(file.status, 200); const bytes = new Uint8Array(await file.arrayBuffer());
  assert.ok(bytes.length >= 10240 && bytes.length <= 256000); assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
}
async function invalidChallengeProbe() {
  const entry = draft('invalid-challenge', [], ''); const file = pdf(entry.fullName, entry.email); const before = await query("SELECT md5(coalesce(string_agg(rate_key || ':' || window_started_at::text || ':' || request_count::text, ',' ORDER BY rate_key), '')) AS digest FROM public.public_submission_rate_limits;");
  const fields = { full_name: entry.fullName, email: entry.email, major: 'Mechanical Engineering', graduation_year: String(new Date().getUTCFullYear() + 2), submission_id: entry.submissionId, submission_started_at: String(entry.startedAt), linkedin_url: '', company_ids: '[]', turnstile_token: `invalid-smoke-${tag}`, file };
  const body = new FormData(); for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = await fetch(`${api}/functions/v1/submit-resume`, { method: 'POST', headers: { apikey: config.anonKey, Origin: 'https://www.shpeosu.com' }, body });
  assert.equal(response.status, 403, 'Production invalid challenge was not rejected'); assert.equal((await response.json()).error, 'verification_failed');
  const remaining = await query(`SELECT (SELECT count(*) FROM public.resumes WHERE submission_id = ${uuid(entry.submissionId)})::integer AS rows, (SELECT count(*) FROM public.resume_submission_reservations WHERE submission_id = ${uuid(entry.submissionId)})::integer AS reservations;`);
  assert.equal(remaining[0].rows, 0); assert.equal(remaining[0].reservations, 0);
  const after = await query("SELECT md5(coalesce(string_agg(rate_key || ':' || window_started_at::text || ':' || request_count::text, ',' ORDER BY rate_key), '')) AS digest FROM public.public_submission_rate_limits;");
  manifest.invalidChallengeQuotaSnapshotUnchanged = before[0].digest === after[0].digest;
  check('production-invalid-challenge-rejected-without-fixture-writes');
}
async function cleanOwned() {
  // Recover only resources whose unique names were journaled before an attempted creation.
  for (const account of manifest.accounts) {
    assert.ok(['admin','a','b','unrelated'].includes(account.kind)); assert.equal(account.email, `shpe.recruiting.smoke.${tag}.${account.kind}@example.test`, 'Malformed owned account journal');
    if (!account.id && account.attempted) { const found = await query(`SELECT id FROM auth.users WHERE lower(email) = ${quoted(account.email)};`); assert.ok(found.length <= 1); account.id = found[0]?.id || null; save(); }
  }
  for (const entry of manifest.drafts) {
    uuid(entry.submissionId); assert.equal(entry.email, `synthetic.recruiting.smoke.${tag}.alpha@osu.edu`);
    const found = await query(`SELECT id, email, full_name, resume_path FROM public.resumes WHERE submission_id = ${uuid(entry.submissionId)};`);
    const reserved = await query(`SELECT resume_path FROM public.resume_submission_reservations WHERE submission_id = ${uuid(entry.submissionId)};`);
    assert.ok(found.length <= 1);
    if (found.length) {
      assert.equal(found[0].email, entry.email); assert.equal(found[0].full_name, entry.fullName);
      assert.equal(reserved.length, 1, 'Owned resume has no reservation proof');
      assert.equal(found[0].resume_path, reserved[0].resume_path, 'Owned resume and reservation path do not match');
      if (entry.path) assert.equal(found[0].resume_path, entry.path, 'Owned resume path changed');
      const result = await query(`WITH admin_claim AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true)) SELECT public.delete_resume_submission(${uuid(found[0].id)}) AS result FROM admin_claim;`);
      assert.equal(result[0].result.status, 'deleted', 'Owned resume cleanup failed');
    }
    if (!entry.path && reserved.length) { entry.path = reserved[0].resume_path; save(); }
    if (entry.path && entry.ownsPath) {
      assert.equal(reserved.length, 1, 'Owned path has no reservation proof'); assert.equal(reserved[0].resume_path, entry.path, 'Owned path and reservation do not match');
      await query(`WITH retired AS (UPDATE public.resume_submission_reservations s SET status = 'superseded' WHERE submission_id = ${uuid(entry.submissionId)} AND resume_path = ${quoted(entry.path)} AND NOT EXISTS (SELECT 1 FROM public.resumes r WHERE r.resume_path = s.resume_path) RETURNING resume_path) INSERT INTO public.resume_file_cleanup(resume_path) SELECT resume_path FROM retired ON CONFLICT (resume_path) DO NOTHING RETURNING id;`);
    }
  }
  const paths = [...new Set(manifest.drafts.filter((entry) => entry.ownsPath && entry.path).map((entry) => entry.path))];
  if (paths.length) {
    assert.equal(config.allowFixtureCleanupLease, true, 'Canonical fixture cleanup must be enabled explicitly');
    for (let iteration = 0; iteration < 10; iteration++) {
      // ANY unowned claim aborts this entire SQL statement, rolling all claims back.
      // The cast depends on the row UUID, so the planner cannot fold a constant error.
      const claimed = await query(`WITH claims AS MATERIALIZED (SELECT * FROM public.claim_resume_file_cleanup(5)) SELECT c.id,c.resume_path,c.lease_token FROM claims c WHERE CASE WHEN EXISTS (SELECT 1 FROM claims x WHERE NOT (x.resume_path = ANY(${textArray(paths)}))) THEN ('unowned_cleanup_claim_' || c.id::text)::boolean ELSE true END;`);
      if (!claimed.length) break;
      for (const claim of claimed) {
        assert.ok(paths.includes(claim.resume_path), 'Refusing an unowned cleanup claim');
        const removed = await service.storage.from('resumes').remove([claim.resume_path]);
        assert.equal(removed.error, null, 'Owned Storage cleanup failed');
        assert.equal(await rpc(service, 'finish_resume_file_cleanup', { p_cleanup_id: claim.id, p_lease_token: claim.lease_token, p_success: true }), 'completed');
      }
    }
    const remaining = await query(`SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'resumes' AND name = ANY(${textArray(paths)}))::integer AS objects, (SELECT count(*) FROM public.resume_file_cleanup WHERE resume_path = ANY(${textArray(paths)}) AND status <> 'completed')::integer AS pending;`);
    assert.equal(remaining[0].objects, 0, 'Owned test PDF cleanup is incomplete'); assert.equal(remaining[0].pending, 0, 'Owned cleanup leases need a later fixture-only retry');
  }
  for (const account of manifest.accounts) {
    if (!account.id || !account.attempted) continue;
    const owner = await query(`SELECT email FROM auth.users WHERE id = ${uuid(account.id)};`);
    if (!owner.length) continue; assert.equal(owner[0].email, account.email);
    const result = await service.auth.admin.deleteUser(account.id); assert.equal(result.error, null, 'Owned Auth cleanup failed');
  }
  for (const company of manifest.companies) {
    assert.equal(company.name.startsWith(`Disposable SHPE recruiting smoke ${tag} `), true);
    if (!company.id && company.attempted) { const found = await query(`SELECT id FROM public.recruiting_companies WHERE name = ${quoted(company.name)};`); assert.ok(found.length <= 1); company.id = found[0]?.id || null; save(); }
    if (company.id) await query(`DELETE FROM public.recruiting_companies WHERE id = ${uuid(company.id)} AND name = ${quoted(company.name)} RETURNING id;`);
  }
  const left = await query(`SELECT (SELECT count(*) FROM public.resumes WHERE submission_id = ANY(${uuidArray(manifest.drafts.map((entry) => entry.submissionId))}))::integer AS resumes, (SELECT count(*) FROM auth.users WHERE id = ANY(${uuidArray(manifest.accounts.map((account) => account.id).filter(Boolean))}))::integer AS accounts, (SELECT count(*) FROM public.recruiting_companies WHERE id = ANY(${uuidArray(manifest.companies.map((company) => company.id).filter(Boolean))}))::integer AS companies;`);
  assert.equal(left[0].resumes, 0); assert.equal(left[0].accounts, 0); assert.equal(left[0].companies, 0);
  manifest.cleanupComplete = true; save();
}

let failure;
try {
  if (!cleanupManifest) {
    await invalidChallengeProbe();
    admin = await createAccount('admin', 'admin'); sponsorA = await createAccount('a', 'sponsor'); sponsorB = await createAccount('b', 'sponsor'); unrelated = await createAccount('unrelated', null);
    const companyA = await createCompany('Alpha'), companyB = await createCompany('Beta');
    await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: manifest.accounts[1].email, p_company_id: companyA.id, p_active: true });
    await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: manifest.accounts[2].email, p_company_id: companyB.id, p_active: true });
    assert.equal((await rpc(sponsorA, 'get_recruiter_context'))[0].company_id, companyA.id);
    assert.ok((await sponsorA.rpc('set_recruiting_membership', { p_recruiter_email: manifest.accounts[2].email, p_company_id: companyA.id })).error);
    assert.ok((await unrelated.rpc('get_recruiter_context')).error);
    assert.ok((await sponsorA.rpc('list_recruiter_resumes', { p_company_id: companyB.id })).error); check('Auth-roles-and-server-owned-company-scope');
    const first = draft('initial-v2', [companyA.id], `https://www.linkedin.com/in/synthetic-${tag}/`);
    await reserveAndQueue(first);
    assert.equal((await rpc(service, 'reserve_resume_submission', { p_submission_id: first.submissionId, p_submission_started_at: first.startedAt, p_fingerprint: first.fingerprint })).status, 'accepted');
    assert.equal((await rpc(service, 'reserve_resume_submission', { p_submission_id: first.submissionId, p_submission_started_at: first.startedAt, p_fingerprint: '0'.repeat(64) })).status, 'conflict');
    check('exact-retry-and-changed-fingerprint-conflict');
    await sign(admin, first, true); await sign(sponsorA, first, false); await sign(anonymous, first, false);
    for (const client of [anonymous, sponsorA, unrelated]) assert.ok(denied(await client.from('resume_company_interests').select('resume_id,company_id').in('resume_id', [first.resumeId])));
    check('private-preferences-and-pending-PDF-boundary');
    await approve(first); await sign(sponsorA, first, true);
    assert.equal((await book(sponsorA)).find((row) => row.id === first.resumeId)?.interested, true);
    assert.equal((await book(sponsorB)).find((row) => row.id === first.resumeId)?.interested, false);
    const second = draft('replacement-v2', [companyB.id], ''); await reserveAndQueue(second);
    assert.equal((await book(sponsorA)).find((row) => row.id === first.resumeId)?.interested, true); assert.equal((await book(sponsorB)).some((row) => row.id === second.resumeId), false);
    await approve(second); assert.equal((await book(sponsorB)).find((row) => row.id === second.resumeId)?.interested, true); await sign(sponsorA, first, false); check('approved-PDF-and-atomic-replacement-flags');
    const third = draft('legacy-replacement', [], '', true); await reserveAndQueue(third); await approve(third);
    assert.equal((await book(sponsorB)).find((row) => row.id === third.resumeId)?.interested, true); check('legacy-client-omission-preserves-approved-preferences');
    const fourth = draft('explicit-clear', [], ''); await reserveAndQueue(fourth); await approve(fourth);
    assert.equal((await book(sponsorB)).find((row) => row.id === fourth.resumeId)?.interested, false); check('explicit-empty-clears-only-at-approval');
    await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: manifest.accounts[1].email, p_company_id: companyA.id, p_active: false });
    assert.deepEqual(await rpc(sponsorA, 'get_recruiter_context'), []);
    assert.ok((await sponsorA.rpc('list_recruiter_resumes')).error);
    const baselineBookRead = await sponsorA.from('resumes').select('id').eq('id', fourth.resumeId);
    assert.equal(baselineBookRead.error, null); assert.equal(baselineBookRead.data.length, 1);
    const hidden = await admin.from('recruiting_companies').update({ active: false }).eq('id', companyA.id).select('id');
    assert.equal(hidden.error, null); assert.equal(hidden.data.length, 1);
    const hiddenRead = await anonymous.from('recruiting_companies').select('id').eq('id', companyA.id);
    assert.equal(hiddenRead.error, null); assert.equal(hiddenRead.data.length, 0);
    check('catalog-hiding-and-assignment-distinct-from-legacy-role-access');
    manifest.successfulProductionChallengeVerified = false;
    manifest.limit = 'Successful public Edge upload with a live Turnstile challenge was not run. Hosted queue/Auth/RLS/Storage/lifecycle were exercised directly; invalid challenge rejection was tested without bypassing production verification.';
    check('service-reservation-v2-queue-and-private-Storage');
  }
} catch (error) { failure = error; manifest.failure = String(error.message).split('\n')[0]; save(); }
try { await cleanOwned(); } catch (error) { failure ||= error; manifest.cleanupFailure = String(error.message).split('\n')[0]; save(); }
manifest.finishedAt = new Date().toISOString(); manifest.passed = !failure; save();
writeFileSync(resolve(runtime, 'result.json'), JSON.stringify({ passed: manifest.passed, cleanupComplete: manifest.cleanupComplete, projectRef: config.projectRef, checks: manifest.checks, invalidChallengeQuotaSnapshotUnchanged: manifest.invalidChallengeQuotaSnapshotUnchanged, successfulProductionChallengeVerified: manifest.successfulProductionChallengeVerified, limit: manifest.limit }, null, 2), { mode: 0o600 });
if (failure) { console.error('Hosted recruiting smoke did not complete. Credentials and payloads withheld; use its ignored manifest for bounded recovery.'); process.exitCode = 1; }
else console.log('Hosted recruiting checks passed and owned fixtures were cleaned. Live challenge acceptance remains a separate check.');

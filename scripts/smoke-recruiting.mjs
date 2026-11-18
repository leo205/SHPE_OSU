/* eslint-env node */
// Actual Auth/REST/Storage/Edge rehearsal against ONE disposable loopback project.
// This script never reads .env, accepts a target URL, or connects to hosted data.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(import.meta.dirname, '..');
const runtime = resolve(root, '.recruiting-local');
const api = 'http://127.0.0.1:55531';
const status = spawnSync(resolve(root, 'node_modules/.bin/supabase'), ['status', '--workdir', runtime, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (status.error || status.status !== 0) throw new Error('Disposable recruiting project is unavailable.');
const local = JSON.parse(status.stdout);
assert.equal(local.API_URL, api, 'Refusing a non-local recruiting target');
const client = () => createClient(api, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = client(), admin = client(), sponsorA = client(), sponsorB = client(), unmapped = client(), unrelated = client();
const service = createClient(api, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = 'LocalRecruitingReview2026!';
const origin = 'http://127.0.0.1:5175';
const runId = crypto.randomUUID().slice(0, 8);
const alphaEmail = `synthetic.recruiting.alpha.${runId}@osu.edu`;
const betaEmail = `synthetic.recruiting.beta.${runId}@osu.edu`;
const manifestFile = resolve(runtime, 'smoke-fixtures.json');
const fixtureIds = [];
let adminToken;

function fixturePdf(name, email) {
  const lines = ['LOCAL SYNTHETIC RECRUITING REHEARSAL', name, email, 'Mechanical Engineering - Class of 2028', 'Fictional experience and projects for local testing only.'];
  const stream = 'BT /F1 12 Tf 60 730 Td ' + lines.map((text, index) => `${index ? '0 -22 Td ' : ''}(${text.replace(/[\\()]/g, '\\$&')}) Tj`).join('\n') + '\nET\n';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let text = '%PDF-1.7\n% Synthetic local resume\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(text.length); text += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  text += `%${' '.repeat(Math.max(0, 11 * 1024 - text.length))}\n`;
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new File([text], 'synthetic-resume.pdf', { type: 'application/pdf' });
}

const denied = (result) => Boolean(result.error || (Array.isArray(result.data) && result.data.length === 0));
async function rpc(who, name, args = {}) {
  const result = await who.rpc(name, args);
  assert.equal(result.error, null, `${name} failed`);
  return result.data;
}
async function cleanup() {
  const response = await fetch(`${api}/functions/v1/cleanup-resume-files`, { method: 'POST', headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${adminToken}`, origin }, body: '{}' });
  assert.equal(response.status, 200, 'Local cleanup endpoint failed');
  return response.json();
}
async function book(who, companyId) {
  return rpc(who, 'list_recruiter_resumes', { p_offset: 0, p_limit: 1000, ...(companyId ? { p_company_id: companyId } : {}) });
}
function draft(name, email, companyIds, linkedinUrl = '', { legacy = false } = {}) {
  return {
    full_name: name, email, major: 'Mechanical Engineering', graduation_year: String(new Date().getUTCFullYear() + 2),
    submission_id: crypto.randomUUID(), submission_started_at: String(Date.now()),
    turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX', file: fixturePdf(name, email),
    ...(legacy ? {} : { company_ids: JSON.stringify(companyIds), linkedin_url: linkedinUrl }),
  };
}
async function submit(fields, expectedStatus = 200, expectedError) {
  const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const response = await fetch(`${api}/functions/v1/submit-resume`, { method: 'POST', headers: { apikey: local.ANON_KEY, origin }, body: form });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, `Local submit-resume returned ${body.error || 'unexpected status'}`);
  if (expectedError) assert.equal(body.error, expectedError); else assert.equal(body.status, 'accepted');
  if (expectedStatus !== 200) return null;
  const found = await admin.from('resumes').select('*').eq('submission_id', fields.submission_id).single();
  assert.equal(found.error, null, 'Accepted local submission has no metadata');
  if (!fixtureIds.includes(found.data.id)) { fixtureIds.push(found.data.id); writeFileSync(manifestFile, JSON.stringify(fixtureIds), { mode: 0o600 }); }
  return found.data;
}
async function approve(row) { assert.equal(await rpc(admin, 'approve_resume_submission', { p_resume_id: row.id }), 'accepted'); }
async function signed(who, row, allowed) {
  const result = await who.storage.from('resumes').createSignedUrl(row.resume_path, 60);
  if (!allowed) { assert.ok(result.error, 'Private pending/anonymous PDF was unexpectedly signed'); return; }
  assert.equal(result.error, null, 'Authorized PDF signing failed');
  assert.equal(new URL(result.data.signedUrl).origin, api, 'Refusing a non-local signed URL');
  const file = await fetch(result.data.signedUrl);
  assert.equal(file.status, 200, 'Signed PDF did not load');
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.ok(bytes.length >= 10240 && bytes.length <= 256000);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
}

for (const [who, email] of [[admin, 'recruiting-admin@example.test'], [sponsorA, 'recruiting-a@example.test'], [sponsorB, 'recruiting-b@example.test'], [unmapped, 'recruiting-unmapped@example.test'], [unrelated, 'recruiting-unrelated@example.test']]) {
  const result = await who.auth.signInWithPassword({ email, password });
  assert.equal(result.error, null, 'Synthetic local account login failed');
  if (who === admin) adminToken = result.data.session.access_token;
}
// Remove only explicitly recorded synthetic rows from this script's prior run.
if (existsSync(manifestFile)) {
  const previous = JSON.parse(readFileSync(manifestFile, 'utf8'));
  assert.ok(Array.isArray(previous) && previous.every((id) => /^[0-9a-f-]{36}$/.test(id)));
  for (const id of previous) {
    const existing = await admin.from('resumes').select('id,email,full_name').eq('id', id).maybeSingle();
    assert.equal(existing.error, null);
    if (!existing.data) continue;
    assert.ok(existing.data.email.startsWith('synthetic.recruiting.') && existing.data.full_name.startsWith('Synthetic Student '), 'Refusing to delete a row outside the synthetic fixture manifest');
    await rpc(admin, 'delete_resume_submission', { p_resume_id: id });
  }
  for (let attempt = 0; attempt < 10; attempt++) { if ((await cleanup()).status === 'complete') break; }
}
writeFileSync(manifestFile, '[]', { mode: 0o600 });

const catalog = await admin.from('recruiting_companies').select('id,name,active');
assert.equal(catalog.error, null);
const companies = [];
for (const name of ['Local Robotics', 'Local Energy']) {
  let company = catalog.data.find((row) => row.name === name);
  const result = company
    ? await admin.from('recruiting_companies').update({ active: true }).eq('id', company.id).select().single()
    : await admin.from('recruiting_companies').insert({ name, active: true }).select().single();
  assert.equal(result.error, null, 'Admin catalog mutation failed'); company = result.data; companies.push(company);
}
const [companyA, companyB] = companies;
await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: 'recruiting-a@example.test', p_company_id: companyA.id, p_active: true });
await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: 'recruiting-b@example.test', p_company_id: companyB.id, p_active: true });
assert.equal((await rpc(sponsorA, 'get_recruiter_context'))[0].company_id, companyA.id);
assert.equal((await rpc(sponsorB, 'get_recruiter_context'))[0].company_id, companyB.id);
assert.deepEqual(await rpc(unmapped, 'get_recruiter_context'), []);
assert.ok((await unmapped.rpc('list_recruiter_resumes')).error);
assert.ok((await unrelated.rpc('list_recruiter_resumes')).error);
assert.ok((await sponsorA.rpc('list_recruiter_resumes', { p_company_id: companyB.id })).error);
assert.ok((await sponsorA.rpc('set_recruiting_membership', { p_recruiter_email: 'recruiting-b@example.test', p_company_id: companyA.id })).error);
for (const who of [anonymous, sponsorA, unrelated]) {
  assert.ok(denied(await who.from('resume_company_interests').select('*')));
  assert.ok(denied(await who.from('recruiting_memberships').select('*')));
  assert.ok(denied(await who.from('recruiting_companies').insert({ name: `Denied ${runId}` }).select()));
}
assert.equal((await anonymous.from('resumes').insert({ full_name: 'Denied local upload', email: `synthetic.recruiting.denied.${runId}@osu.edu`, major: 'Mechanical Engineering', graduation_year: '2028', resume_path: `submissions/${Date.now()}_${crypto.randomUUID()}.pdf`, approved: false })).error?.code, '42501');
assert.ok((await anonymous.storage.from('resumes').upload(`denied-${runId}.pdf`, fixturePdf('Denied', 'denied@osu.edu'))).error);
const deniedQueue = { p_submission_id: crypto.randomUUID(), p_fingerprint: '0'.repeat(64), p_full_name: 'Denied local upload', p_email: `synthetic.recruiting.denied.${runId}@osu.edu`, p_major: 'Mechanical Engineering', p_graduation_year: '2028', p_resume_path: `submissions/${Date.now()}_${crypto.randomUUID()}.pdf`, p_linkedin_url: '', p_company_ids: [], p_linkedin_provided: true, p_company_interests_provided: true };
assert.equal((await anonymous.rpc('queue_resume_submission_v2', deniedQueue)).error?.code, '42501');
assert.equal((await sponsorA.rpc('queue_resume_submission_v2', deniedQueue)).error?.code, '42501');

const rejected = draft('Synthetic Student Rejected', `synthetic.recruiting.rejected.${runId}@osu.edu`, []);
await submit({ ...rejected, turnstile_token: 'invalid-local-token' }, 403, 'verification_failed');
const alphaDraft = draft('Synthetic Student Alpha', alphaEmail, [companyA.id], 'https://www.linkedin.com/in/synthetic-local-alpha/');
const alpha = await submit(alphaDraft);
assert.equal(alpha.approved, false);
await signed(admin, alpha, true); await signed(sponsorA, alpha, false); await signed(anonymous, alpha, false);
assert.ok(!(await book(sponsorA)).some((row) => row.id === alpha.id));
await approve(alpha);
await signed(sponsorA, alpha, true);
const betaDraft = draft('Synthetic Student Beta', betaEmail, [companyB.id]);
const beta = await submit(betaDraft); await approve(beta);
assert.equal((await book(sponsorA)).find((row) => row.id === alpha.id).interested, true);
assert.equal((await book(sponsorB)).find((row) => row.id === alpha.id).interested, false);
assert.equal((await book(sponsorB)).find((row) => row.id === beta.id).interested, true);
assert.ok((await book(sponsorA)).every((row) => !Object.hasOwn(row, 'company_ids')));

const revision = await submit(draft('Synthetic Student Alpha Revised', alphaEmail, [companyB.id], 'https://www.linkedin.com/in/synthetic-local-alpha-revised/'));
assert.equal((await book(sponsorA)).find((row) => row.email === alphaEmail).id, alpha.id, 'Pending replacement must keep the approved resume available');
assert.equal((await book(sponsorA)).find((row) => row.id === alpha.id).interested, true);
await signed(sponsorA, revision, false); await signed(admin, revision, true);
await approve(revision);
assert.equal((await book(sponsorA)).find((row) => row.email === alphaEmail).id, revision.id);
assert.equal((await book(sponsorA)).find((row) => row.id === revision.id).interested, false);
assert.equal((await book(sponsorB)).find((row) => row.id === revision.id).interested, true);
assert.equal((await book(sponsorB)).find((row) => row.id === revision.id).linkedin_url, revision.linkedin_url);
assert.deepEqual((await admin.from('resumes').select('id').eq('id', alpha.id)).data, []);

const legacy = await submit(draft('Synthetic Student Alpha', alphaEmail, [], '', { legacy: true }));
assert.equal(legacy.linkedin_url, revision.linkedin_url, 'An old form must preserve the approved profile');
await approve(legacy);
assert.equal((await book(sponsorB)).find((row) => row.id === legacy.id).interested, true, 'An old form must preserve approved interests');
const cleared = await submit(draft('Synthetic Student Alpha', alphaEmail, [], ''));
await approve(cleared);
assert.equal((await book(sponsorA)).find((row) => row.id === cleared.id).interested, false);
assert.equal((await book(sponsorB)).find((row) => row.id === cleared.id).interested, false);
assert.equal((await book(sponsorB)).find((row) => row.id === cleared.id).linkedin_url, null);

assert.equal((await admin.from('recruiting_companies').update({ active: false }).eq('id', companyB.id)).error, null);
assert.ok(!(await anonymous.from('recruiting_companies').select('id')).data.some((row) => row.id === companyB.id));
assert.equal((await rpc(sponsorB, 'get_recruiter_context'))[0].company_id, companyB.id, 'Hiding a catalog choice must not revoke existing recruiter assignment');
assert.equal((await book(sponsorB)).find((row) => row.id === beta.id).interested, true);
await submit(betaDraft); // Exact accepted retry still converges after catalog hide.
await submit({ ...betaDraft, company_ids: JSON.stringify([companyA.id]) }, 409, 'idempotency_conflict');
await submit(draft('Synthetic Student Stale', `synthetic.recruiting.stale.${runId}@osu.edu`, [companyB.id]), 400, 'company_choices_changed');
assert.equal((await admin.from('recruiting_companies').update({ active: true }).eq('id', companyB.id)).error, null);
const restored = await submit(draft('Synthetic Student Alpha', alphaEmail, [companyA.id], 'https://www.linkedin.com/in/synthetic-local-alpha/'));
await approve(restored);
const pending = await submit(draft('Synthetic Student Gamma', `synthetic.recruiting.gamma.${runId}@osu.edu`, [companyA.id, companyB.id]));

await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: 'recruiting-a@example.test', p_company_id: companyA.id, p_active: false });
assert.deepEqual(await rpc(sponsorA, 'get_recruiter_context'), []);
assert.ok((await sponsorA.rpc('list_recruiter_resumes')).error);
await rpc(admin, 'set_recruiting_membership', { p_recruiter_email: 'recruiting-a@example.test', p_company_id: companyA.id, p_active: true });
assert.equal((await book(admin, companyA.id)).find((row) => row.id === restored.id).interested, true);
for (let attempt = 0; attempt < 10; attempt++) { if ((await cleanup()).status === 'complete') break; }
await signed(sponsorA, alpha, false); // Retired PDF removed through the real cleanup worker.
assert.ok((await service.storage.from('resumes').download(alpha.resume_path)).error, 'The cleanup worker must physically remove the retired object');
await signed(sponsorA, restored, true); await signed(admin, pending, true);
const outcome = { passed: true, at: new Date().toISOString(), api, approvedFixtureIds: [restored.id, beta.id], pendingFixtureId: pending.id,
  checks: ['real Auth/REST/Storage/Edge', 'admin-only catalog and membership mutation', 'company-scoped interest flag', 'private raw preferences', 'anonymous and role-spoof denial', 'pending private PDF access', 'approval/replacement', 'legacy metadata preservation', 'explicit empty clearing', 'stale catalog and idempotency', 'cleanup and retired PDF denial'],
  limit: 'Official Turnstile test response is adapted only in the ignored localhost entry; production hostname/action checks remain unchanged and unit-tested.' };
writeFileSync(resolve(runtime, 'smoke-result.json'), JSON.stringify(outcome, null, 2) + '\n', { mode: 0o600 });
console.log('Local recruiting smoke passed: actual Auth/REST/Storage/Edge, protected submission, PDF permissions, approval/replacement, legacy preservation, own-company interests, admin catalog/membership controls, stale-choice/idempotency checks and cleanup.');
console.log('Two approved synthetic students and one pending synthetic student remain for UI review. Details: .recruiting-local/smoke-result.json.');
await Promise.all([admin, sponsorA, sponsorB, unmapped, unrelated].map((who) => who.auth.signOut()));

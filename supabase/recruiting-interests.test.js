import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const sql = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const ids = {
  admin: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  recruiterA: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recruiterA2: 'bbaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  recruiterB: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  unrelated: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  companyA: '11111111-1111-4111-8111-111111111111',
  companyB: '22222222-2222-4222-8222-222222222222',
  hidden: '33333333-3333-4333-8333-333333333333',
};
let db;
let sequence = 0;

async function role(databaseRole = 'postgres', appRole = null, userId = ids.admin, userRole = null) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId, app_metadata: { role: appRole }, user_metadata: { role: userRole } })]);
  await db.exec(`SET ROLE ${databaseRole}`);
}
async function rejected(query, values = [], code = '42501') {
  await db.exec('SAVEPOINT denied');
  let error;
  try { await db.query(query, values); } catch (failure) { error = failure; }
  await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied');
  expect(error, query).toBeDefined();
  expect(error.code).toBe(code);
}
async function scalar(query, values = []) { return Object.values((await db.query(query, values)).rows[0])[0]; }
async function fixture({ email = 'fixture@osu.edu', companyIds = [], linkedin = '', extension = true, linkedinProvided = true, companiesProvided = true, approve = false } = {}) {
  await role('service_role');
  const submissionId = `ffffffff-ffff-4fff-8fff-${String(++sequence).padStart(12, '0')}`;
  const started = Number(await scalar('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint'));
  const fingerprint = String(sequence % 10).repeat(64);
  const reservation = await scalar('SELECT public.reserve_resume_submission($1, $2, $3)', [submissionId, started, fingerprint]);
  expect(reservation.status).toBe('reserved');
  await role();
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('resumes',$1)", [reservation.resume_path]);
  await role('service_role');
  const args = [submissionId, fingerprint, 'Fictional Student', email, 'Mechanical Engineering', 'Alumni', reservation.resume_path];
  const result = extension
    ? await scalar('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...args, linkedin, companyIds, linkedinProvided, companiesProvided])
    : await scalar('SELECT public.queue_resume_submission($1,$2,$3,$4,$5,$6,$7)', args);
  expect(result).toBe('accepted');
  await role();
  const row = (await db.query('SELECT * FROM public.resumes WHERE submission_id=$1', [submissionId])).rows[0];
  if (approve) {
    await role('authenticated', 'admin');
    expect(await scalar('SELECT public.approve_resume_submission($1)', [row.id])).toBe('accepted');
    await role();
  }
  return { ...row, args, linkedin, companyIds, linkedinProvided, companiesProvided };
}

// These fixtures execute real PostgreSQL/RLS in memory, never a linked project.
describe('recruiting interests and revision compatibility in isolated PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE NOT NULL, raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(auth.jwt()->'app_metadata'->>'role'='admin',false) $$;
      CREATE FUNCTION public.is_sponsor() RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(auth.jwt()->'app_metadata'->>'role'='sponsor',false) $$;
      CREATE SCHEMA storage;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      INSERT INTO storage.buckets(id,public) VALUES ('resumes',false);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, UNIQUE(bucket_id,name));
      CREATE TABLE public.resumes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, email text NOT NULL, major text, graduation_year text, resume_path text NOT NULL, approved boolean NOT NULL DEFAULT false, uploaded_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, UPDATE, DELETE ON public.resumes TO authenticated;
      CREATE POLICY resumes_read ON public.resumes FOR SELECT TO authenticated USING (public.is_admin() OR (approved AND public.is_sponsor()));
      CREATE POLICY resumes_update ON public.resumes FOR UPDATE TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
      CREATE POLICY resumes_delete ON public.resumes FOR DELETE TO authenticated USING(public.is_admin());
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON storage.objects TO authenticated;
      CREATE POLICY private_resume_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='resumes' AND (public.is_admin() OR (public.is_sponsor() AND EXISTS(SELECT 1 FROM public.resumes r WHERE r.resume_path=name AND r.approved))));
    `);
    await db.exec(sql('./resume-edge-submit.sql'));
    await db.exec(sql('./resume-cleanup.sql'));
    await db.exec(sql('./recruiting-interests.sql'));
    await db.exec(sql('./recruiting-interests.sql'));
    expect(await scalar('SELECT count(*)::int FROM public.recruiting_companies')).toBe(0);
  }, 30_000);
  beforeEach(async () => {
    await role();
    await db.exec('BEGIN');
    for (const [key, email, appRole] of [['admin', 'admin@example.invalid', 'admin'], ['recruiterA', 'a@example.invalid', 'sponsor'], ['recruiterA2', 'a2@example.invalid', 'sponsor'], ['recruiterB', 'b@example.invalid', 'sponsor'], ['unrelated', 'other@example.invalid', null]]) {
      await db.query('INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ($1,$2,$3)', [ids[key], email, JSON.stringify({ role: appRole })]);
    }
    await db.query("INSERT INTO public.recruiting_companies(id,name,active) VALUES ($1,'Example A',true),($2,'Example B',true),($3,'Hidden Example',false)", [ids.companyA, ids.companyB, ids.hidden]);
    await role('authenticated', 'admin');
    for (const [email, company] of [['a@example.invalid', ids.companyA], ['a2@example.invalid', ids.companyA], ['b@example.invalid', ids.companyB]]) {
      await db.query('SELECT * FROM public.set_recruiting_membership($1,$2,true)', [email, company]);
    }
    await role();
  });
  afterEach(async () => { await db.exec('ROLLBACK'); await role(); });
  afterAll(async () => { await db?.close(); });

  it('publishes only active catalog choices anonymously and keeps writes/admin membership private', async () => {
    await role('anon');
    expect((await db.query('SELECT name FROM public.recruiting_companies ORDER BY name')).rows).toEqual([{ name: 'Example A' }, { name: 'Example B' }]);
    await rejected("INSERT INTO public.recruiting_companies(name) VALUES ('Unauthorized')");
    await rejected('SELECT * FROM public.resume_company_interests');
    await rejected('SELECT * FROM public.resume_recruiting_metadata');
    await rejected('SELECT * FROM public.get_recruiter_context()');
    await rejected('SELECT * FROM public.list_recruiter_resumes()');
    expect((await db.query('SELECT id,name,active FROM public.recruiting_companies WHERE id=$1', [ids.hidden])).rows).toEqual([]);
    await role('authenticated', null, ids.unrelated, 'admin');
    await rejected("INSERT INTO public.recruiting_companies(name) VALUES ('Self granted')");
    await rejected('SELECT * FROM public.list_recruiting_memberships()');
    await rejected('SELECT * FROM public.get_recruiter_context()');
    expect((await db.query('SELECT * FROM public.resume_company_interests')).rows).toEqual([]);
    await role('authenticated', 'admin');
    expect((await db.query('SELECT name FROM public.recruiting_companies')).rows).toHaveLength(3);
    await db.query("INSERT INTO public.recruiting_companies(name,active) VALUES ('Added Example',true)");
    await rejected('UPDATE public.recruiting_companies SET id=$1 WHERE id=$2', [ids.hidden, ids.companyA]);
    await rejected('DELETE FROM public.recruiting_companies WHERE id=$1', [ids.hidden]);
  });

  it('requires existing sponsor accounts for assignment and keeps other companies private', async () => {
    await role('authenticated', 'sponsor', ids.recruiterA);
    expect((await db.query('SELECT * FROM public.get_recruiter_context()')).rows).toEqual([{ company_id: ids.companyA, company_name: 'Example A' }]);
    await rejected('SELECT * FROM public.list_recruiting_memberships()');
    await rejected('SELECT * FROM public.set_recruiting_membership($1,$2)', ['a@example.invalid', ids.companyB]);
    await rejected('SELECT * FROM public.list_recruiter_resumes(0,1000,$1)', [ids.companyB]);
    await role('authenticated', 'admin');
    expect((await db.query('SELECT * FROM public.list_recruiting_memberships()')).rows).toHaveLength(3);
    await rejected('SELECT * FROM public.set_recruiting_membership($1,$2)', ['other@example.invalid', ids.companyA], '22023');
    await rejected('SELECT * FROM public.set_recruiting_membership($1,$2)', ['missing@example.invalid', ids.companyA], '22023');
    await db.query('SELECT * FROM public.set_recruiting_membership($1,$2,false)', ['a@example.invalid', ids.companyA]);
    await role('authenticated', 'sponsor', ids.recruiterA);
    expect((await db.query('SELECT * FROM public.get_recruiter_context()')).rows).toEqual([]);
    await rejected('SELECT * FROM public.list_recruiter_resumes()');
  });

  it('returns approved rows with only the assigned company flag, including other approved students', async () => {
    await fixture({ email: 'one@osu.edu', companyIds: [ids.companyA], linkedin: 'https://www.linkedin.com/in/fictional-one/', approve: true });
    await fixture({ email: 'two@osu.edu', companyIds: [ids.companyB], approve: true });
    await fixture({ email: 'pending@osu.edu', companyIds: [ids.companyA] });
    await role('authenticated', 'sponsor', ids.recruiterA);
    const rows = (await db.query('SELECT * FROM public.list_recruiter_resumes()')).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.email === 'one@osu.edu')).toMatchObject({ interested: true, linkedin_url: 'https://www.linkedin.com/in/fictional-one/', total_count: 2 });
    expect(rows.find(row => row.email === 'two@osu.edu')).toMatchObject({ interested: false });
    expect(rows.every(row => !('company_ids' in row))).toBe(true);
    expect((await db.query('SELECT * FROM public.resume_company_interests')).rows).toEqual([]);
    expect((await db.query('SELECT name FROM storage.objects')).rows).toHaveLength(2);
    await role('authenticated', 'sponsor', ids.recruiterA2);
    expect((await db.query('SELECT * FROM public.list_recruiter_resumes()')).rows).toEqual(rows);
    await role('authenticated', 'sponsor', ids.recruiterB);
    expect((await db.query('SELECT email,interested FROM public.list_recruiter_resumes()')).rows).toEqual(rows.map(row => ({ email: row.email, interested: !row.interested })));
    await role('authenticated', 'admin');
    expect((await db.query('SELECT * FROM public.list_recruiter_resumes(1,1,$1)', [ids.companyA])).rows).toHaveLength(1);
    await rejected('SELECT * FROM public.list_recruiter_resumes(-1,1000)', [], '22023');
    await rejected('SELECT * FROM public.list_recruiter_resumes(0,1001)', [], '22023');
  });

  it('keeps hidden choices in history without revoking an assigned company', async () => {
    const row = await fixture({ companyIds: [ids.companyA], approve: true });
    await role('authenticated', 'admin');
    await db.query('UPDATE public.recruiting_companies SET active=false WHERE id=$1', [ids.companyA]);
    await role('authenticated', 'sponsor', ids.recruiterA);
    expect((await db.query('SELECT * FROM public.get_recruiter_context()')).rows).toHaveLength(1);
    expect((await db.query('SELECT interested FROM public.list_recruiter_resumes()')).rows).toEqual([{ interested: true }]);
    await role('service_role');
    expect(await scalar('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...row.args, row.linkedin, row.companyIds, true, true])).toBe('accepted');
  });

  it('preserves approved metadata until replacement, and explicit empty choices clear on approval', async () => {
    const old = await fixture({ companyIds: [ids.companyA], linkedin: 'https://www.linkedin.com/in/fictional-old/', approve: true });
    const replacement = await fixture({ companyIds: [], linkedin: '' });
    await role('authenticated', 'sponsor', ids.recruiterA);
    expect((await db.query('SELECT id,interested,linkedin_url FROM public.list_recruiter_resumes()')).rows).toEqual([{ id: old.id, interested: true, linkedin_url: 'https://www.linkedin.com/in/fictional-old/' }]);
    await role('authenticated', 'admin');
    expect(await scalar('SELECT public.approve_resume_submission($1)', [replacement.id])).toBe('accepted');
    await role();
    expect((await db.query('SELECT * FROM public.resume_company_interests')).rows).toEqual([]);
    expect(await scalar('SELECT linkedin_url FROM public.resumes WHERE id=$1', [replacement.id])).toBe(null);
    expect(await scalar('SELECT count(*)::int FROM public.resume_file_cleanup WHERE resume_path=$1', [old.resume_path])).toBe(1);
  });

  it('inherits omitted fields for old clients and rebases omitted pending revisions on current approval', async () => {
    await fixture({ companyIds: [ids.companyA], linkedin: 'https://www.linkedin.com/in/fictional-old/', approve: true });
    const changed = await fixture({ companyIds: [ids.companyB], linkedin: 'https://www.linkedin.com/in/fictional-new/' });
    const legacy = await fixture({ extension: false });
    await role('authenticated', 'admin');
    expect(await scalar('SELECT public.approve_resume_submission($1)', [changed.id])).toBe('accepted');
    expect(await scalar('SELECT linkedin_url FROM public.resumes WHERE id=$1', [legacy.id])).toBe('https://www.linkedin.com/in/fictional-new/');
    expect((await db.query('SELECT company_id FROM public.resume_company_interests WHERE resume_id=$1', [legacy.id])).rows).toEqual([{ company_id: ids.companyB }]);
    expect(await scalar('SELECT public.approve_resume_submission($1)', [legacy.id])).toBe('accepted');
    expect((await db.query('SELECT company_id FROM public.resume_company_interests WHERE resume_id=$1', [legacy.id])).rows).toEqual([{ company_id: ids.companyB }]);
  });

  it('validates canonical profile URLs including encoded handles and rejects encoded delimiters', async () => {
    for (const value of [null, '', 'https://www.linkedin.com/in/example/', 'https://www.linkedin.com/in/jo%C3%B1/']) expect(await scalar('SELECT public.valid_resume_linkedin_url($1)', [value])).toBe(true);
    for (const value of ['https://www.linkedin.com.evil/in/example/', 'http://www.linkedin.com/in/example/', 'https://www.linkedin.com/in/a%2Fb/', 'https://www.linkedin.com/in/a%20b/', 'https://www.linkedin.com/in/a%0Ab/', 'https://www.linkedin.com/in/a%ZZ/', 'https://www.linkedin.com/in/a%C2%A0b/', 'https://www.linkedin.com/in/a%C2%80b/', 'https://www.linkedin.com/in/a/?query=1']) expect(await scalar('SELECT public.valid_resume_linkedin_url($1)', [value])).toBe(false);
  });

  it('rejects new hidden/unknown selections atomically and restricts the v2 queue to service', async () => {
    const row = await fixture();
    await role('authenticated', 'admin');
    await rejected('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...row.args, '', [], true, true]);
    await role('service_role');
    const submissionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const started = Number(await scalar('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint'));
    const fingerprint = 'f'.repeat(64);
    const reservation = await scalar('SELECT public.reserve_resume_submission($1,$2,$3)', [submissionId, started, fingerprint]);
    await role();
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('resumes',$1)", [reservation.resume_path]);
    await role('service_role');
    const args = [submissionId, fingerprint, 'Fictional Student', 'badchoices@osu.edu', 'Mechanical Engineering', 'Alumni', reservation.resume_path, '', [ids.hidden], true, true];
    expect(await scalar('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', args)).toBe('invalid_companies');
    await role();
    expect(await scalar('SELECT count(*)::int FROM public.resumes WHERE submission_id=$1', [submissionId])).toBe(0);
    expect(await scalar('SELECT status FROM public.resume_submission_reservations WHERE submission_id=$1', [submissionId])).toBe('reserved');
  });

  it('keeps omission independent for each field and cascades preferences through admin deletion', async () => {
    await fixture({ companyIds: [ids.companyA], linkedin: 'https://www.linkedin.com/in/fictional-old/', approve: true });
    const onlyLinkedin = await fixture({ companyIds: [], companiesProvided: false, linkedin: 'https://www.linkedin.com/in/fictional-new/' });
    await role('authenticated', 'admin');
    expect(await scalar('SELECT public.approve_resume_submission($1)', [onlyLinkedin.id])).toBe('accepted');
    expect((await db.query('SELECT company_id FROM public.resume_company_interests WHERE resume_id=$1', [onlyLinkedin.id])).rows).toEqual([{ company_id: ids.companyA }]);
    const onlyCompanies = await fixture({ companyIds: [ids.companyB], linkedin: '', linkedinProvided: false });
    await role('authenticated', 'admin');
    expect(await scalar('SELECT public.approve_resume_submission($1)', [onlyCompanies.id])).toBe('accepted');
    expect(await scalar('SELECT linkedin_url FROM public.resumes WHERE id=$1', [onlyCompanies.id])).toBe('https://www.linkedin.com/in/fictional-new/');
    expect(await scalar('SELECT public.delete_resume_submission($1)', [onlyCompanies.id])).toMatchObject({ status: 'deleted' });
    expect((await db.query('SELECT * FROM public.resume_company_interests')).rows).toEqual([]);
    await role();
    expect((await db.query('SELECT * FROM public.resume_recruiting_metadata')).rows).toEqual([]);
  });

  it('bounds and deduplicates selections without publishing invalid or partial metadata', async () => {
    const deduplicated = await fixture({ companyIds: [ids.companyA, ids.companyA] });
    expect((await db.query('SELECT company_id FROM public.resume_company_interests WHERE resume_id=$1', [deduplicated.id])).rows).toHaveLength(1);
    await role('service_role');
    const submissionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed';
    const started = Number(await scalar('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint'));
    const fingerprint = 'e'.repeat(64);
    const reservation = await scalar('SELECT public.reserve_resume_submission($1,$2,$3)', [submissionId, started, fingerprint]);
    const args = [submissionId, fingerprint, 'Fictional Student', 'boundaries@osu.edu', 'Mechanical Engineering', 'Alumni', reservation.resume_path, ''];
    expect(await scalar('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...args, Array(101).fill(ids.companyA), true, true])).toBe('invalid_submission');
    expect(await scalar('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...args, [null], true, true])).toBe('invalid_submission');
    expect(await scalar('SELECT public.queue_resume_submission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...args, ['99999999-9999-4999-8999-999999999999'], true, true])).toBe('invalid_companies');
    await role();
    expect(await scalar('SELECT count(*)::int FROM public.resumes WHERE submission_id=$1', [submissionId])).toBe(0);
  });

  it('detects complete membership pagination and rejects ambiguous recruiter identities', async () => {
    await role('authenticated', 'admin');
    const page = (await db.query('SELECT * FROM public.list_recruiting_memberships(1,1)')).rows;
    expect(page).toHaveLength(1);
    expect(page[0].total_count).toBe(3);
    await rejected('SELECT * FROM public.list_recruiting_memberships(0,1001)', [], '22023');
    await role();
    await db.query("INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','A@EXAMPLE.INVALID',$1)", [JSON.stringify({ role: 'sponsor' })]);
    await role('authenticated', 'admin');
    await rejected('SELECT * FROM public.set_recruiting_membership($1,$2)', ['a@example.invalid', ids.companyA], '22023');
  });

});

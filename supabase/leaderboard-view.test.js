import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('./leaderboard-view.sql', import.meta.url), 'utf8');
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const boardMembers = [
  { first_name: 'Fixture Board A', member_key: 'fixtureboard.11', count: 22 },
  { first_name: 'Fixture Board B', member_key: 'fixturebirch.21', count: 21 },
  { first_name: 'Fixture Board C', member_key: 'fixturecedar.31', count: 20 },
];
const eligibleMembers = Array.from({ length: 12 }, (_, index) => ({
  first_name: `Fixture Member ${String(index + 1).padStart(2, '0')}`,
  // The first eligible member deliberately shares an excluded member's surname.
  member_key: index === 0 ? 'fixtureboard.12' : `fixturemember.${index + 101}`,
  count: 19 - index,
}));
let db;

async function role(name = 'postgres', appRole = null, userRole = null) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({
    sub: actorId, app_metadata: { role: appRole }, user_metadata: { role: userRole },
  })]);
  await db.exec(`SET ROLE ${name}`);
}

async function rejected(statement, values = [], code = '42501') {
  await db.exec('SAVEPOINT expected_failure');
  let failure;
  try { await db.query(statement, values); } catch (error) { failure = error; }
  await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure');
  expect(failure, `Expected PostgreSQL rejection: ${statement}`).toBeDefined();
  expect(Array.isArray(code) ? code : [code]).toContain(failure.code);
}

async function insertAttendance(rows) {
  await db.query(`INSERT INTO public.attendance(first_name, last_name_dotnum, event_name)
    SELECT first_name, last_name_dotnum, event_name
    FROM jsonb_to_recordset($1::jsonb)
      AS fixture(first_name text, last_name_dotnum text, event_name text)`, [JSON.stringify(rows)]);
}

function checkIns(member) {
  const variants = [member.member_key, member.member_key.toUpperCase(), ` ${member.member_key} `];
  return Array.from({ length: member.count }, (_, index) => ({
    first_name: member.first_name,
    last_name_dotnum: variants[index % variants.length],
    event_name: `Fixture Event ${index + 1}`,
  }));
}

function publicEntry(member) {
  return {
    first_name: member.first_name,
    last_initial: member.member_key[0].toUpperCase(),
    count: member.count,
  };
}

async function exclude(memberKeys = boardMembers.map(({ member_key }) => member_key)) {
  await role('authenticated', 'admin');
  for (const key of memberKeys) {
    await db.query('INSERT INTO public.leaderboard_exclusions(member_key) VALUES ($1)', [key]);
  }
}

async function leaderboard() {
  return (await db.query('SELECT * FROM public.leaderboard')).rows;
}

async function exclusions() {
  return (await db.query('SELECT * FROM public.leaderboard_exclusions ORDER BY member_key')).rows;
}

async function attendanceStats() {
  return (await db.query(`SELECT lower(btrim(last_name_dotnum)) AS member_key,
    max(first_name) AS first_name, count(*)::int AS check_ins,
    count(DISTINCT lower(btrim(event_name)))::int AS distinct_events
    FROM public.attendance GROUP BY lower(btrim(last_name_dotnum))
    ORDER BY member_key`)).rows;
}

async function privileges(table) {
  return (await db.query(`SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY grantee, privilege_type`, [table])).rows;
}

describe('leaderboard exclusions in isolated PostgreSQL', () => {
  beforeAll(async () => {
    // Only synthetic attendance in in-memory PostgreSQL. No environment files,
    // credentials, external requests, or real Supabase instances are involved.
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE unrelated_role NOLOGIN;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, unrelated_role;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS
        $$ SELECT coalesce(auth.jwt()->'app_metadata'->>'role' = 'admin', false) $$;
      -- Exercise revocation of the broad defaults Supabase can give new tables
      -- and views; the canonical SQL must establish its own explicit grants.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON TABLES TO anon, authenticated, service_role;
      CREATE TABLE public.attendance (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        first_name text, last_name_dotnum text, event_name text
      );
      ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.attendance FROM PUBLIC, anon, authenticated;
      GRANT SELECT ON public.attendance TO authenticated;
      GRANT ALL ON public.attendance TO service_role;
      CREATE POLICY attendance_admin_read ON public.attendance
        FOR SELECT TO authenticated USING (public.is_admin());
    `);
    await insertAttendance([...boardMembers, ...eligibleMembers].flatMap(checkIns));
    await db.exec(migration);
  }, 30_000);

  beforeEach(async () => { await role(); await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK'); await role(); });
  afterAll(async () => { await db?.close(); });

  it('refills the database top ten after removing all excluded highest scorers', async () => {
    await role('anon');
    expect(await leaderboard()).toEqual([...boardMembers, ...eligibleMembers].slice(0, 10).map(publicEntry));

    await exclude();
    await role('anon');
    expect(await leaderboard()).toEqual(eligibleMembers.slice(0, 10).map(publicEntry));
    expect(await leaderboard()).toHaveLength(10);
  });

  it('matches every case/outer-space variant exactly without excluding a different dot number', async () => {
    await exclude(['fixtureboard.11']);
    await role('anon');
    const rows = await leaderboard();
    expect(rows.some(({ first_name }) => first_name === 'Fixture Board A')).toBe(false);
    expect(rows).toContainEqual(publicEntry(eligibleMembers[0]));

    await role('authenticated', 'admin');
    expect((await db.query(`SELECT DISTINCT last_name_dotnum FROM public.attendance
      WHERE lower(btrim(last_name_dotnum)) = 'fixtureboard.11'
      ORDER BY last_name_dotnum`)).rows).toHaveLength(3);
    expect((await db.query(`SELECT count(*)::int AS n FROM public.attendance
      WHERE lower(btrim(last_name_dotnum)) = 'fixtureboard.11'`)).rows).toEqual([{ n: 22 }]);
  });

  it('keeps distinct normalized events and deterministic first-name/member-key tie ordering', async () => {
    await db.exec('DELETE FROM public.attendance');
    await insertAttendance([
      ...['Fixture Meeting', ' fixture meeting ', 'FIXTURE MEETING', 'Fixture Other', ' fixture other ', null]
        .map((event_name, index) => ({
          first_name: 'alpha', last_name_dotnum: index % 2 ? ' TIEFIXTURE.3 ' : 'tiefixture.3', event_name,
        })),
      ...['afixture.7', 'zfixture.7'].flatMap((last_name_dotnum) => [
        { first_name: 'Bravo', last_name_dotnum, event_name: 'Fixture Meeting' },
        { first_name: 'Bravo', last_name_dotnum, event_name: 'Fixture Other' },
      ]),
      ...checkIns({ first_name: 'Fixture Higher', member_key: 'higherfixture.5', count: 3 }),
      { first_name: null, last_name_dotnum: 'invalidfixture.1', event_name: 'Fixture Meeting' },
      { first_name: 'Fixture Missing Key', last_name_dotnum: null, event_name: 'Fixture Meeting' },
      { first_name: 'Fixture Blank Key', last_name_dotnum: ' ', event_name: 'Fixture Meeting' },
    ]);
    await role('anon');
    expect(await leaderboard()).toEqual([
      { first_name: 'Fixture Higher', last_initial: 'H', count: 3 },
      { first_name: 'alpha', last_initial: 'T', count: 2 },
      { first_name: 'Bravo', last_initial: 'A', count: 2 },
      { first_name: 'Bravo', last_initial: 'Z', count: 2 },
    ]);
  });

  it('keeps attendance and admin reporting unchanged while administrators add/remove exclusions', async () => {
    await role('authenticated', 'admin');
    const attendanceBefore = (await db.query('SELECT * FROM public.attendance ORDER BY id')).rows;
    const statsBefore = await attendanceStats();
    await exclude();
    expect(await exclusions()).toHaveLength(3);
    expect((await db.query('SELECT * FROM public.attendance ORDER BY id')).rows).toEqual(attendanceBefore);
    expect(await attendanceStats()).toEqual(statsBefore);
    expect((await db.query('DELETE FROM public.leaderboard_exclusions RETURNING member_key')).rows)
      .toHaveLength(3);
    expect(await exclusions()).toEqual([]);
    expect(await attendanceStats()).toEqual(statsBefore);
    await role('anon');
    expect(await leaderboard()).toEqual([...boardMembers, ...eligibleMembers].slice(0, 10).map(publicEntry));
  });

  it('can exclude a future member before their first check-in and include them again after removal', async () => {
    const future = { first_name: 'Fixture Future Board', member_key: 'futurefixture.401', count: 30 };
    await exclude([future.member_key]);
    expect((await db.query('SELECT count(*)::int AS n FROM public.attendance WHERE last_name_dotnum = $1',
      [future.member_key])).rows).toEqual([{ n: 0 }]);
    await role('anon');
    const before = await leaderboard();
    await role('service_role');
    await insertAttendance(checkIns(future));
    await role('anon');
    expect(await leaderboard()).toEqual(before);
    await role('authenticated', 'admin');
    expect((await db.query('DELETE FROM public.leaderboard_exclusions WHERE member_key = $1 RETURNING member_key',
      [future.member_key])).rows).toEqual([{ member_key: future.member_key }]);
    await role('anon');
    expect((await leaderboard())[0]).toEqual(publicEntry(future));
  });

  it('enforces bounded normalized unique keys and a default timestamp, with no UPDATE grant', async () => {
    await role('authenticated', 'admin');
    expect(await exclusions()).toEqual([]);
    const key = 'canonicalfixture.501';
    const saved = (await db.query('INSERT INTO public.leaderboard_exclusions(member_key) VALUES ($1) RETURNING *',
      [key])).rows[0];
    expect(saved.member_key).toBe(key);
    expect(new Date(saved.created_at).getTime()).not.toBeNaN();
    for (const invalid of ['', ' ', ' Canonicalfixture.501 ', 'CANONICALFIXTURE.501', 'canonicalfixture.501 ', 'x'.repeat(101)]) {
      await rejected('INSERT INTO public.leaderboard_exclusions(member_key) VALUES ($1)', [invalid], '23514');
    }
    await rejected('INSERT INTO public.leaderboard_exclusions(member_key) VALUES (NULL)', [], '23502');
    await rejected('INSERT INTO public.leaderboard_exclusions(member_key) VALUES ($1)', [key], '23505');
    await rejected('UPDATE public.leaderboard_exclusions SET member_key = $1', ['replacementfixture.501']);
    await rejected('TRUNCATE public.leaderboard_exclusions');
    expect(await exclusions()).toEqual([saved]);
  });

  it('denies nonadmin reads and mutations, including sponsor and forged user_metadata admin roles', async () => {
    await exclude();
    const saved = await exclusions();
    const board = await leaderboard();
    await role();
    // A permissive policy must not reopen the private list; the restrictive
    // admin guard still applies when PostgreSQL combines all eligible policies.
    await db.exec(`CREATE POLICY fixture_permissive_access ON public.leaderboard_exclusions
      FOR ALL TO PUBLIC USING (true) WITH CHECK (true)`);
    for (const [appRole, userRole] of [[null, null], ['sponsor', null], ['recruiter', null], [null, 'admin'], ['Admin', null]]) {
      await role('authenticated', appRole, userRole);
      expect(await exclusions()).toEqual([]);
      await rejected('INSERT INTO public.leaderboard_exclusions(member_key) VALUES ($1)', ['forbiddenfixture.601']);
      await rejected('UPDATE public.leaderboard_exclusions SET member_key = $1', ['forbiddenfixture.602']);
      expect((await db.query('DELETE FROM public.leaderboard_exclusions RETURNING member_key')).rows).toEqual([]);
      expect(await leaderboard()).toEqual(board);
      expect((await db.query('SELECT * FROM public.attendance')).rows).toEqual([]);
      // Verify durable state with an authorized reader; a zero-row DELETE alone
      // does not demonstrate that the private records were preserved.
      await role('authenticated', 'admin');
      expect(await exclusions()).toEqual(saved);
    }
  });

  it('exposes only three read-only public view columns and denies anonymous raw/private access', async () => {
    expect((await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leaderboard'
      ORDER BY ordinal_position`)).rows).toEqual([
      { column_name: 'first_name' }, { column_name: 'last_initial' }, { column_name: 'count' },
    ]);
    expect((await db.query(`SELECT pg_get_userbyid(relowner) AS owner, reloptions
      FROM pg_class WHERE oid = 'public.leaderboard'::regclass`)).rows)
      .toEqual([{ owner: 'postgres', reloptions: ['security_invoker=false'] }]);
    expect((await db.query(`SELECT relrowsecurity AS enabled
      FROM pg_class WHERE oid = 'public.leaderboard_exclusions'::regclass`)).rows)
      .toEqual([{ enabled: true }]);
    for (const [dbRole, appRole] of [['anon', null], ['authenticated', null], ['authenticated', 'admin']]) {
      await role(dbRole, appRole);
      expect(await leaderboard()).toHaveLength(10);
      for (const column of ['member_key', 'last_name_dotnum', 'dotnum', 'created_at']) {
        await rejected(`SELECT ${column} FROM public.leaderboard`, [], '42703');
      }
      expect((await db.query(`SELECT
        has_table_privilege(current_user, 'public.leaderboard', 'INSERT') AS can_insert,
        has_table_privilege(current_user, 'public.leaderboard', 'UPDATE') AS can_update,
        has_table_privilege(current_user, 'public.leaderboard', 'DELETE') AS can_delete`)).rows)
        .toEqual([{ can_insert: false, can_update: false, can_delete: false }]);
      for (const statement of [
        "INSERT INTO public.leaderboard(first_name, last_initial, count) VALUES ('Fixture Write', 'F', 999)",
        "UPDATE public.leaderboard SET first_name = 'Fixture Write'",
        'DELETE FROM public.leaderboard',
      ]) {
        // PostgreSQL may reject aggregate-view writes during query rewriting,
        // before reaching the ACL check. Both paths deny the attempted write.
        await rejected(statement, [], ['42501', '55000']);
      }
    }
    await role('anon', 'admin');
    for (const statement of [
      'SELECT * FROM public.attendance',
      'SELECT * FROM public.leaderboard_exclusions',
      "INSERT INTO public.leaderboard_exclusions(member_key) VALUES ('anonymousfixture.701')",
      "UPDATE public.leaderboard_exclusions SET member_key = 'anonymousfixture.702'",
      'DELETE FROM public.leaderboard_exclusions',
    ]) await rejected(statement);
    await role('unrelated_role');
    await rejected('SELECT * FROM public.leaderboard');
    await rejected('SELECT * FROM public.leaderboard_exclusions');
  });

  it('preserves exclusions, public output and explicit privileges when canonical SQL is replayed', async () => {
    await exclude();
    const saved = await exclusions();
    const board = await leaderboard();
    await role();
    const exclusionPrivileges = await privileges('leaderboard_exclusions');
    const leaderboardPrivileges = await privileges('leaderboard');
    expect(leaderboardPrivileges.filter(({ grantee }) => ['anon', 'authenticated'].includes(grantee)))
      .toEqual([
        { grantee: 'anon', privilege_type: 'SELECT' },
        { grantee: 'authenticated', privilege_type: 'SELECT' },
      ]);
    expect(exclusionPrivileges.filter(({ grantee }) => grantee === 'authenticated')).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'INSERT' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ]);
    expect(exclusionPrivileges.filter(({ grantee }) => grantee === 'service_role')).toEqual(expect.arrayContaining(
      ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
        .map((privilege_type) => ({ grantee: 'service_role', privilege_type })),
    ));
    expect(exclusionPrivileges.some(({ grantee }) => ['PUBLIC', 'anon'].includes(grantee))).toBe(false);
    // Preserve the enclosing test rollback boundary while executing the actual
    // canonical migration statements, twice, rather than a rewritten fixture.
    const replay = migration.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
    await db.exec(replay);
    await db.exec(replay);
    expect(await exclusions()).toEqual(saved);
    expect(await leaderboard()).toEqual(board);
    expect(await privileges('leaderboard_exclusions')).toEqual(exclusionPrivileges);
    expect(await privileges('leaderboard')).toEqual(leaderboardPrivileges);
    await role('anon');
    expect(await leaderboard()).toEqual(board);
    await rejected('SELECT * FROM public.leaderboard_exclusions');
  });
});

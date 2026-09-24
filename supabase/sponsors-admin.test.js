import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('./sponsors-admin.sql', import.meta.url), 'utf8');
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seedId = '682a1b3d-7f16-4d4c-9409-000000000002';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const assetPath = `logos/${assetId}.png`;
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
  expect(failure.code).toBe(code);
}

async function reserve(id = assetId) {
  await role('service_role');
  const result = await db.query('SELECT public.reserve_sponsor_asset($1, $2, $3, $4) AS path',
    [id, 'png', 'image/png', 100]);
  expect(result.rows).toEqual([{ path: `logos/${id}.png` }]);
  await role();
}

async function upload(id = assetId) {
  await db.query(`INSERT INTO storage.objects(bucket_id, name, metadata)
    VALUES ('sponsor-assets', $1, '{"mimetype":"image/png","size":100}')`, [`logos/${id}.png`]);
}

async function ready(id = assetId) {
  await reserve(id);
  await upload(id);
  await role('service_role');
  expect((await db.query('SELECT public.complete_sponsor_asset($1) AS path', [id])).rows)
    .toEqual([{ path: `logos/${id}.png` }]);
  await role();
}

async function ageAssets() {
  await role();
  await db.exec("UPDATE public.sponsor_assets SET created_at = now() - interval '25 hours'");
}

async function claim(limit = 5) {
  await role('service_role');
  return (await db.query('SELECT * FROM public.claim_sponsor_asset_cleanup($1)', [limit])).rows;
}

async function pendingCount() {
  await role('service_role');
  return (await db.query('SELECT public.pending_sponsor_asset_cleanup_count() AS count')).rows[0].count;
}

describe('sponsor listing and asset SQL in isolated PostgreSQL', () => {
  beforeAll(async () => {
    // Real PostgreSQL in memory, synthetic users/objects only. No credentials,
    // network requests, local Supabase, or production data are involved.
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
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT (auth.jwt()->>'sub')::uuid $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS
        $$ SELECT coalesce(auth.jwt()->'app_metadata'->>'role' = 'admin', false) $$;
      CREATE SCHEMA storage;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]
      );
      CREATE TABLE storage.objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb,
        UNIQUE(bucket_id, name)
      );
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO anon, authenticated, service_role;
      -- Intentionally permissive pre-existing policy: the new restrictive
      -- sponsor guards must override it without changing other buckets.
      CREATE POLICY legacy_broad_access ON storage.objects FOR ALL TO public USING (true) WITH CHECK (true);
      CREATE POLICY legacy_broad_bucket_access ON storage.buckets FOR ALL TO public USING (true) WITH CHECK (true);
      INSERT INTO storage.buckets VALUES ('resumes', 'resumes', false, 256000, ARRAY['application/pdf']);
      CREATE TABLE public.company_access (id integer PRIMARY KEY, sentinel text);
      INSERT INTO public.company_access VALUES (1, 'unchanged');
      ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_company_admin ON public.company_access TO authenticated USING (public.is_admin());
    `);
    await db.exec(migration);
    await db.exec(migration);
  }, 30_000);

  beforeEach(async () => { await role(); await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK'); await role(); });
  afterAll(async () => { await db?.close(); });

  it('seeds the exact five names, logo paths and tier order, once', async () => {
    const result = await db.query(`SELECT name, tier_key, logo_path, display_order,
      status, academic_year, website_url FROM public.sponsors ORDER BY id`);
    expect(result.rows).toEqual([
      ['Lincoln Electric', 'scarlet-gray', '/photos/sponsors/lincolnElectric.webp', 0],
      ['Honda', 'carmen', '/photos/sponsors/honda.webp', 0],
      ['Burns & McDonnell', 'carmen', '/photos/sponsors/burnsMcDonnell.webp', 1],
      ['Whiting-Turner', 'carmen', '/photos/sponsors/wtLogo.jpg', 2],
      ['Gresham Smith', 'buckeye', '/photos/sponsors/greshamSmith.webp', 0],
    ].map(([name, tier_key, logo_path, display_order]) => ({
      name, tier_key, logo_path, display_order, status: 'published', academic_year: null, website_url: null,
    })));
    expect((await db.query('SELECT count(*)::int AS n FROM public.sponsor_audit')).rows).toEqual([{ n: 5 }]);
  });

  it('restricts published, draft and archived reads for anonymous, roleless, recruiter and admin users', async () => {
    await role('authenticated', 'admin');
    await db.exec("INSERT INTO public.sponsors(name, tier_key) VALUES ('Draft', 'platinum')");
    await db.query("UPDATE public.sponsors SET status = 'archived' WHERE id = $1", [seedId]);
    for (const [dbRole, appRole, expectedCount] of [
      ['anon', null, 4], ['authenticated', null, 4], ['authenticated', 'sponsor', 4],
      ['authenticated', 'recruiter', 4], ['authenticated', 'admin', 6],
    ]) {
      await role(dbRole, appRole);
      expect((await db.query('SELECT count(*)::int AS n FROM public.sponsors')).rows).toEqual([{ n: expectedCount }]);
      if (appRole !== 'admin') {
        await rejected("INSERT INTO public.sponsors(name, tier_key) VALUES ('Forbidden', 'carmen')");
        if (dbRole === 'authenticated') {
          expect((await db.query("UPDATE public.sponsors SET name = 'Forbidden' WHERE id = $1 RETURNING id", [seedId])).rows).toEqual([]);
          expect((await db.query('SELECT * FROM public.sponsor_audit')).rows).toEqual([]);
          expect((await db.query('SELECT * FROM public.sponsor_assets')).rows).toEqual([]);
        } else {
          await rejected('SELECT * FROM public.sponsor_audit');
          await rejected('SELECT * FROM public.sponsor_assets');
        }
      }
    }
    await role('authenticated', null, 'admin');
    await rejected("INSERT INTO public.sponsors(name, tier_key) VALUES ('Forged role', 'carmen')");
    expect((await db.query('SELECT count(*)::int AS n FROM public.sponsors')).rows).toEqual([{ n: 4 }]);
  });

  it('enforces bounded display fields and HTTPS links inside PostgreSQL', async () => {
    await role('authenticated', 'admin');
    for (const name of ['', ' ', ' leading', 'trailing ', 'x'.repeat(151), 'bad\nname', 'bad\u0085name']) {
      await rejected('INSERT INTO public.sponsors(name, tier_key) VALUES ($1, $2)', [name, 'carmen'], '23514');
    }
    for (const website of [
      'http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com',
      'https://user@example.com', 'https://example.com\n', 'https://exa mple.com',
      'https://example.com\\@evil.com', 'https://example.com:65536', 'https://example.com:0',
      'https://example.com/\u0085', `https://example.com/${'a'.repeat(2048)}`,
    ]) await rejected('UPDATE public.sponsors SET website_url = $1 WHERE id = $2', [website, seedId], '23514');
    for (const year of ['1899-1900', '2201-2202', '2025-2027', '25-26', '2026/2027']) {
      await rejected('UPDATE public.sponsors SET academic_year = $1 WHERE id = $2', [year, seedId], '23514');
    }
    for (const [field, value] of [['tier_key', 'gold'], ['status', 'deleted'], ['display_order', -1], ['display_order', 10000]]) {
      await rejected(`UPDATE public.sponsors SET ${field} = $1 WHERE id = $2`, [value, seedId], '23514');
    }
    await db.query(`UPDATE public.sponsors SET website_url = 'https://example.com:443/a?q=ok#brand',
      academic_year = '2026-2027', display_order = 9999 WHERE id = $1`, [seedId]);
  });

  it('uses server versions/timestamps, detects a stale version and records immutable actor history', async () => {
    await role('authenticated', 'admin');
    const initial = (await db.query('SELECT * FROM public.sponsors WHERE id = $1', [seedId])).rows[0];
    const saved = (await db.query(`UPDATE public.sponsors SET name = 'Honda updated'
      WHERE id = $1 AND version = $2 RETURNING *`, [seedId, initial.version])).rows[0];
    expect(saved.version).toBe(2);
    expect(saved.created_at).toEqual(initial.created_at);
    expect(new Date(saved.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(initial.updated_at).getTime());
    expect((await db.query(`UPDATE public.sponsors SET name = 'Stale change'
      WHERE id = $1 AND version = $2 RETURNING *`, [seedId, initial.version])).rows).toEqual([]);
    const audit = (await db.query(`SELECT * FROM public.sponsor_audit
      WHERE sponsor_id = $1 AND action = 'UPDATE'`, [seedId])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: actorId, before_record: { name: 'Honda', version: 1 },
      after_record: { name: 'Honda updated', version: 2 } });
    for (const statement of [
      'UPDATE public.sponsors SET version = 90', "UPDATE public.sponsors SET created_at = now()",
      'UPDATE public.sponsors SET updated_at = now()', 'UPDATE public.sponsors SET id = gen_random_uuid()',
      'DELETE FROM public.sponsors', 'DELETE FROM public.sponsor_audit',
      'UPDATE public.sponsor_audit SET actor_id = NULL',
      "INSERT INTO public.sponsors(name,tier_key,version) VALUES ('Forged', 'carmen', 100)",
      "INSERT INTO public.sponsor_audit(sponsor_id,action,after_record) VALUES (gen_random_uuid(),'INSERT','{}')",
    ]) await rejected(statement);
    await role();
    await rejected("INSERT INTO public.sponsor_audit(sponsor_id,action,after_record) VALUES (gen_random_uuid(),'INSERT','{}')", [], '23503');
  });

  it('never overwrites edited or archived seeds when the migration is rerun', async () => {
    await role('authenticated', 'admin');
    await db.query("UPDATE public.sponsors SET name = 'Honda renewed', status = 'archived' WHERE id = $1", [seedId]);
    await role();
    // Keep the actual migration statements inside this test's rollback boundary.
    await db.exec(migration.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''));
    expect((await db.query('SELECT name, status, version FROM public.sponsors WHERE id = $1', [seedId])).rows)
      .toEqual([{ name: 'Honda renewed', status: 'archived', version: 2 }]);
    expect((await db.query('SELECT count(*)::int AS n FROM public.sponsor_audit')).rows).toEqual([{ n: 6 }]);
    await role('authenticated', 'admin');
    await db.query("UPDATE public.sponsors SET status = 'published' WHERE id = $1 AND version = 2", [seedId]);
    await role('anon');
    expect((await db.query('SELECT name FROM public.sponsors WHERE id = $1', [seedId])).rows).toEqual([{ name: 'Honda renewed' }]);
  });

  it('requires a verified, uploaded registry asset or an exact migrated local logo', async () => {
    await reserve();
    await role('authenticated', 'admin');
    for (const path of [assetPath, '/photos/sponsors/other.webp', '/photos/sponsors/honda.webp?x=1',
      'https://example.com/logo.png', 'logos/../../image.png', 'logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg']) {
      await rejected('UPDATE public.sponsors SET logo_path = $1 WHERE id = $2', [path, seedId], '23514');
    }
    await role('service_role');
    await rejected('SELECT public.complete_sponsor_asset($1)', [assetId], '23514');
    await role();
    await upload();
    await db.exec("UPDATE storage.objects SET metadata = '{\"mimetype\":\"image/jpeg\",\"size\":100}'");
    await role('service_role');
    await rejected('SELECT public.complete_sponsor_asset($1)', [assetId], '23514');
    await role();
    await db.exec("UPDATE storage.objects SET metadata = '{\"mimetype\":\"image/png\",\"size\":100}'");
    await role('service_role');
    await db.query('SELECT public.complete_sponsor_asset($1)', [assetId]);
    await role('authenticated', 'admin');
    await db.query('UPDATE public.sponsors SET logo_path = $1 WHERE id = $2', [assetPath, seedId]);
    expect((await db.query('SELECT last_attached_at FROM public.sponsor_assets WHERE id = $1', [assetId])).rows[0].last_attached_at).toBeTruthy();
  });

  it('keeps current, archived and historical asset references out of cleanup', async () => {
    await ready();
    await role('authenticated', 'admin');
    await db.query('UPDATE public.sponsors SET logo_path = $1 WHERE id = $2', [assetPath, seedId]);
    await ageAssets();
    expect(await claim()).toEqual([]);
    expect(await pendingCount()).toBe(0);
    await role('authenticated', 'admin');
    await db.query("UPDATE public.sponsors SET status = 'archived' WHERE id = $1", [seedId]);
    expect(await claim()).toEqual([]);
    expect(await pendingCount()).toBe(0);
    await role('authenticated', 'admin');
    await db.query('UPDATE public.sponsors SET logo_path = NULL WHERE id = $1', [seedId]);
    expect(await claim()).toEqual([]);
    expect(await pendingCount()).toBe(0);
  });

  it('tracks failed uploads, leases only after 24 hours and fences attachment after claim', async () => {
    await reserve();
    expect(await claim()).toEqual([]);
    expect(await pendingCount()).toBe(0);
    await ageAssets();
    expect(await pendingCount()).toBe(1);
    const claimed = await claim();
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id: assetId, path: assetPath });
    expect(await claim()).toEqual([]);
    expect(await pendingCount()).toBe(1);
    await role();
    await upload();
    await role('service_role');
    await rejected('SELECT public.complete_sponsor_asset($1)', [assetId], '23514');
    await role('authenticated', 'admin');
    await rejected('UPDATE public.sponsors SET logo_path = $1 WHERE id = $2', [assetPath, seedId], '23514');
    await role('service_role');
    expect((await db.query('SELECT public.finish_sponsor_asset_cleanup($1,$2,true) AS status',
      [assetId, actorId])).rows).toEqual([{ status: 'retry' }]);
    expect((await db.query('SELECT public.finish_sponsor_asset_cleanup($1,$2,true) AS status',
      [assetId, claimed[0].lease_token])).rows).toEqual([{ status: 'retry' }]);
    expect(await claim()).toEqual([]);
    expect(await pendingCount()).toBe(1);
    await role();
    await db.exec("UPDATE public.sponsor_assets SET next_attempt_at = now() - interval '1 minute'");
    const retried = await claim();
    expect(retried[0].lease_token).not.toBe(claimed[0].lease_token);
    await role();
    await db.exec("DELETE FROM storage.objects WHERE bucket_id = 'sponsor-assets'");
    await role('service_role');
    expect((await db.query('SELECT public.finish_sponsor_asset_cleanup($1,$2,true) AS status',
      [assetId, retried[0].lease_token])).rows).toEqual([{ status: 'completed' }]);
    expect(await pendingCount()).toBe(0);
    await rejected('SELECT public.reserve_sponsor_asset($1,$2,$3,$4)', [assetId, 'png', 'image/png', 100], '23505');
    await rejected('SELECT public.complete_sponsor_asset($1)', [assetId], '23514');
    await role();
    expect((await db.query('SELECT state FROM public.sponsor_assets WHERE id = $1', [assetId])).rows).toEqual([{ state: 'deleted' }]);
    // A late upload cannot resurrect the asset; its retained tombstone is
    // eligible again so a later explicit cleanup pass can delete those bytes.
    await upload();
    expect(await pendingCount()).toBe(1);
    expect(await claim()).toHaveLength(1);
  });

  it('fences a previously ready but unused logo before any cleanup Storage deletion', async () => {
    await ready();
    expect(await pendingCount()).toBe(0);
    await ageAssets();
    expect(await pendingCount()).toBe(1);
    const [leased] = await claim();
    expect(leased.path).toBe(assetPath);
    await role('authenticated', 'admin');
    await rejected('UPDATE public.sponsors SET logo_path = $1 WHERE id = $2', [assetPath, seedId], '23514');
    await role('service_role');
    await rejected('SELECT public.complete_sponsor_asset($1)', [assetId], '23514');
    expect((await db.query('SELECT public.finish_sponsor_asset_cleanup($1,$2,false) AS status',
      [assetId, leased.lease_token])).rows).toEqual([{ status: 'retry' }]);
    await role('authenticated', 'admin');
    // A failed deletion retains the fence even after the lease is released.
    await rejected('UPDATE public.sponsors SET logo_path = $1 WHERE id = $2', [assetPath, seedId], '23514');
  });

  it('reclaims expired leases with new tokens and caps each batch at five', async () => {
    for (let i = 1; i <= 7; i += 1) await reserve(`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`);
    await ageAssets();
    const first = await claim(999);
    expect(first).toHaveLength(5);
    expect(await claim()).toHaveLength(2);
    await role();
    await db.exec("UPDATE public.sponsor_assets SET lease_expires_at = now() - interval '1 minute'");
    const recovered = await claim(1);
    expect(recovered).toHaveLength(1);
    const staleToken = first.find((row) => row.id === recovered[0].id).lease_token;
    expect(staleToken).not.toBe(recovered[0].lease_token);
    expect((await db.query('SELECT public.finish_sponsor_asset_cleanup($1,$2,true) AS status',
      [recovered[0].id, staleToken])).rows).toEqual([{ status: 'retry' }]);
    await role();
    expect((await db.query('SELECT lease_token FROM public.sponsor_assets WHERE id = $1', [recovered[0].id])).rows)
      .toEqual([{ lease_token: recovered[0].lease_token }]);
  });

  it('denies every browser role the service RPCs and direct registry mutations', async () => {
    const signatures = [
      ['reserve_sponsor_asset(uuid,text,text,integer)', 'SELECT public.reserve_sponsor_asset($1, $2, $3, $4)', [assetId, 'png', 'image/png', 100]],
      ['complete_sponsor_asset(uuid)', 'SELECT public.complete_sponsor_asset($1)', [assetId]],
      ['claim_sponsor_asset_cleanup(integer)', 'SELECT * FROM public.claim_sponsor_asset_cleanup(5)', []],
      ['finish_sponsor_asset_cleanup(uuid,uuid,boolean)', 'SELECT public.finish_sponsor_asset_cleanup($1,$2,true)', [assetId, actorId]],
      ['pending_sponsor_asset_cleanup_count()', 'SELECT public.pending_sponsor_asset_cleanup_count()', []],
    ];
    for (const [dbRole, appRole] of [['anon', null], ['authenticated', null], ['authenticated', 'sponsor'], ['authenticated', 'admin'], ['unrelated_role', null]]) {
      await role(dbRole, appRole);
      for (const [signature, statement, args] of signatures) {
        expect((await db.query('SELECT has_function_privilege(current_user, $1, $2) AS allowed', [`public.${signature}`, 'EXECUTE'])).rows)
          .toEqual([{ allowed: false }]);
        await rejected(statement, args);
      }
      await rejected("UPDATE public.sponsor_assets SET state = 'ready'");
      await rejected('DELETE FROM public.sponsor_assets');
    }
    await role('service_role');
    await rejected('UPDATE public.sponsor_assets SET size_bytes = 1');
    for (const args of [[assetId, 'svg', 'image/svg+xml', 100], [assetId, 'png', 'image/jpeg', 100],
      [assetId, 'png', 'image/png', 0], [assetId, 'png', 'image/png', 2097153], [null, 'png', 'image/png', 1]]) {
      await rejected('SELECT public.reserve_sponsor_asset($1,$2,$3,$4)', args, '22023');
    }
    await role();
    const functions = await db.query(`SELECT proname, prosecdef, proconfig FROM pg_proc
      WHERE proname IN ('prepare_sponsor_write', 'audit_sponsor_write', 'reserve_sponsor_asset',
        'complete_sponsor_asset', 'claim_sponsor_asset_cleanup', 'finish_sponsor_asset_cleanup',
        'pending_sponsor_asset_cleanup_count')`);
    expect(functions.rows).toHaveLength(7);
    for (const fn of functions.rows) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toEqual(['search_path=""']);
    }
  });

  it('blocks all direct sponsor bucket browser writes despite a broad legacy Storage policy', async () => {
    await upload();
    await db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES ('resumes','sentinel.pdf')");
    for (const [dbRole, appRole] of [['anon', null], ['authenticated', null], ['authenticated', 'sponsor'], ['authenticated', 'admin']]) {
      await role(dbRole, appRole);
      await rejected("INSERT INTO storage.objects(bucket_id,name) VALUES ('sponsor-assets','bypass.png')");
      expect((await db.query("UPDATE storage.objects SET name = 'overwritten.png' WHERE bucket_id = 'sponsor-assets' RETURNING id")).rows).toEqual([]);
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'sponsor-assets' RETURNING id")).rows).toEqual([]);
      await rejected("UPDATE storage.objects SET bucket_id = 'sponsor-assets' WHERE bucket_id = 'resumes'");
      expect((await db.query("UPDATE storage.buckets SET file_size_limit = 99999999 WHERE id = 'sponsor-assets' RETURNING id")).rows).toEqual([]);
      expect((await db.query("DELETE FROM storage.buckets WHERE id = 'sponsor-assets' RETURNING id")).rows).toEqual([]);
      await rejected("INSERT INTO storage.buckets(id,name) VALUES ('sponsor-assets','bypass')");
      expect((await db.query("UPDATE storage.objects SET name = 'sentinel.pdf' WHERE bucket_id = 'resumes' RETURNING id")).rows).toHaveLength(1);
    }
    await role('service_role');
    expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'sponsor-assets' RETURNING name")).rows).toEqual([{ name: assetPath }]);
    await role();
    expect((await db.query("SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'sponsor-assets'")).rows)
      .toEqual([{ public: true, file_size_limit: 2097152, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'] }]);
    expect((await db.query("SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'resumes'")).rows)
      .toEqual([{ public: false, file_size_limit: 256000, allowed_mime_types: ['application/pdf'] }]);
    expect((await db.query('SELECT * FROM public.company_access')).rows).toEqual([{ id: 1, sentinel: 'unchanged' }]);
    expect((await db.query("SELECT policyname FROM pg_policies WHERE policyname IN ('legacy_broad_access','legacy_broad_bucket_access','legacy_company_admin') ORDER BY policyname")).rows)
      .toEqual([{ policyname: 'legacy_broad_access' }, { policyname: 'legacy_broad_bucket_access' }, { policyname: 'legacy_company_admin' }]);
  });
});

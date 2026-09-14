import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const sql = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('executes the resume lifecycle and cleanup regressions in isolated PostgreSQL', async () => {
  // PGlite is a real PostgreSQL runtime in memory. No credentials, remote DB,
  // student data, network service, or Storage API are involved in this test.
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
        SET search_path = '' AS
        $$ SELECT coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false) $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]
      );
      INSERT INTO storage.buckets (id, public) VALUES ('resumes', false);
      CREATE TABLE storage.objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
        UNIQUE(bucket_id, name)
      );
      CREATE TABLE public.resumes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL,
        email text NOT NULL, major text, graduation_year text,
        resume_path text NOT NULL, approved boolean NOT NULL DEFAULT false,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      );
      SET shpe.test_database = 'true';
    `);
    await db.exec(sql('./resume-edge-submit.sql'));
    await db.exec(sql('./resume-cleanup.sql'));
    // A rerun must preserve safe permissions/triggers and existing API shapes.
    await db.exec(sql('./resume-cleanup.sql'));
    await db.exec(sql('./tests/resume-cleanup.sql'));
    const result = await db.query('SELECT count(*)::integer AS count FROM public.resume_file_cleanup');
    expect(result.rows).toEqual([{ count: 0 }]);
  } finally {
    await db.close();
  }
}, 30_000);

-- Release 1: admin-managed public sponsor listings. NOT APPLIED TO PRODUCTION.
-- Apply this additive migration before manage-sponsor-assets and its frontend.
-- Requires the existing public.is_admin(), auth.uid(), and Supabase Storage.
-- Does not alter recruiter access, student data, or other buckets/policies.
-- Assets are public branding, including draft/archived logos. Keep audit rows
-- and deleted registry tombstones: neither may be pruned to reclaim storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sponsor_assets (
  id uuid PRIMARY KEY,
  path text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  state text NOT NULL DEFAULT 'uploading'
    CHECK (state IN ('uploading', 'ready', 'retiring', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  ready_at timestamptz,
  last_attached_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT sponsor_asset_path_matches_identity CHECK (
    (content_type = 'image/png' AND path = 'logos/' || id::text || '.png')
    OR (content_type = 'image/jpeg' AND path = 'logos/' || id::text || '.jpg')
    OR (content_type = 'image/webp' AND path = 'logos/' || id::text || '.webp')
  ),
  CONSTRAINT sponsor_asset_lease_consistent CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (state = 'retiring' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION public.valid_sponsor_website_url(p_url text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE
  v_port text;
BEGIN
  IF p_url IS NULL THEN RETURN true; END IF;
  IF pg_catalog.char_length(p_url) > 2048
     OR p_url ~ '[[:space:][:cntrl:]]' OR p_url ~ U&'[\0080-\009f]'
     OR pg_catalog.strpos(p_url, pg_catalog.chr(92)) > 0
     OR p_url !~ '^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(:[0-9]{1,5})?([/?#].*)?$'
  THEN RETURN false; END IF;
  v_port := pg_catalog.substring(p_url, '^https://[^/?#:]+:([0-9]+)');
  RETURN v_port IS NULL OR v_port::integer BETWEEN 1 AND 65535;
END;
$function$;

REVOKE ALL ON FUNCTION public.valid_sponsor_website_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_sponsor_website_url(text)
  TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.sponsors (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CHECK (
    pg_catalog.char_length(name) BETWEEN 1 AND 150
    AND name = pg_catalog.btrim(name) AND name !~ '[[:cntrl:]]' AND name !~ U&'[\0080-\009f]'
  ),
  tier_key text NOT NULL CHECK (tier_key IN ('platinum', 'scarlet-gray', 'carmen', 'buckeye')),
  logo_path text,
  website_url text CHECK (public.valid_sponsor_website_url(website_url)),
  academic_year text CHECK (
    academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    AND pg_catalog.substring(academic_year, 1, 4)::integer BETWEEN 1900 AND 2200
    AND pg_catalog.substring(academic_year, 6, 4)::integer =
        pg_catalog.substring(academic_year, 1, 4)::integer + 1
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 9999),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS sponsors_public_order_idx
  ON public.sponsors (tier_key, display_order, id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.sponsor_audit (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id),
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE')),
  actor_id uuid,
  changed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  before_record jsonb,
  after_record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsor_audit_sponsor_idx ON public.sponsor_audit (sponsor_id, changed_at);
CREATE INDEX IF NOT EXISTS sponsor_audit_before_logo_idx ON public.sponsor_audit ((before_record->>'logo_path'));
CREATE INDEX IF NOT EXISTS sponsor_audit_after_logo_idx ON public.sponsor_audit ((after_record->>'logo_path'));
CREATE INDEX IF NOT EXISTS sponsor_assets_cleanup_idx ON public.sponsor_assets (next_attempt_at, created_at);

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsors, public.sponsor_assets, public.sponsor_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sponsors TO anon, authenticated;
GRANT INSERT (id, name, tier_key, logo_path, website_url, academic_year, status, display_order)
  ON public.sponsors TO authenticated;
GRANT UPDATE (name, tier_key, logo_path, website_url, academic_year, status, display_order)
  ON public.sponsors TO authenticated;
GRANT SELECT ON public.sponsor_assets, public.sponsor_audit TO authenticated;

DROP POLICY IF EXISTS sponsors_read ON public.sponsors;
CREATE POLICY sponsors_read ON public.sponsors FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.is_admin());
DROP POLICY IF EXISTS sponsors_admin_insert ON public.sponsors;
CREATE POLICY sponsors_admin_insert ON public.sponsors FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS sponsors_admin_update ON public.sponsors;
CREATE POLICY sponsors_admin_update ON public.sponsors FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS sponsor_assets_admin_read ON public.sponsor_assets;
CREATE POLICY sponsor_assets_admin_read ON public.sponsor_assets FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS sponsor_audit_admin_read ON public.sponsor_audit;
CREATE POLICY sponsor_audit_admin_read ON public.sponsor_audit FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.prepare_sponsor_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_asset_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'sponsor_id_immutable' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.version := OLD.version + 1;
  ELSE
    NEW.created_at := pg_catalog.clock_timestamp();
    NEW.version := 1;
  END IF;
  NEW.updated_at := pg_catalog.clock_timestamp();

  IF NEW.logo_path IS NOT NULL AND NEW.logo_path NOT IN (
    '/photos/sponsors/lincolnElectric.webp', '/photos/sponsors/honda.webp',
    '/photos/sponsors/burnsMcDonnell.webp', '/photos/sponsors/wtLogo.jpg',
    '/photos/sponsors/greshamSmith.webp'
  ) THEN
    -- The registry is the authority, not a caller-provided URL or MIME label.
    -- Updating this row locks it AND changes its tuple, fencing cleanup even
    -- for callers using repeatable-read snapshots. Cleanup cannot transition
    -- it to retiring concurrently with an attachment/audit-history write.
    UPDATE public.sponsor_assets SET last_attached_at = pg_catalog.clock_timestamp()
    WHERE path = NEW.logo_path AND state = 'ready'
    RETURNING id INTO v_asset_id;
    IF v_asset_id IS NULL THEN
      RAISE EXCEPTION 'sponsor_logo_not_ready' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_sponsor_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.sponsor_audit (sponsor_id, action, actor_id, before_record, after_record)
  VALUES (NEW.id, TG_OP, auth.uid(),
    CASE WHEN TG_OP = 'UPDATE' THEN pg_catalog.to_jsonb(OLD) ELSE NULL END,
    pg_catalog.to_jsonb(NEW));
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_sponsor_write(), public.audit_sponsor_write()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS sponsors_prepare_write ON public.sponsors;
CREATE TRIGGER sponsors_prepare_write BEFORE INSERT OR UPDATE ON public.sponsors
  FOR EACH ROW EXECUTE FUNCTION public.prepare_sponsor_write();
DROP TRIGGER IF EXISTS sponsors_audit_write ON public.sponsors;
CREATE TRIGGER sponsors_audit_write AFTER INSERT OR UPDATE ON public.sponsors
  FOR EACH ROW EXECUTE FUNCTION public.audit_sponsor_write();

CREATE OR REPLACE FUNCTION public.reserve_sponsor_asset(
  p_asset_id uuid, p_extension text, p_content_type text, p_size integer
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_path text;
BEGIN
  IF p_asset_id IS NULL OR p_extension IS NULL OR p_content_type IS NULL OR p_size IS NULL
    OR p_size NOT BETWEEN 1 AND 2097152
    OR NOT ((p_extension = 'png' AND p_content_type = 'image/png')
      OR (p_extension = 'jpg' AND p_content_type = 'image/jpeg')
      OR (p_extension = 'webp' AND p_content_type = 'image/webp'))
  THEN RAISE EXCEPTION 'invalid_sponsor_asset' USING ERRCODE = '22023'; END IF;
  v_path := 'logos/' || p_asset_id::text || '.' || p_extension;
  -- No upsert: a UUID/path is permanently reserved, including after deletion.
  INSERT INTO public.sponsor_assets (id, path, content_type, size_bytes)
  VALUES (p_asset_id, v_path, p_content_type, p_size);
  RETURN v_path;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_sponsor_asset(p_asset_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_asset public.sponsor_assets%ROWTYPE;
BEGIN
  SELECT * INTO v_asset FROM public.sponsor_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND OR v_asset.state NOT IN ('uploading', 'ready') THEN
    RAISE EXCEPTION 'sponsor_asset_not_uploading' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS o
    WHERE o.bucket_id = 'sponsor-assets' AND o.name = v_asset.path
      AND o.metadata->>'mimetype' = v_asset.content_type
      AND o.metadata->>'size' = v_asset.size_bytes::text
  ) THEN RAISE EXCEPTION 'sponsor_asset_upload_missing' USING ERRCODE = '23514'; END IF;
  UPDATE public.sponsor_assets SET state = 'ready', ready_at = coalesce(ready_at, pg_catalog.clock_timestamp())
  WHERE id = p_asset_id;
  RETURN v_asset.path;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_sponsor_asset_cleanup(p_limit integer DEFAULT 5)
RETURNS TABLE (id uuid, path text, lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_asset public.sponsor_assets%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_count integer := 0;
BEGIN
  FOR v_asset IN
    SELECT a.* FROM public.sponsor_assets AS a
    WHERE (
      (a.state IN ('uploading', 'ready') AND a.created_at < v_now - interval '24 hours')
      OR (a.state = 'retiring' AND a.next_attempt_at <= v_now
        AND (a.lease_expires_at IS NULL OR a.lease_expires_at <= v_now))
      -- A timed-out upload may arrive after deletion; retain its tombstone and
      -- reclaim that object without ever allowing its path to be attached.
      OR (a.state = 'deleted' AND EXISTS (
        SELECT 1 FROM storage.objects AS o
        WHERE o.bucket_id = 'sponsor-assets' AND o.name = a.path
      ))
    )
    ORDER BY a.next_attempt_at, a.created_at, a.id
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    -- Recheck in a separate statement AFTER acquiring the registry row lock.
    -- An attaching transaction committed just before the lock must be visible.
    IF EXISTS (SELECT 1 FROM public.sponsors AS s WHERE s.logo_path = v_asset.path)
      OR EXISTS (SELECT 1 FROM public.sponsor_audit AS h
        WHERE h.before_record->>'logo_path' = v_asset.path
           OR h.after_record->>'logo_path' = v_asset.path)
    THEN CONTINUE; END IF;
    RETURN QUERY UPDATE public.sponsor_assets AS a
    SET state = 'retiring', attempts = a.attempts + 1,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_expires_at = v_now + interval '2 minutes', deleted_at = NULL
    WHERE a.id = v_asset.id RETURNING a.id, a.path, a.lease_token;
    v_count := v_count + 1;
    EXIT WHEN v_count >= greatest(1, least(coalesce(p_limit, 5), 5));
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_sponsor_asset_cleanup(
  p_asset_id uuid, p_lease_token uuid, p_success boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_asset public.sponsor_assets%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_asset FROM public.sponsor_assets
  WHERE id = p_asset_id AND state = 'retiring' AND lease_token = p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RETURN 'retry'; END IF;
  IF p_success IS TRUE AND NOT EXISTS (
    SELECT 1 FROM storage.objects AS o WHERE o.bucket_id = 'sponsor-assets' AND o.name = v_asset.path
  ) THEN
    UPDATE public.sponsor_assets SET state = 'deleted', deleted_at = v_now,
      lease_token = NULL, lease_expires_at = NULL WHERE id = p_asset_id;
    RETURN 'completed';
  END IF;
  UPDATE public.sponsor_assets SET lease_token = NULL, lease_expires_at = NULL,
    next_attempt_at = v_now + pg_catalog.make_interval(secs =>
      least(3600, 30 * (2 ^ least(v_asset.attempts - 1, 7))::integer))
  WHERE id = p_asset_id;
  RETURN 'retry';
END;
$function$;

CREATE OR REPLACE FUNCTION public.pending_sponsor_asset_cleanup_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  -- Pending includes another worker's lease and retry backoff, even when this
  -- pass cannot claim anything. Young uploads are normal work, not cleanup.
  SELECT pg_catalog.count(*)::integer
  FROM public.sponsor_assets AS a
  WHERE (
    (a.state IN ('uploading', 'ready')
      AND a.created_at < pg_catalog.statement_timestamp() - interval '24 hours')
    OR a.state = 'retiring'
    OR (a.state = 'deleted' AND EXISTS (
      SELECT 1 FROM storage.objects AS o
      WHERE o.bucket_id = 'sponsor-assets' AND o.name = a.path
    ))
  )
  AND NOT EXISTS (SELECT 1 FROM public.sponsors AS s WHERE s.logo_path = a.path)
  AND NOT EXISTS (SELECT 1 FROM public.sponsor_audit AS h
    WHERE h.before_record->>'logo_path' = a.path OR h.after_record->>'logo_path' = a.path);
$function$;

REVOKE ALL ON FUNCTION public.reserve_sponsor_asset(uuid, text, text, integer),
  public.complete_sponsor_asset(uuid), public.claim_sponsor_asset_cleanup(integer),
  public.finish_sponsor_asset_cleanup(uuid, uuid, boolean), public.pending_sponsor_asset_cleanup_count()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sponsor_asset(uuid, text, text, integer),
  public.complete_sponsor_asset(uuid), public.claim_sponsor_asset_cleanup(integer),
  public.finish_sponsor_asset_cleanup(uuid, uuid, boolean), public.pending_sponsor_asset_cleanup_count() TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sponsor-assets', 'sponsor-assets', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets') AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Storage RLS must be enabled before sponsor migration';
  END IF;
END;
$block$;

-- Restrictive policies AND with existing permissive policies. A broad legacy
-- admin or public policy cannot bypass these bucket-specific guards. Other
-- buckets keep exactly their existing permissions. Service Storage uses its
-- existing BYPASSRLS role; browsers (including admins) cannot mutate this bucket.
DROP POLICY IF EXISTS sponsor_assets_browser_insert_guard ON storage.objects;
CREATE POLICY sponsor_assets_browser_insert_guard ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id <> 'sponsor-assets');
DROP POLICY IF EXISTS sponsor_assets_browser_update_guard ON storage.objects;
CREATE POLICY sponsor_assets_browser_update_guard ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'sponsor-assets') WITH CHECK (bucket_id <> 'sponsor-assets');
DROP POLICY IF EXISTS sponsor_assets_browser_delete_guard ON storage.objects;
CREATE POLICY sponsor_assets_browser_delete_guard ON storage.objects AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (bucket_id <> 'sponsor-assets');

-- Apply the same protection to bucket settings so an unrelated broad bucket
-- policy cannot let a browser remove the bucket or change its size/MIME limits.
DROP POLICY IF EXISTS sponsor_bucket_browser_insert_guard ON storage.buckets;
CREATE POLICY sponsor_bucket_browser_insert_guard ON storage.buckets AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (id <> 'sponsor-assets');
DROP POLICY IF EXISTS sponsor_bucket_browser_update_guard ON storage.buckets;
CREATE POLICY sponsor_bucket_browser_update_guard ON storage.buckets AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (id <> 'sponsor-assets') WITH CHECK (id <> 'sponsor-assets');
DROP POLICY IF EXISTS sponsor_bucket_browser_delete_guard ON storage.buckets;
CREATE POLICY sponsor_bucket_browser_delete_guard ON storage.buckets AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (id <> 'sponsor-assets');

-- Stable identities make reruns harmless: never overwrite edits or resurrect
-- an archived sponsor. Unknown websites and academic years stay unset.
INSERT INTO public.sponsors (id, name, tier_key, logo_path, status, display_order) VALUES
  ('682a1b3d-7f16-4d4c-9409-000000000001', 'Lincoln Electric', 'scarlet-gray', '/photos/sponsors/lincolnElectric.webp', 'published', 0),
  ('682a1b3d-7f16-4d4c-9409-000000000002', 'Honda', 'carmen', '/photos/sponsors/honda.webp', 'published', 0),
  ('682a1b3d-7f16-4d4c-9409-000000000003', 'Burns & McDonnell', 'carmen', '/photos/sponsors/burnsMcDonnell.webp', 'published', 1),
  ('682a1b3d-7f16-4d4c-9409-000000000004', 'Whiting-Turner', 'carmen', '/photos/sponsors/wtLogo.jpg', 'published', 2),
  ('682a1b3d-7f16-4d4c-9409-000000000005', 'Gresham Smith', 'buckeye', '/photos/sponsors/greshamSmith.webp', 'published', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;

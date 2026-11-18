-- Recruiting preferences and LinkedIn, additive to the existing private resume lifecycle.
-- Apply after resume-edge-submit.sql and resume-cleanup.sql, then deploy the
-- compatible submit-resume handler, then the frontend. No company/account seed.
-- Catalog availability, company assignment and sponsor-role book entitlement
-- are separate: hiding a catalog choice never revokes a sponsor's existing role.
BEGIN;

CREATE OR REPLACE FUNCTION public.valid_resume_linkedin_url(p_url text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
DECLARE
  v_profile text;
  v_decoded text;
  v_bytes bytea := ''::bytea;
  v_index integer := 1;
  v_character text;
BEGIN
  IF p_url IS NULL OR p_url = '' THEN RETURN true; END IF;
  IF pg_catalog.length(p_url) > 2048 THEN RETURN false; END IF;
  v_profile := pg_catalog.substring(p_url, '^https://www\.linkedin\.com/in/([^/]+)/$');
  IF v_profile IS NULL OR v_profile ~ '[[:space:][:cntrl:]\\?#]' THEN RETURN false; END IF;
  WHILE v_index <= pg_catalog.length(v_profile) LOOP
    v_character := pg_catalog.substr(v_profile, v_index, 1);
    IF v_character = '%' THEN
      v_character := pg_catalog.substr(v_profile, v_index + 1, 2);
      IF v_character !~ '^[0-9a-fA-F]{2}$' THEN RETURN false; END IF;
      v_bytes := v_bytes || pg_catalog.decode(v_character, 'hex');
      v_index := v_index + 3;
    ELSE
      v_bytes := v_bytes || pg_catalog.convert_to(v_character, 'UTF8');
      v_index := v_index + 1;
    END IF;
  END LOOP;
  v_decoded := pg_catalog.convert_from(v_bytes, 'UTF8');
  IF v_decoded = '' OR v_decoded ~ '[[:space:][:cntrl:]/\\?#]' OR v_decoded ~ U&'[\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]' THEN RETURN false; END IF;
  FOR v_index IN 1..pg_catalog.length(v_decoded) LOOP
    IF pg_catalog.ascii(pg_catalog.substr(v_decoded, v_index, 1)) BETWEEN 127 AND 159 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$function$;

ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS linkedin_url text;
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.resumes'::regclass AND conname = 'resumes_linkedin_url_valid') THEN
    ALTER TABLE public.resumes ADD CONSTRAINT resumes_linkedin_url_valid CHECK (public.valid_resume_linkedin_url(linkedin_url));
  END IF;
END;
$constraint$;

CREATE TABLE IF NOT EXISTS public.recruiting_companies (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CHECK (name = pg_catalog.btrim(name) AND pg_catalog.length(name) BETWEEN 1 AND 150 AND name !~ '[[:cntrl:]]'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS recruiting_companies_name_unique ON public.recruiting_companies (pg_catalog.lower(name));
ALTER TABLE public.recruiting_companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recruiting_companies FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.recruiting_companies TO anon, authenticated;
GRANT INSERT (name, active), UPDATE (name, active) ON TABLE public.recruiting_companies TO authenticated;
DROP POLICY IF EXISTS recruiting_companies_read ON public.recruiting_companies;
CREATE POLICY recruiting_companies_read ON public.recruiting_companies FOR SELECT TO anon, authenticated USING (active OR public.is_admin());
DROP POLICY IF EXISTS recruiting_companies_insert ON public.recruiting_companies;
CREATE POLICY recruiting_companies_insert ON public.recruiting_companies FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS recruiting_companies_update ON public.recruiting_companies;
CREATE POLICY recruiting_companies_update ON public.recruiting_companies FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.resume_company_interests (
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.recruiting_companies(id) ON DELETE RESTRICT,
  PRIMARY KEY (resume_id, company_id)
);
CREATE INDEX IF NOT EXISTS resume_company_interests_company ON public.resume_company_interests(company_id, resume_id);
ALTER TABLE public.resume_company_interests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resume_company_interests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.resume_company_interests TO authenticated;
DROP POLICY IF EXISTS resume_company_interests_admin_read ON public.resume_company_interests;
CREATE POLICY resume_company_interests_admin_read ON public.resume_company_interests FOR SELECT TO authenticated USING (public.is_admin());

-- Presence flags remain private; sponsors never learn a student's other choices.
CREATE TABLE IF NOT EXISTS public.resume_recruiting_metadata (
  resume_id uuid PRIMARY KEY REFERENCES public.resumes(id) ON DELETE CASCADE,
  linkedin_provided boolean NOT NULL DEFAULT false,
  company_interests_provided boolean NOT NULL DEFAULT false
);
ALTER TABLE public.resume_recruiting_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resume_recruiting_metadata FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.resume_recruiting_metadata(resume_id) SELECT id FROM public.resumes ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.recruiting_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.recruiting_companies(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE public.recruiting_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recruiting_memberships FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.recruiting_memberships TO authenticated;
DROP POLICY IF EXISTS recruiting_memberships_admin_read ON public.recruiting_memberships;
CREATE POLICY recruiting_memberships_admin_read ON public.recruiting_memberships FOR SELECT TO authenticated USING (public.is_admin());

-- Old clients omit the extension entirely. Inherit at queue time and keep their
-- pending revisions current if another revision is approved before theirs.
CREATE OR REPLACE FUNCTION public.inherit_resume_recruiting_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_approved public.resumes%ROWTYPE;
BEGIN
  SELECT * INTO v_approved FROM public.resumes
  WHERE approved AND pg_catalog.lower(pg_catalog.btrim(email)) = pg_catalog.lower(pg_catalog.btrim(NEW.email)) AND id <> NEW.id;
  INSERT INTO public.resume_recruiting_metadata(resume_id) VALUES (NEW.id);
  IF FOUND AND v_approved.id IS NOT NULL THEN
    UPDATE public.resumes SET linkedin_url = v_approved.linkedin_url WHERE id = NEW.id;
    INSERT INTO public.resume_company_interests(resume_id, company_id)
      SELECT NEW.id, company_id FROM public.resume_company_interests WHERE resume_id = v_approved.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.inherit_resume_recruiting_metadata() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS resumes_inherit_recruiting ON public.resumes;
CREATE TRIGGER resumes_inherit_recruiting AFTER INSERT ON public.resumes FOR EACH ROW EXECUTE FUNCTION public.inherit_resume_recruiting_metadata();

CREATE OR REPLACE FUNCTION public.carry_resume_recruiting_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.approved AND NOT OLD.approved THEN
    UPDATE public.resumes r SET linkedin_url = NEW.linkedin_url
      FROM public.resume_recruiting_metadata m
      WHERE r.id = m.resume_id AND NOT r.approved AND NOT m.linkedin_provided
        AND pg_catalog.lower(pg_catalog.btrim(r.email)) = pg_catalog.lower(pg_catalog.btrim(NEW.email));
    DELETE FROM public.resume_company_interests i USING public.resumes r, public.resume_recruiting_metadata m
      WHERE i.resume_id = r.id AND m.resume_id = r.id AND NOT r.approved AND NOT m.company_interests_provided
        AND pg_catalog.lower(pg_catalog.btrim(r.email)) = pg_catalog.lower(pg_catalog.btrim(NEW.email));
    INSERT INTO public.resume_company_interests(resume_id, company_id)
      SELECT r.id, i.company_id FROM public.resumes r JOIN public.resume_recruiting_metadata m ON m.resume_id = r.id
      CROSS JOIN public.resume_company_interests i
      WHERE i.resume_id = NEW.id AND NOT r.approved AND NOT m.company_interests_provided
        AND pg_catalog.lower(pg_catalog.btrim(r.email)) = pg_catalog.lower(pg_catalog.btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.carry_resume_recruiting_metadata() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS resumes_carry_recruiting ON public.resumes;
CREATE TRIGGER resumes_carry_recruiting AFTER UPDATE OF approved ON public.resumes FOR EACH ROW EXECUTE FUNCTION public.carry_resume_recruiting_metadata();

CREATE OR REPLACE FUNCTION public.queue_resume_submission_v2(
  p_submission_id uuid, p_fingerprint text, p_full_name text, p_email text,
  p_major text, p_graduation_year text, p_resume_path text,
  p_linkedin_url text, p_company_ids uuid[], p_linkedin_provided boolean,
  p_company_interests_provided boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_result text;
  v_id uuid;
  v_queued boolean;
  v_company_ids uuid[];
BEGIN
  IF p_email IS NULL OR p_submission_id IS NULL OR p_linkedin_provided IS NULL OR p_company_interests_provided IS NULL
    OR NOT public.valid_resume_linkedin_url(p_linkedin_url)
    OR (p_company_interests_provided AND (p_company_ids IS NULL OR pg_catalog.cardinality(p_company_ids) > 100 OR pg_catalog.array_position(p_company_ids, NULL) IS NOT NULL)) THEN
    RETURN 'invalid_submission';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resume-email:' || pg_catalog.lower(pg_catalog.btrim(p_email)), 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_id::text, 0));
  SELECT status = 'queued' INTO v_queued FROM public.resume_submission_reservations WHERE submission_id = p_submission_id FOR UPDATE;
  -- Matching queued retries must converge even if a choice was hidden later.
  IF NOT coalesce(v_queued, false) AND p_company_interests_provided THEN
    SELECT coalesce(pg_catalog.array_agg(DISTINCT id ORDER BY id), '{}'::uuid[]) INTO v_company_ids FROM pg_catalog.unnest(p_company_ids) AS id;
    PERFORM 1 FROM public.recruiting_companies WHERE id = ANY(v_company_ids) AND active ORDER BY id FOR SHARE;
    IF (SELECT pg_catalog.count(*) FROM public.recruiting_companies WHERE id = ANY(v_company_ids) AND active) <> pg_catalog.cardinality(v_company_ids) THEN
      RETURN 'invalid_companies';
    END IF;
  END IF;
  v_result := public.queue_resume_submission(p_submission_id, p_fingerprint, p_full_name, p_email, p_major, p_graduation_year, p_resume_path);
  IF v_result <> 'accepted' OR coalesce(v_queued, false) THEN RETURN v_result; END IF;
  SELECT id INTO STRICT v_id FROM public.resumes WHERE submission_id = p_submission_id;
  IF p_linkedin_provided THEN UPDATE public.resumes SET linkedin_url = nullif(p_linkedin_url, '') WHERE id = v_id; END IF;
  IF p_company_interests_provided THEN
    DELETE FROM public.resume_company_interests WHERE resume_id = v_id;
    INSERT INTO public.resume_company_interests(resume_id, company_id) SELECT v_id, id FROM pg_catalog.unnest(v_company_ids) AS id;
  END IF;
  UPDATE public.resume_recruiting_metadata SET linkedin_provided = p_linkedin_provided, company_interests_provided = p_company_interests_provided WHERE resume_id = v_id;
  RETURN 'accepted';
END;
$function$;
REVOKE ALL ON FUNCTION public.queue_resume_submission_v2(uuid,text,text,text,text,text,text,text,uuid[],boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_resume_submission_v2(uuid,text,text,text,text,text,text,text,uuid[],boolean,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_recruiter_context()
RETURNS TABLE(company_id uuid, company_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NOT (public.is_admin() OR public.is_sponsor()) THEN RAISE EXCEPTION 'book_access_required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT c.id, c.name FROM public.recruiting_memberships m JOIN public.recruiting_companies c ON c.id = m.company_id WHERE m.user_id = auth.uid() AND m.active;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_recruiter_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recruiter_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_recruiter_resumes(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000, p_company_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text, email text, major text, graduation_year text, linkedin_url text, resume_path text, uploaded_at timestamptz, interested boolean, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_company_id uuid;
BEGIN
  IF p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'invalid_page' USING ERRCODE = '22023'; END IF;
  IF public.is_admin() THEN
    v_company_id := p_company_id;
    IF p_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.recruiting_companies c WHERE c.id = p_company_id) THEN RAISE EXCEPTION 'unknown_company' USING ERRCODE = '22023'; END IF;
  ELSIF public.is_sponsor() THEN
    SELECT m.company_id INTO v_company_id FROM public.recruiting_memberships m WHERE m.user_id = auth.uid() AND m.active;
    IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_assignment_required' USING ERRCODE = '42501'; END IF;
    IF p_company_id IS NOT NULL AND p_company_id <> v_company_id THEN RAISE EXCEPTION 'company_scope_mismatch' USING ERRCODE = '42501'; END IF;
  ELSE RAISE EXCEPTION 'book_access_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.id, r.full_name, r.email, r.major, r.graduation_year, r.linkedin_url, r.resume_path, r.uploaded_at,
    EXISTS(SELECT 1 FROM public.resume_company_interests i WHERE i.resume_id = r.id AND i.company_id = v_company_id), pg_catalog.count(*) OVER ()
    FROM public.resumes r WHERE r.approved ORDER BY r.uploaded_at DESC, r.id DESC LIMIT p_limit OFFSET p_offset;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_recruiter_resumes(integer,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_recruiter_resumes(integer,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_recruiting_memberships(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
RETURNS TABLE(user_id uuid, recruiter_email text, company_id uuid, company_name text, active boolean, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501'; END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'invalid_page' USING ERRCODE = '22023'; END IF;
  RETURN QUERY SELECT m.user_id, u.email::text, c.id, c.name, m.active, pg_catalog.count(*) OVER () FROM public.recruiting_memberships m JOIN auth.users u ON u.id = m.user_id JOIN public.recruiting_companies c ON c.id = m.company_id ORDER BY pg_catalog.lower(u.email), m.user_id LIMIT p_limit OFFSET p_offset;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_recruiting_memberships(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_recruiting_memberships(integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_recruiting_membership(p_recruiter_email text, p_company_id uuid, p_active boolean DEFAULT true)
RETURNS TABLE(user_id uuid, recruiter_email text, company_id uuid, company_name text, active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user_id uuid; v_matches integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501'; END IF;
  IF p_recruiter_email IS NULL OR pg_catalog.length(p_recruiter_email) > 254 OR p_active IS NULL OR p_company_id IS NULL THEN RAISE EXCEPTION 'invalid_membership' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recruiting_companies c WHERE c.id = p_company_id) THEN RAISE EXCEPTION 'unknown_company' USING ERRCODE = '22023'; END IF;
  SELECT pg_catalog.min(u.id::text)::uuid, pg_catalog.count(*) INTO v_user_id, v_matches FROM auth.users u WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_recruiter_email)) AND u.raw_app_meta_data->>'role' = 'sponsor';
  IF v_matches <> 1 THEN RAISE EXCEPTION 'existing_recruiter_required' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.recruiting_memberships(user_id, company_id, active) VALUES (v_user_id, p_company_id, p_active)
    ON CONFLICT ON CONSTRAINT recruiting_memberships_pkey DO UPDATE SET company_id = EXCLUDED.company_id, active = EXCLUDED.active, updated_at = pg_catalog.clock_timestamp();
  RETURN QUERY SELECT m.user_id, u.email::text, c.id, c.name, m.active FROM public.recruiting_memberships m JOIN auth.users u ON u.id = m.user_id JOIN public.recruiting_companies c ON c.id = m.company_id WHERE m.user_id = v_user_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_recruiting_membership(text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recruiting_membership(text,uuid,boolean) TO authenticated;

COMMIT;

-- LOCAL SYNTHETIC FIXTURES ONLY. Never apply this to a hosted database.
DO $$ BEGIN
  IF current_setting('shpe.local_recruiting_review', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Local recruiting rehearsal only';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.jwt()->'app_metadata'->>'role' = 'admin', false)
$$;
CREATE OR REPLACE FUNCTION public.is_sponsor() RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.jwt()->'app_metadata'->>'role' = 'sponsor', false)
$$;
CREATE OR REPLACE FUNCTION public.has_book_access() RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.is_admin() OR public.is_sponsor()
$$;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_sponsor(), public.has_book_access() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), first_name text, last_name_dotnum text,
  year text, major text, event_name text, is_first_meeting boolean, how_heard text,
  feedback text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, email text NOT NULL,
  major text NOT NULL, graduation_year text NOT NULL, resume_path text NOT NULL,
  approved boolean NOT NULL DEFAULT false, uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.company_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text, access_code text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, date text, time text,
  end_time text, location text, description text, category text, featured boolean DEFAULT false,
  rsvp_url text, photo text, created_at timestamptz DEFAULT now()
);
-- Empty supporting branding dataset: no hosted sponsor rows or real seed copied.
CREATE TABLE IF NOT EXISTS public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, tier_key text, logo_path text,
  website_url text, academic_year text, status text DEFAULT 'draft', display_order integer DEFAULT 0,
  version integer DEFAULT 1, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance, public.resumes, public.company_access, public.events, public.sponsors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.attendance, public.resumes, public.company_access TO authenticated;
GRANT UPDATE (major, approved) ON public.resumes TO authenticated;
GRANT SELECT ON public.events, public.sponsors TO anon, authenticated;
DROP POLICY IF EXISTS local_admin_read ON public.attendance;
CREATE POLICY local_admin_read ON public.attendance FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS local_resume_read ON public.resumes;
CREATE POLICY local_resume_read ON public.resumes FOR SELECT TO authenticated USING (public.is_admin() OR (approved AND public.is_sponsor()));
DROP POLICY IF EXISTS local_resume_update ON public.resumes;
CREATE POLICY local_resume_update ON public.resumes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS local_admin_read ON public.company_access;
CREATE POLICY local_admin_read ON public.company_access FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS local_event_read ON public.events;
CREATE POLICY local_event_read ON public.events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS local_sponsor_read ON public.sponsors;
CREATE POLICY local_sponsor_read ON public.sponsors FOR SELECT TO anon, authenticated USING (status = 'published' OR public.is_admin());
CREATE OR REPLACE VIEW public.leaderboard AS SELECT ''::text AS first_name, ''::text AS last_initial, 0::bigint AS count WHERE false;
GRANT SELECT ON public.leaderboard TO anon, authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resumes', 'resumes', false, 256000, ARRAY['application/pdf'])
ON CONFLICT(id) DO UPDATE SET public = false, file_size_limit = 256000, allowed_mime_types = ARRAY['application/pdf'];
DROP POLICY IF EXISTS local_resume_pdf_read ON storage.objects;
CREATE POLICY local_resume_pdf_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'resumes' AND (public.is_admin() OR (public.is_sponsor() AND EXISTS (
    SELECT 1 FROM public.resumes r WHERE r.resume_path = storage.objects.name AND r.approved
  )))
);

-- A denied placeholder exists only so the historical lockdown can assert its
-- grant revocation without introducing any legacy anonymous write path.
CREATE OR REPLACE FUNCTION public.submit_resume(text,text,text,text,text) RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'legacy_submission_disabled' USING ERRCODE = '42501'; END;
$$;
REVOKE ALL ON FUNCTION public.submit_resume(text,text,text,text,text) FROM PUBLIC, anon, authenticated;

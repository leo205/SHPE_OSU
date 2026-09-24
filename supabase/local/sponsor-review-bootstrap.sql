-- LOCAL FIXTURES ONLY. This is not a production migration or a database clone.
-- scripts/local-sponsors.mjs uses only the named loopback Docker container.
DO $$ BEGIN
  IF current_setting('shpe.local_sponsor_review', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Local sponsor review only';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
SET search_path = '' AS $$
  SELECT coalesce(auth.jwt()->'app_metadata'->>'role' = 'admin', false)
$$;

-- Empty supporting datasets let the real admin shell load without copying PII.
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text, last_name_dotnum text, year text, major text,
  event_name text, first_meeting boolean, heard_about text, feedback text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text, email text,
  major text, graduation_year text, resume_path text, approved boolean DEFAULT false,
  uploaded_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.company_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text,
  access_code text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, date date,
  time text, end_time text, location text, description text, category text,
  featured boolean DEFAULT false, rsvp_url text, photo text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance, public.resumes, public.company_access, public.events FROM anon, authenticated;
GRANT SELECT ON public.attendance, public.resumes, public.company_access TO authenticated;
GRANT SELECT ON public.events TO anon, authenticated;
DROP POLICY IF EXISTS local_admin_read ON public.attendance;
CREATE POLICY local_admin_read ON public.attendance FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS local_admin_read ON public.resumes;
CREATE POLICY local_admin_read ON public.resumes FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS local_admin_read ON public.company_access;
CREATE POLICY local_admin_read ON public.company_access FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS local_public_read ON public.events;
CREATE POLICY local_public_read ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE OR REPLACE VIEW public.leaderboard AS
  SELECT ''::text AS first_name, ''::text AS last_initial, 0::bigint AS count WHERE false;
GRANT SELECT ON public.leaderboard TO anon, authenticated;

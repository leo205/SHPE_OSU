-- ============================================================================
--  Protected attendance submission — server-only RPC + durable rate limits
-- ============================================================================
--  STATUS: APPLIED TO PRODUCTION 2026-09-13.
--
--  Original rollout stage 1 of 3; prerequisites were satisfied before the
--  production application. When rebuilding, run this file first. It is
--  additive and leaves
--  the current anonymous table INSERT in place so the production form keeps
--  working while the Edge Function and frontend are deployed.
--
--  Then deploy:
--    1. supabase/functions/submit-attendance
--    2. the matching RPC-only browser client
--    3. supabase/attendance-lockdown.sql IMMEDIATELY after verification
--
--  Never deploy the new browser client before this function exists, and never
--  run attendance-lockdown.sql while the old browser client is still live.
-- ============================================================================

BEGIN;

-- Only keyed HMACs are stored here — never raw IP addresses or dot numbers.
-- The Edge Function creates these with RATE_LIMIT_HMAC_SECRET.
CREATE TABLE IF NOT EXISTS public.public_submission_rate_limits (
  rate_key          text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count     integer NOT NULL CHECK (request_count > 0),
  CONSTRAINT public_submission_rate_key_shape
    CHECK (rate_key ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.public_submission_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_submission_rate_limits FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS public_submission_rate_limits_window_idx
  ON public.public_submission_rate_limits (window_started_at);

-- Internal atomic fixed-window counter. It returns false for malformed keys or
-- an exceeded bucket instead of raising, so rejected attempts still commit to
-- the counter and cannot reset their own limit with intentionally invalid data.
CREATE OR REPLACE FUNCTION public.consume_public_submission_rate_limit(
  p_rate_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_count integer;
BEGIN
  IF p_rate_key IS NULL
     OR p_rate_key !~ '^[0-9a-f]{64}$'
     OR p_max_requests < 1
     OR p_window_seconds < 1
     OR p_window_seconds > 2678400 THEN
    RETURN false;
  END IF;

  -- This stays cheap through public_submission_rate_limits_window_idx and
  -- prevents an attacker rotating addresses forever from growing the helper
  -- table forever. Retain two full 31-day windows so the sponsor provider's
  -- monthly budget cannot be garbage-collected and reset early.
  DELETE FROM public.public_submission_rate_limits
  WHERE window_started_at < v_now - pg_catalog.make_interval(secs => 5356800);

  INSERT INTO public.public_submission_rate_limits AS existing
    (rate_key, window_started_at, request_count)
  VALUES
    (p_rate_key, v_now, 1)
  ON CONFLICT (rate_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN existing.window_started_at
             <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
        THEN v_now
      ELSE existing.window_started_at
    END,
    request_count = CASE
      WHEN existing.window_started_at
             <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
        THEN 1
      ELSE existing.request_count + 1
    END
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_submission_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_submission_rate_limit(text, integer, integer)
  TO service_role;

-- The non-unique index accelerates the normalized duplicate lookup without
-- deleting or otherwise rewriting historical rows. A unique index must wait
-- until an admin reviews any old duplicates documented below.
CREATE INDEX IF NOT EXISTS attendance_member_event_lookup_idx
  ON public.attendance (
    pg_catalog.lower(pg_catalog.btrim(last_name_dotnum)),
    pg_catalog.lower(pg_catalog.btrim(event_name))
  );

CREATE OR REPLACE FUNCTION public.submit_attendance(
  p_network_rate_key text,
  p_identity_rate_key text,
  p_event_id uuid,
  p_event_name text,
  p_first_name text,
  p_last_name_dotnum text,
  p_year text,
  p_is_first_meeting boolean,
  p_feedback text,
  p_major text,
  p_how_heard text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_date_text text;
  v_event_date pg_catalog.date;
  v_event_title text;
  v_event_name text;
  v_first_name text := pg_catalog.btrim(p_first_name);
  v_last_name_dotnum text := pg_catalog.btrim(p_last_name_dotnum);
  v_year text := pg_catalog.btrim(p_year);
  -- NULLIF is SQL syntax rather than a pg_catalog function, so it must not be
  -- schema-qualified. Qualifying it makes every otherwise-valid submission
  -- fail when this block initializes after Turnstile verification.
  v_feedback text := NULLIF(pg_catalog.btrim(p_feedback), '');
  v_major text := NULLIF(pg_catalog.btrim(p_major), '');
  v_how_heard text := NULLIF(pg_catalog.btrim(p_how_heard), '');
  v_network_allowed boolean;
  v_identity_allowed boolean;
BEGIN
  -- A broad network ceiling avoids blocking a 70–100-person meeting behind one
  -- campus NAT. The identity bucket catches targeted retries; Turnstile remains
  -- the primary automation control. Thresholds can be tuned after observing a
  -- real meeting, but should never be made tight on IP alone.
  v_network_allowed := public.consume_public_submission_rate_limit(
    p_network_rate_key,
    250,
    600
  );
  v_identity_allowed := public.consume_public_submission_rate_limit(
    p_identity_rate_key,
    10,
    3600
  );

  IF NOT v_network_allowed OR NOT v_identity_allowed THEN
    RETURN 'rate_limited';
  END IF;

  IF p_is_first_meeting IS NULL
     OR v_first_name IS NULL OR v_first_name = ''
     OR v_last_name_dotnum IS NULL OR v_last_name_dotnum = ''
     OR v_year IS NULL OR v_year = ''
     OR pg_catalog.length(v_first_name) > 100
     OR pg_catalog.length(v_last_name_dotnum) > 100
     OR pg_catalog.length(v_year) > 40
     OR pg_catalog.length(COALESCE(v_feedback, '')) > 2000
     OR v_year <> ALL (ARRAY[
       '1st Year',
       '2nd Year',
       '3rd Year',
       '4th Year',
       '5th Year',
       'Graduate Student',
       'Professional'
     ]::pg_catalog.text[]) THEN
    RETURN 'invalid_submission';
  END IF;

  -- Reject control characters in identity fields. Feedback may contain normal
  -- newlines and remains private/admin-only.
  IF v_first_name ~ '[[:cntrl:]]' OR v_last_name_dotnum ~ '[[:cntrl:]]' THEN
    RETURN 'invalid_submission';
  END IF;

  IF p_is_first_meeting THEN
    IF v_major IS NULL
       OR pg_catalog.length(v_major) > 158
       OR NOT (
         v_major = ANY (ARRAY[
           'Aerospace Engineering',
           'Biomedical Engineering',
           'Chemical Engineering',
           'Civil Engineering',
           'Computer Science & Engineering',
           'Computer & Information Science',
           'Electrical and Computer Engineering',
           'Engineering Physics',
           'Environmental Engineering',
           'Food, Agricultural, & Biological Engineering',
           'Industrial & System Engineering',
           'Materials Science Engineering',
           'Mechanical Engineering',
           'Welding Engineering'
         ]::pg_catalog.text[])
         OR (
           pg_catalog.left(v_major, 8) = 'Other – '
           AND pg_catalog.length(pg_catalog.btrim(pg_catalog.substr(v_major, 9)))
                 BETWEEN 1 AND 150
         )
       ) THEN
      RETURN 'invalid_submission';
    END IF;

    IF v_how_heard IS NULL
       OR v_how_heard <> ALL (ARRAY[
         'Friend / Word of mouth',
         'Instagram (@shpeosu)',
         'Involvement Fair / Tabling',
         'Professor / Advisor',
         'GroupMe',
         'Canvas / Email',
         'Other'
       ]::pg_catalog.text[]) THEN
      RETURN 'invalid_submission';
    END IF;
  ELSE
    -- Returning members never write first-timer-only fields, regardless of what
    -- a caller tries to include.
    v_major := NULL;
    v_how_heard := NULL;
  END IF;

  -- Prefer the immutable UUID supplied for a database event. A label-only path
  -- exists for the bundled outage list, but it still must exactly match a label
  -- derived from a real admin-controlled public.events row.
  IF p_event_id IS NOT NULL THEN
    SELECT e.date, e.title
    INTO v_event_date_text, v_event_title
    FROM public.events AS e
    WHERE e.id = p_event_id
    FOR SHARE;
  ELSE
    SELECT e.date, e.title
    INTO v_event_date_text, v_event_title
    FROM public.events AS e
    WHERE e.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND (
        pg_catalog.ltrim(pg_catalog.split_part(e.date, '-', 2), '0')
        || '/'
        || pg_catalog.ltrim(pg_catalog.split_part(e.date, '-', 3), '0')
        || ' - '
        || e.title
      ) = pg_catalog.btrim(p_event_name)
    ORDER BY e.date DESC
    LIMIT 1
    FOR SHARE;
  END IF;

  IF v_event_date_text IS NULL
     OR v_event_title IS NULL
     OR v_event_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN 'invalid_submission';
  END IF;

  BEGIN
    v_event_date := v_event_date_text::pg_catalog.date;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'invalid_submission';
  END;

  IF pg_catalog.to_char(v_event_date, 'YYYY-MM-DD') <> v_event_date_text THEN
    RETURN 'invalid_submission';
  END IF;

  -- Preserve the production contract exactly: M/D - title, with no leading
  -- zero and no locale/UTC conversion.
  v_event_name := (
    EXTRACT(month FROM v_event_date)::pg_catalog.int4::pg_catalog.text
    || '/'
    || EXTRACT(day FROM v_event_date)::pg_catalog.int4::pg_catalog.text
    || ' - '
    || v_event_title
  );

  -- A student can load the page just before an admin edits an event. Never
  -- silently record their displayed selection under the edited label; force a
  -- refresh so the browser and server agree on the exact historical key.
  IF p_event_name IS NULL OR pg_catalog.btrim(p_event_name) <> v_event_name THEN
    RETURN 'invalid_submission';
  END IF;

  -- Serialize duplicates for one normalized identity+event without touching
  -- any historical duplicate rows. Returning the same success for a duplicate
  -- avoids exposing an attendance-presence oracle for a known dot number.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.lower(v_last_name_dotnum)
      || pg_catalog.chr(31)
      || pg_catalog.lower(pg_catalog.btrim(v_event_name)),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.attendance AS a
    WHERE pg_catalog.lower(pg_catalog.btrim(a.last_name_dotnum))
            = pg_catalog.lower(v_last_name_dotnum)
      AND pg_catalog.lower(pg_catalog.btrim(a.event_name))
            = pg_catalog.lower(pg_catalog.btrim(v_event_name))
  ) THEN
    RETURN 'accepted';
  END IF;

  INSERT INTO public.attendance (
    event_name,
    first_name,
    last_name_dotnum,
    year,
    is_first_meeting,
    feedback,
    major,
    how_heard
  ) VALUES (
    v_event_name,
    v_first_name,
    v_last_name_dotnum,
    v_year,
    p_is_first_meeting,
    v_feedback,
    v_major,
    v_how_heard
  );

  RETURN 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_attendance(
  text, text, uuid, text, text, text, text, boolean, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_attendance(
  text, text, uuid, text, text, text, text, boolean, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.submit_attendance(
  text, text, uuid, text, text, text, text, boolean, text, text, text
) IS
  'SERVER-ONLY: validates and idempotently records Turnstile-protected attendance. Never grant to anon/authenticated.';

COMMIT;

-- Review only; do not auto-delete historical duplicates:
--
-- SELECT
--   lower(btrim(last_name_dotnum)) AS member_key,
--   lower(btrim(event_name)) AS event_key,
--   count(*)
-- FROM public.attendance
-- GROUP BY 1, 2
-- HAVING count(*) > 1;

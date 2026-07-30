-- ============================================================================
--  Resume submission — server-side upsert
-- ============================================================================
--  STATUS: NOT YET APPLIED. Run AFTER supabase/sponsor-auth.sql.
--
--  WHY THIS EXISTS
--  ---------------
--  Resume replacement has never actually worked. `ResumeUpload.jsx` performs an
--  UPDATE on `resumes` and a DELETE on storage as an anonymous user, and neither
--  has ever had a policy permitting it. Under RLS an UPDATE with no matching
--  policy affects zero rows and returns success — so a student re-uploading sees
--  the success screen while their old resume stays exactly where it was and the
--  newly uploaded file is orphaned in the bucket.
--
--  The duplicate check in front of it is also half-blind: it reads `resumes` as
--  anon, and the public read policy is scoped to `approved = true`. A student
--  whose resume is still pending is invisible to that lookup, so they get a
--  duplicate row rather than a replacement. Locking the table for sponsor auth
--  would widen that from "pending rows" to "all rows".
--
--  Both problems are the same shape: a client cannot be given the privileges
--  this operation needs without also being able to abuse them. So the operation
--  moves into the database, where it runs with exactly the privileges it needs
--  and nothing more.
--
--  SECURITY NOTES
--  --------------
--  This function is SECURITY DEFINER and callable by anon, so it is a privileged
--  entry point and validates everything itself. In particular:
--
--   * `approved` is hardcoded false and is not a parameter. A submission can
--     never publish itself into the recruiter-visible book.
--   * The OSU email domain check is enforced HERE, not just in the browser.
--     The client-side check in ResumeUpload.jsx is bypassable by anyone posting
--     to PostgREST directly; this one is not.
--   * `resume_path` is constrained to the submissions/ prefix so a caller cannot
--     point a row at an arbitrary object elsewhere in the bucket.
--   * It returns ONLY an action word — 'created' or 'replaced'. Nothing about
--     any other row, and in particular not the previous storage path, which
--     belongs to whoever submitted it.
--
--  RESIDUAL RISK (accepted, see HANDOFF.md)
--  ----------------------------------------
--  Submissions are keyed on email with no proof of ownership, so someone who
--  knows a classmate's OSU address could overwrite their entry. Two things bound
--  the damage: a replacement always lands as `approved = false`, so it drops out
--  of the recruiter book pending E-Board review rather than showing false
--  content to sponsors; and the previous file is left in storage, so an admin
--  can restore it. Closing this properly needs emailed confirmation links, which
--  is a bigger build. The same exposure exists in the current system, which lets
--  anyone insert a row under any email.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_resume(
  p_full_name       text,
  p_email           text,
  p_major           text,
  p_graduation_year text,
  p_resume_path     text
)
RETURNS TABLE (action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text := lower(btrim(p_email));
  v_name     text := btrim(p_full_name);
  v_major    text := btrim(p_major);
  v_existing public.resumes%ROWTYPE;
BEGIN
  -- ── Validation (this runs with elevated privileges; trust nothing) ────────
  -- Every guard below is a negative test, and in plpgsql `IF <null> THEN` does
  -- not fire — so a NULL argument would skip validation entirely. The NOT NULL
  -- columns currently backstop that, but relying on a table constraint to
  -- enforce a function's contract is exactly how it breaks silently later.
  IF v_name IS NULL OR v_email IS NULL OR v_major IS NULL
     OR p_graduation_year IS NULL OR p_resume_path IS NULL THEN
    RAISE EXCEPTION 'missing_field' USING ERRCODE = '22023';
  END IF;

  IF v_name = '' OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF v_email !~ '^[^@[:space:]]+@([[:alnum:]-]+\.)*osu\.edu$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  IF v_major = '' OR length(v_major) > 200 THEN
    RAISE EXCEPTION 'invalid_major' USING ERRCODE = '22023';
  END IF;

  IF p_graduation_year !~ '^([0-9]{4}|Alumni)$' THEN
    RAISE EXCEPTION 'invalid_year' USING ERRCODE = '22023';
  END IF;

  -- Pin the path to the submissions/ prefix. Without this a caller could point
  -- their row at any object in the bucket.
  IF p_resume_path !~ '^submissions/[A-Za-z0-9_.-]+\.pdf$' THEN
    RAISE EXCEPTION 'invalid_path' USING ERRCODE = '22023';
  END IF;

  -- ── Upsert on email ──────────────────────────────────────────────────────
  -- Runs as the function owner, so it sees pending rows too — the anon lookup
  -- this replaces could only ever see approved ones.
  -- ORDER BY, not a bare LIMIT 1. `email` carries no unique constraint and the
  -- broken client flow this replaces created duplicates, so rows may already be
  -- doubled up. Without an explicit order the planner picks arbitrarily — it
  -- could update a stale pending row and leave an old APPROVED one visible in
  -- the recruiter book. A student replacing their resume to remove a phone
  -- number or home address would see "Upload Successful" while the old PDF
  -- stayed on display.
  SELECT * INTO v_existing
  FROM public.resumes
  WHERE lower(email) = v_email
  ORDER BY approved DESC, uploaded_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    -- Light abuse brake: refuse rapid repeat replacements of the same address.
    IF v_existing.uploaded_at > now() - interval '30 seconds' THEN
      RAISE EXCEPTION 'too_soon' USING ERRCODE = '22023';
    END IF;

    -- Collapse EVERY row for this address, not just the one selected above, so
    -- pre-existing duplicates cannot leave a stale approved entry behind.
    DELETE FROM public.resumes
    WHERE lower(email) = v_email AND id <> v_existing.id;

    UPDATE public.resumes
    SET full_name       = v_name,
        major           = v_major,
        graduation_year = p_graduation_year,
        resume_path     = p_resume_path,
        uploaded_at     = now(),
        approved        = false   -- replacements always re-enter review
    WHERE id = v_existing.id;

    -- Returns the action only. An earlier draft also returned the previous
    -- storage path, which is another student's data: paths are unguessable
    -- (submissions/<epoch>_<uuid>.pdf), so handing one to an anonymous caller
    -- disclosed something they could not otherwise obtain. The client only ever
    -- used `action`.
    RETURN QUERY SELECT 'replaced'::text;
  ELSE
    INSERT INTO public.resumes
      (full_name, email, major, graduation_year, resume_path, uploaded_at, approved)
    VALUES
      (v_name, v_email, v_major, p_graduation_year, p_resume_path, now(), false);

    RETURN QUERY SELECT 'created'::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_resume(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_resume(text, text, text, text, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.submit_resume(text, text, text, text, text) IS
  'Privileged entry point for student resume submissions. Callable by anon. '
  'Validates input server-side, forces approved=false, upserts on email. '
  'Do not add parameters that widen what the caller can set.';


-- ─────────────────────────────────────────────────────────────────────────────
--  Direct INSERT is no longer needed by the client and is now the weaker path
--  (no server-side email validation, no duplicate handling). Remove it so every
--  submission goes through the function above.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "resumes public insert" ON public.resumes;
DROP POLICY IF EXISTS "Public can insert resumes" ON public.resumes;


-- ─────────────────────────────────────────────────────────────────────────────
--  Orphaned files
-- ─────────────────────────────────────────────────────────────────────────────
--  A replacement leaves the previous PDF in the bucket, because anon cannot
--  delete from storage and should not be able to. This is deliberate: it makes
--  a bad replacement recoverable. Sweep periodically as an admin.
--
--    SELECT name FROM storage.objects
--    WHERE bucket_id = 'resumes'
--      AND name LIKE 'submissions/%'
--      AND name NOT IN (SELECT resume_path FROM public.resumes)
--      AND created_at < now() - interval '90 days';


-- ─────────────────────────────────────────────────────────────────────────────
--  Verify
-- ─────────────────────────────────────────────────────────────────────────────
--  As anon, each of these should RAISE (nothing is written):
--    select * from submit_resume('X','someone@gmail.com','CSE','2027','submissions/a.pdf');
--      -> invalid_email
--    select * from submit_resume('X','a@osu.edu','CSE','2027','../secret.pdf');
--      -> invalid_path
--
--  A first real submission returns ('created', null); an immediate second one
--  for the same email returns too_soon; after 30s it returns
--  ('replaced', '<old path>') and leaves exactly ONE row for that address:
--    SELECT email, count(*) FROM resumes GROUP BY email HAVING count(*) > 1;
--      -> zero rows

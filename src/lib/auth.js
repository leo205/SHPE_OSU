/**
 * Auth helpers shared by the admin and sponsor portals.
 *
 * Both roles are ordinary Supabase Auth users, so `authenticated` alone does not
 * distinguish an E-Board admin from a corporate recruiter. The difference is a
 * role claim on the user.
 *
 * ⚠️  The claim lives in `app_metadata`, never `user_metadata`.
 *
 * A signed-in user can rewrite their own `user_metadata` at any time via
 * `supabase.auth.updateUser()`. A role stored there would be self-grantable —
 * any sponsor could promote themselves to admin from the browser console.
 * `app_metadata` is writable only by the service role and the Supabase
 * dashboard. The database policies in supabase/sponsor-auth.sql read the same
 * claim through `public.is_admin()`.
 *
 * As always in this codebase: the check below is for routing and UI only. It
 * decides what to render, never what data is reachable. RLS is the enforcement.
 */

/** True when the session belongs to an E-Board admin. */
export function isAdmin(session) {
  return session?.user?.app_metadata?.role === 'admin';
}

/**
 * True for any signed-in user. This is a session-presence helper, not a sponsor
 * authorization check; sponsor data still requires the explicit `sponsor` role
 * enforced by RLS.
 */
export function isSignedIn(session) {
  return Boolean(session?.user);
}

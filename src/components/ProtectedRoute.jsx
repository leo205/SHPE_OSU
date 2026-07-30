import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isAdmin, isSignedIn } from '../lib/auth';

/**
 * Route guard for the admin and sponsor portals.
 *
 * `requireAdmin` matters now that sponsors are real Supabase Auth users too.
 * Before, this only checked that *a* session existed — which was fine when the
 * only accounts were E-Board admins, but would have let any recruiter walk into
 * /admin the moment sponsor logins existed.
 *
 * The database is the real boundary (see supabase/sponsor-auth.sql); a sponsor
 * who reached the admin UI would find empty tables. This guard exists so they
 * get an honest redirect instead of a broken-looking dashboard.
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still checking session
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  if (!isSignedIn(session)) {
    return <Navigate to={requireAdmin ? '/admin/login' : '/company'} replace />;
  }

  // Signed in, but without the admin claim. The overwhelmingly likely cause is
  // a stale JWT: the role is baked in at sign-in, so an E-Board member who was
  // already logged in when their account was tagged still carries a role-less
  // token. Silently redirecting them to a working-looking sponsor dashboard
  // gives no clue that "sign out and back in" is the fix, so sign them out and
  // send them to the admin login, which explains it.
  if (requireAdmin && !isAdmin(session)) {
    supabase.auth.signOut();
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Corporate portal sign-in.
 *
 * This replaced an 8-character access code checked against a `company_access`
 * table that was itself publicly readable — meaning anyone could list every
 * code, and the gate protected nothing. The session was then kept in
 * sessionStorage, which a recruiter could simply write by hand.
 *
 * Sponsors are now ordinary Supabase Auth users, so authentication is enforced
 * by Postgres RLS rather than by this component. E-Board members create one
 * account per company in the Supabase dashboard; see supabase/sponsor-auth.sql.
 */
export default function CompanyLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      // Deliberately generic: distinguishing "no such account" from "wrong
      // password" tells an attacker which sponsor emails are registered.
      console.error('[CompanyLogin] Auth error:', authError);
      setError('Incorrect email or password.');
      return;
    }

    navigate('/company/dashboard');
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-surface-container-lowest p-8 rounded-2xl shadow-xl border border-outline-variant/20 text-center">
        <img src="/photos/shpeLogo.png" alt="SHPE Logo" className="h-16 mx-auto mb-6" />
        <h1 className="font-headline text-3xl font-extrabold text-primary mb-2">
          Corporate Portal
        </h1>
        <p className="text-on-surface-variant mb-8 text-sm">
          Sign in to view the SHPE OSU Resume Book.
        </p>

        {error && (
          <div role="alert" className="mb-6 p-3 bg-error-container text-on-error-container rounded-lg text-sm font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div>
            <label htmlFor="company-email" className="block text-sm font-bold text-on-surface mb-2">
              Email
            </label>
            <input
              id="company-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="recruiter@company.com"
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label htmlFor="company-password" className="block text-sm font-bold text-on-surface mb-2">
              Password
            </label>
            <input
              id="company-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold hover:bg-primary-fixed-dim transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
            ) : (
              'Access Resume Book'
            )}
          </button>
        </form>

        <p className="text-xs text-on-surface-variant mt-6 opacity-70">
          Need access? Contact SHPE OSU and we&apos;ll set up an account for your team.
        </p>
      </div>
    </div>
  );
}

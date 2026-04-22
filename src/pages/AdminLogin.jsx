import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus('error');
      setErrorMsg('Invalid email or password. Please try again.');
    } else {
      navigate('/admin');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-4xl font-headline font-black text-primary italic tracking-tighter">
            SHPE OSU
          </span>
          <p className="text-on-surface-variant font-medium mt-2">
            E-Board Admin Portal
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 shadow-xl">
          <h1 className="font-headline text-2xl font-bold text-on-surface mb-2">
            Sign In
          </h1>
          <p className="text-on-surface-variant text-sm mb-8">
            Access the attendance dashboard and chapter analytics.
          </p>

          {status === 'error' && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl text-sm font-bold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name.1@osu.edu"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {status === 'loading' ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-xl">
                    progress_activity
                  </span>
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <span className="material-symbols-outlined text-xl">
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-on-surface-variant mt-6 opacity-60">
          SHPE OSU · Admin access only
        </p>
      </div>
    </div>
  );
}

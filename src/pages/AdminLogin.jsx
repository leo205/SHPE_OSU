import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

// ── Brute-force constants (H2) ───────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error | locked
  const [errorMsg, setErrorMsg] = useState('');

  // H2: Track consecutive failures and lockout state
  const [failCount, setFailCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutTimer = useRef(null);

  const navigate = useNavigate();

  // ── Lockout countdown ticker ─────────────────────────────────────────────
  const startLockout = (until) => {
    setLockoutUntil(until);
    setStatus('locked');
    clearInterval(lockoutTimer.current);
    lockoutTimer.current = setInterval(() => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(lockoutTimer.current);
        setLockoutUntil(null);
        setLockoutRemaining(0);
        setFailCount(0);
        setStatus('idle');
        setErrorMsg('');
      } else {
        setLockoutRemaining(remaining);
      }
    }, 1000);
  };

  // ── Submit handler ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // H2: Block submit while locked out
    if (lockoutUntil && Date.now() < lockoutUntil) return;

    setStatus('loading');
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const newCount = failCount + 1;
      setFailCount(newCount);

      if (newCount >= MAX_ATTEMPTS) {
        // H2: Lock the form for LOCKOUT_DURATION_MS
        const until = Date.now() + LOCKOUT_DURATION_MS;
        startLockout(until);
        setLockoutRemaining(Math.ceil(LOCKOUT_DURATION_MS / 1000));
        // Don't expose whether it was the email or password that was wrong
        setErrorMsg(
          `Too many failed attempts. Please wait 5 minutes before trying again.`
        );
      } else {
        const attemptsLeft = MAX_ATTEMPTS - newCount;
        setStatus('error');
        // H2: Generic message — don't distinguish bad email vs bad password
        setErrorMsg(
          `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`
        );
      }
    } else {
      // Success — reset failure state
      setFailCount(0);
      clearInterval(lockoutTimer.current);
      navigate('/admin');
    }
  };

  const isLocked = status === 'locked';
  const minutesLeft = Math.floor(lockoutRemaining / 60);
  const secondsLeft = lockoutRemaining % 60;

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex flex-col items-center gap-2 group">
            <img
              src="/photos/shpeLogo.png"
              alt="SHPE OSU Logo"
              className="h-16 w-auto object-contain group-hover:scale-105 transition-transform"
            />
            <span className="text-sm font-bold uppercase tracking-widest text-on-surface-variant group-hover:text-primary transition-colors">
              Admin Portal
            </span>
          </a>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 shadow-xl">
          <h1 className="font-headline text-2xl font-bold text-on-surface mb-2">
            Sign In
          </h1>
          <p className="text-on-surface-variant text-sm mb-8">
            Access the attendance dashboard and chapter analytics.
          </p>

          {/* Error / Lockout banner */}
          {(status === 'error' || isLocked) && (
            <div className={`mb-6 p-4 rounded-xl text-sm font-bold ${
              isLocked
                ? 'bg-error-container text-on-error-container'
                : 'bg-error-container text-on-error-container'
            }`}>
              {isLocked ? (
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">lock</span>
                  <span>
                    Account locked. Try again in{' '}
                    <span className="font-mono">
                      {minutesLeft > 0 ? `${minutesLeft}m ` : ''}
                      {String(secondsLeft).padStart(2, '0')}s
                    </span>
                  </span>
                </div>
              ) : (
                errorMsg
              )}
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
                disabled={isLocked}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name.1@osu.edu"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={isLocked}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'loading' || isLocked}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isLocked ? (
                <>
                  <span className="material-symbols-outlined text-xl">lock</span>
                  Locked
                </>
              ) : status === 'loading' ? (
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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { saveCompanySession } from '../lib/companySession';

export default function CompanyLogin() {
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('company_access')
        .select('*')
        .eq('access_code', accessCode.trim().toUpperCase())
        .single();

      if (fetchError || !data) {
        throw new Error('Invalid access code.');
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        throw new Error('This access code has expired. Please contact SHPE OSU for a new code.');
      }

      // C3/L2: sessionStorage + TTL instead of localStorage
      saveCompanySession(data.company_name);
      navigate('/company/dashboard');
    } catch (err) {
      console.error('[CompanyLogin] Auth error:', err);
      setError(
        err.message === 'Invalid access code.' || err.message.includes('expired')
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-surface-container-lowest p-8 rounded-2xl shadow-xl border border-outline-variant/20 text-center">
        <img src="/photos/shpeLogo.png" alt="SHPE Logo" className="h-16 mx-auto mb-6" />
        <h1 className="font-headline text-3xl font-extrabold text-primary mb-2">
          Corporate Portal
        </h1>
        <p className="text-on-surface-variant mb-8 text-sm">
          Enter your company access code to view the SHPE OSU Resume Book.
        </p>

        {error && (
          <div className="mb-6 p-3 bg-error-container text-on-error-container rounded-lg text-sm font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <input
              type="text"
              required
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Enter Access Code"
              maxLength={10}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 text-center font-mono tracking-widest uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold hover:bg-primary-fixed-dim transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
            ) : (
              'Access Resume Book'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

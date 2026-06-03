import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCompanySession, clearCompanySession } from './CompanyLogin';

export default function CompanyDashboard() {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState('All');
  const [companyName, setCompanyName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // C3/L2: Validate session from sessionStorage with TTL check
    const session = getCompanySession();
    if (!session) {
      navigate('/company');
      return;
    }
    setCompanyName(session.company);
    fetchResumes();

    // L2: Auto-logout when tab regains focus and TTL has expired
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const current = getCompanySession();
        if (!current) {
          clearCompanySession();
          navigate('/company');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [navigate]);

  const fetchResumes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('approved', true)
      .order('uploaded_at', { ascending: false });

    if (!error && data) {
      setResumes(data);
    }
    setLoading(false);
  };

  const handleSignOut = () => {
    clearCompanySession();
    navigate('/company');
  };

  const handleAction = async (path, fullName, isDownload) => {
    const options = isDownload ? { download: `${fullName.replace(/\s+/g, '_')}_Resume.pdf` } : {};
    const { data, error } = await supabase.storage
      .from('resumes')
      .createSignedUrl(path, 60, options);

    if (error) {
      alert('Error accessing resume. It may have been removed.');
    } else {
      window.open(data.signedUrl, '_blank');
    }
  };

  const filtered = resumes.filter((r) => {
    const matchSearch = search === '' ||
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      r.major.toLowerCase().includes(search.toLowerCase());
    const matchYear = filterYear === 'All' || r.graduation_year === filterYear;
    return matchSearch && matchYear;
  });

  const uniqueYears = [...new Set(resumes.map(r => r.graduation_year))].sort();

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-surface-container-lowest border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <img src="/photos/shpeLogo.png" alt="SHPE" className="h-8" />
          <span className="font-headline font-bold text-primary">Resume Book</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-sm font-bold text-on-surface-variant">
            Welcome, {companyName}
          </span>
          <button onClick={handleSignOut} className="text-sm font-bold text-error hover:underline">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-headline text-3xl font-extrabold text-on-surface">Approved Resumes</h1>
            <p className="text-on-surface-variant">Access top Hispanic STEM talent at Ohio State.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                type="text"
                placeholder="Search name or major..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-4 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary/50"
            >
              <option value="All">All Grad Years</option>
              {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/20">
            <span className="material-symbols-outlined text-5xl mb-4 opacity-50">folder_open</span>
            <p>No resumes match your criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(r => (
              <div key={r.id} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/20 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-headline text-xl font-bold text-on-surface">{r.full_name}</h3>
                    <span className="px-2 py-1 bg-secondary-container text-on-secondary-container text-xs font-bold rounded-md">
                      Class of {r.graduation_year}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-primary mb-1">{r.major}</p>
                  <p className="text-xs text-on-surface-variant mb-6">{r.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(r.resume_path, r.full_name, false)}
                    className="flex-1 py-2 bg-secondary-container text-on-secondary-container font-bold rounded-lg hover:bg-secondary hover:text-on-secondary transition-colors flex justify-center items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    View
                  </button>
                  <button
                    onClick={() => handleAction(r.resume_path, r.full_name, true)}
                    className="flex-1 py-2 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-fixed-dim transition-colors flex justify-center items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

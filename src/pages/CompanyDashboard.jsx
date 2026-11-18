import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ConnectedRecruiterDirectory from '../components/recruiting/ConnectedRecruiterDirectory';
import styles from './RecruitingPreview.module.css';

export default function CompanyDashboard() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) { setError('Could not sign out. Please try again.'); return; }
    navigate('/company');
  };
  return <main className={styles.page}>
    <header className={styles.previewHeader}>
      <div className={styles.brand}><img src="/photos/shpeLogo.png" alt="SHPE at Ohio State" width="500" height="155" /><span>SHPE at Ohio State<small>Corporate recruiting</small></span></div>
      <button type="button" onClick={signOut} className={styles.resetButton}>Sign out</button>
    </header>
    {error && <p role="alert" className="mb-4 rounded-xl bg-error-container p-4 text-sm text-on-error-container">{error}</p>}
    <ConnectedRecruiterDirectory />
  </main>;
}

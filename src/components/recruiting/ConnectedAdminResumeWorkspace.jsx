import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { addRecruitingCompany, adminResumeProfiles, loadRecruitingCompanies, loadResumeCompanyInterests, setRecruitingCompanyActive } from '../../lib/recruiting';
import AdminResumeWorkspace from '../recruiting-preview/AdminResumeWorkspace';
import ConnectedRecruiterDirectory from './ConnectedRecruiterDirectory';
import RecruitingMembershipManager from './RecruitingMembershipManager';

function AdminBook({ companies }) {
  const [selectedId, setSelectedId] = useState('');
  const company = companies.find((row) => row.id === selectedId);
  return <section aria-labelledby="connected-resume-book-heading">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><h1 id="connected-resume-book-heading" className="font-headline text-3xl font-extrabold">Resume book</h1><p className="mt-2 text-sm text-on-surface-variant">Preview the approved directory as a recruiting company sees it.</p></div>
      {companies.length > 0 && <label className="min-w-0 text-xs font-bold">Preview company<select className="mt-2 block max-w-full rounded-lg border border-outline-variant/40 bg-white p-3 text-xs" value={company?.id || ''} onChange={(event) => setSelectedId(event.target.value)}><option value="">All approved students</option>{companies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
    </div>
    <ConnectedRecruiterDirectory adminAll={!company} adminCompany={company} />
  </section>;
}

export default function ConnectedAdminResumeWorkspace({ section, resumes, resumeLoadState, onReloadResumes, onApprove, onRevoke, onDelete, onViewPdf, cleanupStatus, cleanupPending, cleanupRunning, onRetryCleanup }) {
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState({ status: 'loading', companies: [] });
  const [preferences, setPreferences] = useState({ status: 'loading', rows: [] });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setCatalog((current) => ({ ...current, status: 'loading' }));
    loadRecruitingCompanies(supabase, { signal: controller.signal }).then((companies) => {
      if (!cancelled) setCatalog({ status: 'ready', companies });
    }).catch(() => { if (!cancelled) setCatalog({ status: 'error', companies: [] }); });
    return () => { cancelled = true; controller.abort(); };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setPreferences({ status: 'loading', rows: [] });
    loadResumeCompanyInterests(supabase, { signal: controller.signal }).then((rows) => {
      if (!cancelled) setPreferences({ status: 'ready', rows });
    }).catch(() => { if (!cancelled) setPreferences({ status: 'error', rows: [] }); });
    return () => { cancelled = true; controller.abort(); };
  }, [reload, resumes]);

  const addCompany = async (name) => {
    const result = await addRecruitingCompany(supabase, name);
    if (result.ok) setCatalog((current) => ({ ...current, companies: [...current.companies, result.company].sort((a, b) => a.name.localeCompare(b.name)) }));
    return result;
  };
  const setActive = async (id, active) => {
    const result = await setRecruitingCompanyActive(supabase, id, active);
    if (result.ok) setCatalog((current) => ({ ...current, companies: current.companies.map((row) => row.id === id ? result.company : row) }));
    return result;
  };
  const reloadAll = () => { setReload((value) => value + 1); void onReloadResumes(); };
  const ready = catalog.status === 'ready' && preferences.status === 'ready';
  const maintenanceStatus = cleanupStatus || (cleanupPending ? 'pending' : 'complete');

  if (section === 'submissions' && resumeLoadState.status !== 'ready') return <div role={resumeLoadState.status === 'error' ? 'alert' : 'status'} className="rounded-xl border border-outline-variant/30 bg-white p-6 text-sm"><p>{resumeLoadState.status === 'loading' ? 'Loading resume submissions…' : 'Could not load every resume submission.'}</p>{resumeLoadState.status === 'error' && <button type="button" onClick={onReloadResumes} className="mt-4 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary">Retry loading</button>}</div>;
  if (section !== 'submissions' && catalog.status === 'loading') return <p role="status" className="p-5 text-sm">Loading recruiting companies…</p>;

  return <div>
    {(catalog.status === 'error' || preferences.status === 'error') && <div role="alert" className="mb-5 rounded-xl border border-outline-variant/40 bg-white p-4 text-sm"><p>Company interests could not be loaded. The recruiting database setup may still be needed. Resume review and private PDF access remain available.</p><button type="button" className="mt-3 rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-bold" onClick={reloadAll}>Retry recruiting data</button></div>}
    {catalog.status !== 'error' || section === 'submissions' || section === 'book' ? <>
      {section === 'submissions' && <div className="mb-3 flex justify-end"><button type="button" onClick={reloadAll} className="rounded-lg border border-outline-variant/30 bg-white px-3 py-2 text-xs font-bold">Refresh submissions</button></div>}
      <AdminResumeWorkspace
        connected section={section}
        state={{ companies: catalog.companies, submissions: adminResumeProfiles(resumes, preferences.rows, ready) }}
        onApprove={onApprove} onRevoke={onRevoke} onDelete={onDelete} onViewPdf={onViewPdf}
        onAddCompany={addCompany} onSetActive={setActive}
        connectedBook={<AdminBook companies={catalog.companies} />}
        managementExtension={<RecruitingMembershipManager companies={catalog.companies} />}
      />
    </> : null}
    {['pending', 'unavailable'].includes(maintenanceStatus) && <details className="mt-4 border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
      <summary className="w-fit cursor-pointer rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">File maintenance</summary>
      <p className="mt-2 max-w-2xl leading-relaxed">{maintenanceStatus === 'pending' ? 'Older resume files are queued for removal. They remain private while cleanup retries.' : 'File maintenance status is unavailable. Please try again.'}</p>
      <button type="button" disabled={cleanupRunning} onClick={onRetryCleanup} className="mt-2 min-h-10 rounded px-2 py-2 text-xs font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">{cleanupRunning ? 'Checking…' : 'Retry maintenance'}</button>
    </details>}
  </div>;
}

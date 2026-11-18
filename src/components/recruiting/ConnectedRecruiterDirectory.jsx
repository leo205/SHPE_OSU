import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getRecruiterContext, loadRecruiterResumes, openResumePdf } from '../../lib/recruiting';
import RecruiterDirectoryPreview from '../recruiting-preview/RecruiterDirectoryPreview';

export default function ConnectedRecruiterDirectory({ adminCompany, adminAll = false }) {
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ status: 'loading', company: null, students: [], error: '' });
  const [pdfError, setPdfError] = useState('');
  const companyId = adminCompany?.id;
  const companyName = adminCompany?.name;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setResult({ status: 'loading', company: null, students: [], error: '' });
    setPdfError('');
    (async () => {
      try {
        const company = adminAll ? null : companyId ? { id: companyId, name: companyName } : await getRecruiterContext(supabase);
        if (!adminAll && !company) throw new Error('Your recruiter account needs a company assignment. Please contact SHPE OSU so an admin can connect your account to your company.');
        const students = await loadRecruiterResumes(supabase, { companyId, signal: controller.signal });
        if (!cancelled) setResult({ status: 'ready', company, students, error: '' });
      } catch (error) {
        if (!cancelled) setResult({ status: 'error', company: null, students: [], error: error.message || 'Could not load the resume book. Please try again.' });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [companyId, companyName, adminAll, reload]);

  const viewPdf = async (student) => {
    setPdfError('');
    const response = await openResumePdf(supabase, student.resumePath);
    if (!response.ok) setPdfError(response.error);
  };

  return <div>
    {pdfError && <p role="alert" className="mb-4 rounded-xl bg-error-container p-4 text-sm text-on-error-container">{pdfError}</p>}
    {result.status === 'loading' && <p role="status" className="rounded-xl border border-outline-variant/30 bg-white p-6 text-sm">Loading the resume book…</p>}
    {result.status === 'error' && <div role="alert" className="rounded-xl border border-outline-variant/30 bg-white p-6 text-sm"><p>{result.error}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="mt-4 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary">Retry loading</button></div>}
    {result.status === 'ready' && <><div className="mb-3 flex justify-end"><button type="button" className="rounded-lg border border-outline-variant/30 bg-white px-3 py-2 text-xs font-bold" onClick={() => setReload((value) => value + 1)}>Refresh directory</button></div><RecruiterDirectoryPreview connected allStudentsOnly={adminAll} company={result.company} students={result.students} onViewPdf={viewPdf} /></>}
  </div>;
}

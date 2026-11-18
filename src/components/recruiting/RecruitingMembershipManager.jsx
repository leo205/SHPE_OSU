import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadRecruitingMemberships, setRecruitingMembership } from '../../lib/recruiting';

export default function RecruitingMembershipManager({ companies }) {
  const [records, setRecords] = useState({ status: 'loading', rows: [] });
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestGeneration = useRef(0);
  const mounted = useRef(false);
  const discardRequests = useCallback(() => { requestGeneration.current++; }, []);
  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setRecords((current) => ({ ...current, status: 'loading' }));
    try {
      const rows = await loadRecruitingMemberships(supabase);
      if (!mounted.current || requestGeneration.current !== generation) return false;
      setRecords({ status: 'ready', rows });
      return true;
    } catch {
      if (!mounted.current || requestGeneration.current !== generation) return false;
      setRecords({ status: 'error', rows: [] });
      return false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; discardRequests(); };
  }, [refresh, discardRequests]);

  const save = async ({ email: recruiterEmail, companyId: assignedCompany, active }) => {
    setSaving(true); setError(''); setNotice('');
    const result = await setRecruitingMembership(supabase, { email: recruiterEmail, companyId: assignedCompany, active });
    if (!mounted.current) return;
    if (!result.ok) { setError(result.error); setSaving(false); return; }
    const refreshed = await refresh();
    if (!mounted.current) return;
    setNotice(`Company assignment saved.${refreshed ? '' : ' The list could not refresh; use Retry loading to see the latest assignments.'}`);
    setEmail(''); setSaving(false);
  };
  const submit = (event) => {
    event.preventDefault();
    void save({ email, companyId: companyId || companies[0]?.id, active: true });
  };

  return <section aria-labelledby="recruiter-assignments-heading" className="mt-8 border-t border-outline-variant/30 pt-7">
    <h2 id="recruiter-assignments-heading" className="text-lg font-extrabold">Recruiter company assignments</h2>
    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-on-surface-variant">Link an existing recruiter account to its company. Multiple recruiters can share a company. Account creation and resume-book access roles are managed separately.</p>
    <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 basis-56 text-xs font-bold" htmlFor="recruiter-assignment-email">Recruiter email<input id="recruiter-assignment-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} className="mt-2 w-full rounded-lg border border-outline-variant/40 bg-white p-3 text-xs font-normal" /></label>
      <label className="min-w-0 flex-1 basis-48 text-xs font-bold" htmlFor="recruiter-assignment-company">Company<select id="recruiter-assignment-company" value={companyId || companies[0]?.id || ''} onChange={(event) => setCompanyId(event.target.value)} disabled={saving || !companies.length} required className="mt-2 w-full rounded-lg border border-outline-variant/40 bg-white p-3 text-xs font-normal">{!companies.length && <option value="">Add a company first</option>}{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <button type="submit" disabled={saving || records.status === 'loading' || !companies.length} className="min-h-11 rounded-lg bg-primary px-4 py-3 text-xs font-bold text-on-primary disabled:opacity-50">{saving ? 'Saving…' : 'Save assignment'}</button>
    </form>
    {error && <p role="alert" className="mt-4 text-xs text-error">{error}</p>}
    {notice && <p role="status" className="mt-4 text-xs text-on-surface-variant">{notice}</p>}
    {records.status === 'loading' && <p role="status" className="mt-5 text-xs">Loading assignments…</p>}
    {records.status === 'error' && <div role="alert" className="mt-5 text-xs"><p>Could not load recruiter company assignments.</p><button type="button" onClick={refresh} className="mt-2 rounded-lg border border-outline-variant px-3 py-2 font-bold">Retry loading assignments</button></div>}
    {records.status === 'ready' && <ul className="mt-5 divide-y divide-outline-variant/30">{records.rows.map((row) => <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><strong className="block break-all text-xs">{row.recruiter_email}</strong><p className="mt-1 text-xs text-on-surface-variant">{row.company_name} · Company assignment {row.active ? 'active' : 'inactive'}</p></div><button type="button" disabled={saving} onClick={() => save({ email: row.recruiter_email, companyId: row.company_id, active: !row.active })} className="min-h-10 rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-bold disabled:opacity-50">{row.active ? 'Disable assignment' : 'Enable assignment'}</button></li>)}{records.rows.length === 0 && <li className="py-5 text-xs text-on-surface-variant">No recruiter company assignments yet.</li>}</ul>}
    <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">Disabling a company assignment removes its company-specific directory context. Revoke the account’s recruiter role to remove resume-book access.</p>
  </section>;
}

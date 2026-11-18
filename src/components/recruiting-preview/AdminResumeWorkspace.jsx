import { useState } from 'react';
import { ArrowUpRight, Check, FileText, RotateCcw, Search } from 'lucide-react';
import { normalizeLinkedInUrl } from '../../lib/linkedin';
import { getRecruiterStudents } from '../../lib/recruitingPreview';
import RecruiterDirectoryPreview from './RecruiterDirectoryPreview';
import styles from './AdminResumeWorkspace.module.css';

const SECTIONS = ['submissions', 'book', 'companies'];

function ResumeSubmissions({ state, onApprove, onRevoke, onDelete, onViewPdf, connected }) {
  const [status, setStatus] = useState('approved');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const pending = state.submissions.filter((row) => row.status === 'pending');
  const approved = state.submissions.filter((row) => row.status === 'approved');
  const companies = new Map(state.companies.map((company) => [company.id, company.name]));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rows = (status === 'pending' ? pending : approved).filter((row) =>
    `${row.fullName} ${row.email} ${row.major}`.toLocaleLowerCase().includes(normalizedQuery)
  );
  const updateResume = async (submission, action, verb) => {
    setBusyId(submission.id); setError(''); setNotice('');
    try {
      const result = await action(submission.id);
      if (result?.cancelled) return;
      if (result?.ok === false) { setError(`Could not ${verb} this resume. Refresh the list and try again.`); return; }
      setNotice(`${submission.fullName}: ${verb === 'approve' ? 'approved' : verb === 'revoke' ? 'approval revoked' : 'deleted'}.${result?.refreshFailed ? ' Reload the list to see the latest records.' : ''}`);
    } catch { setError(`Could not confirm the ${verb} action. Reload the list before retrying.`); }
    finally { setBusyId(null); }
  };

  return <section aria-labelledby="resume-submissions-heading">
    <div className={styles.headingRow}>
      <div>
        <h1 id="resume-submissions-heading">Resume submissions</h1>
        <p>Review student details and the resume before approving a submission for the resume book.</p>
      </div>
      <label className={styles.search}>
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Search resume submissions</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, major…" />
      </label>
    </div>

    <div className={styles.statusTabs} role="group" aria-label="Submission status">
      <button type="button" aria-pressed={status === 'approved'} onClick={() => setStatus('approved')}>Approved & public <span>{approved.length}</span></button>
      <button type="button" aria-pressed={status === 'pending'} onClick={() => setStatus('pending')}>Pending review <span>{pending.length}</span></button>
    </div>
    <p className={styles.reviewHint}><strong>View PDF</strong> opens the resume in a new tab. {connected ? 'Before approving, verify that the name and OSU email match the PDF. The upload check does not prove email ownership.' : 'This local preview uses a fictional sample PDF. In the connected system, verify that the name and OSU email match the PDF before approval.'}</p>
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}

    {/* Keyboard users need to focus this region to scroll the wide table. */}
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <div className={styles.tableContainer} tabIndex={0} role="region" aria-label="Resume submissions table">
      <table className={styles.table}>
        <thead><tr><th scope="col">Student</th><th scope="col">Major & year</th><th scope="col">Company interests</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {rows.map((submission) => {
            const linkedin = normalizeLinkedInUrl(submission.linkedinUrl);
            const replacement = submission.status === 'pending' && approved.some((row) => row.email.trim().toLowerCase() === submission.email.trim().toLowerCase());
            return <tr key={submission.id}>
              <td><strong>{submission.fullName}</strong><span className={styles.muted}>{submission.email}</span>
                {linkedin ? <a className={styles.linkedin} href={linkedin} target="_blank" rel="noopener noreferrer">LinkedIn <ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> for {submission.fullName} (opens in a new tab)</span></a> : <span className={styles.muted}>LinkedIn not provided</span>}
              </td>
              <td>{submission.major}<span className={styles.muted}>{submission.graduationYear === 'Alumni' ? 'Alumni' : `Class of ${submission.graduationYear}`}</span></td>
              <td><div className={styles.tags}>{submission.interestsAvailable === false ? <span>Company interests unavailable</span> : submission.companyIds.length ? submission.companyIds.map((id) => <span key={id}>{companies.get(id) || 'Former company'}</span>) : <span>No preferences provided</span>}</div></td>
              <td><span className={submission.status === 'approved' ? styles.approved : styles.pending}>{submission.status === 'approved' ? 'Approved' : replacement ? 'New revision' : 'Pending review'}</span>{replacement && <span className={styles.revision}>The approved version stays public until this revision is approved.</span>}</td>
              <td><div className={styles.actions}>
                {onViewPdf ? <button type="button" className={styles.secondaryButton} onClick={() => onViewPdf(submission)} aria-label={`View PDF for ${submission.fullName} (opens in a new tab)`}><FileText size={15} aria-hidden="true" />View PDF</button> : <a href="/recruiting-preview/sample-resume.pdf" target="_blank" rel="noopener noreferrer" className={styles.secondaryButton} aria-label={`View PDF for ${submission.fullName} (opens in a new tab)`}><FileText size={15} aria-hidden="true" />View PDF</a>}
                {submission.status === 'pending' && <button type="button" disabled={busyId !== null} className={styles.primaryButton} onClick={() => updateResume(submission, onApprove, 'approve')} aria-label={`Approve resume for ${submission.fullName}`}><Check size={15} aria-hidden="true" />{busyId === submission.id ? 'Saving…' : 'Approve'}</button>}
                {submission.status === 'approved' && onRevoke && <button type="button" disabled={busyId !== null} className={styles.secondaryButton} onClick={() => updateResume(submission, onRevoke, 'revoke')} aria-label={`Revoke approval for ${submission.fullName}`}>Revoke</button>}
                {onDelete && <button type="button" disabled={busyId !== null} className={styles.secondaryButton} onClick={() => updateResume(submission, onDelete, 'delete')} aria-label={`Delete resume for ${submission.fullName}`}>Delete</button>}
              </div></td>
            </tr>;
          })}
          {rows.length === 0 && <tr><td colSpan={5} className={styles.empty}>{query ? 'No submissions match your search.' : status === 'pending' ? 'You’re all caught up. New submissions will appear here for review.' : 'No approved resumes yet.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <p className={styles.smallNote}>Showing {rows.length} of {status === 'pending' ? pending.length : approved.length} submissions.{!connected && ' Preview approvals only change fictional data in this browser.'}</p>
  </section>;
}

function CompanyManagement({ state, onAddCompany, onSetActive, managementExtension }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const addCompany = async (event) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await onAddCompany(name);
      if (!result.ok) { setError(result.error); return; }
      setName('');
      setNotice('Company added to student choices. Recruiter access is managed separately.');
    } catch { setError('Could not confirm the company was added. Reload before retrying.'); }
    finally { setSaving(false); }
  };
  const setActive = async (id, active) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await onSetActive(id, active);
      if (result?.ok === false) setError(result.error);
    } catch { setError('Could not update this company. Reload and try again.'); }
    finally { setSaving(false); }
  };
  return <section className={styles.panel} aria-labelledby="recruiting-companies-heading">
    <div className={styles.headingRow}><div><h1 id="recruiting-companies-heading">Recruiting companies</h1><p>Manage the companies students can select when submitting a resume.</p></div></div>
    <form onSubmit={addCompany} className={styles.companyForm}>
      <label htmlFor="recruiting-company-name">Company name</label>
      <div><input id="recruiting-company-name" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} required maxLength={150} disabled={saving} placeholder="Add a recruiting company" /><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Add company'}</button></div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    <ul className={styles.companyList}>{state.companies.map((company) => <li key={company.id}>
      <div><strong>{company.name}</strong><span>{company.active ? 'Available in student form' : 'Hidden from new selections'}</span></div>
      <label className={styles.availability}><input type="checkbox" checked={company.active} disabled={saving} onChange={(event) => setActive(company.id, event.target.checked)} /><span className="sr-only">Include {company.name} in student choices</span></label>
    </li>)}</ul>
    <p className={styles.smallNote}>Hiding a company preserves previous selections. This list does not grant or revoke recruiter access and is separate from public sponsor listings.</p>
    {managementExtension}
  </section>;
}

function ResumeBook({ state, connectedBook }) {
  const [companyId, setCompanyId] = useState('jpmorgan-chase');
  const company = state.companies.find((item) => item.id === companyId) || state.companies[0];
  if (connectedBook) return connectedBook;
  return <section aria-labelledby="resume-book-heading">
    <div className={styles.headingRow}>
      <div><h1 id="resume-book-heading">Resume book</h1><p>Preview the approved directory as a recruiting company sees it.</p></div>
      {company && <label className={styles.companyPicker}>Preview company<select value={company.id} onChange={(event) => setCompanyId(event.target.value)}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </div>
    <p className={styles.reviewHint}>This company selector is available to admins only. Recruiters see their assigned company.</p>
    <RecruiterDirectoryPreview company={company} students={company ? getRecruiterStudents(state, company.id) : []} />
  </section>;
}

export default function AdminResumeWorkspace({ section, state, onApprove, onAddCompany, onSetActive, onReset, onRevoke, onDelete, onViewPdf, connected = false, connectedBook, managementExtension }) {
  const selectedSection = SECTIONS.includes(section) ? section : 'submissions';
  return <div className={styles.workspace}>
    {selectedSection === 'submissions' && <ResumeSubmissions state={state} onApprove={onApprove} onRevoke={onRevoke} onDelete={onDelete} onViewPdf={onViewPdf} connected={connected} />}
    {selectedSection === 'book' && <ResumeBook state={state} connectedBook={connectedBook} />}
    {selectedSection === 'companies' && <CompanyManagement state={state} onAddCompany={onAddCompany} onSetActive={onSetActive} managementExtension={managementExtension} />}
    <footer className={styles.footer}><span>SHPE OSU · {connected ? 'Private recruiting workspace' : 'Fictional preview data'}</span>{onReset && <button type="button" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Reset sample data</button>}</footer>
  </div>;
}

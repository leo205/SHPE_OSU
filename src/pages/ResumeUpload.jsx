import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatMajor } from '../lib/majors';
import { normalizeLinkedInUrl } from '../lib/linkedin';
import {
  MAX_RESUME_BYTES, MIN_RESUME_BYTES, buildGraduationYears, createResumeDraftKey,
  formatFileSize, isOSUEmail, isValidPDF, resumeErrorMessage, submitResume,
} from '../lib/resume';
import { TURNSTILE_SITE_KEY } from '../lib/turnstile';
import TurnstileWidget from '../components/TurnstileWidget';
import styles from './ResumeUpload.module.css';

const GRADUATION_YEARS = buildGraduationYears();
const MAJORS = [
  'Aerospace Engineering', 'Biomedical Engineering', 'Chemical Engineering',
  'Civil Engineering', 'Computer Science & Engineering', 'Computer & Information Science',
  'Data Analytics', 'Electrical and Computer Engineering', 'Engineering Physics',
  'Environmental Engineering', 'Food, Agricultural, & Biological Engineering',
  'Industrial & Systems Eng.', 'Materials Science Engineering', 'Mechanical Engineering',
  'Welding Engineering', 'Other',
];
const EMPTY_FORM = { full_name: '', email: '', major: '', graduation_year: '', linkedin_url: '' };
const COMPANY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ResumeUpload() {
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [customMajor, setCustomMajor] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [submissionKey, setSubmissionKey] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [catalog, setCatalog] = useState({ status: 'loading', companies: [] });
  const [catalogReload, setCatalogReload] = useState(0);
  const [companyIds, setCompanyIds] = useState([]);
  const [companySearch, setCompanySearch] = useState('');
  const companyNames = useRef(new Map());
  const submittingRef = useRef(false);
  const availableIds = new Set(catalog.companies.map((company) => company.id));
  const visibleCompanies = catalog.companies.filter((company) => company.name.toLocaleLowerCase().includes(companySearch.trim().toLocaleLowerCase()));

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setCatalog((current) => ({ ...current, status: 'loading' }));
    async function loadCompanies() {
      try {
        const { data, error, count } = await supabase.from('recruiting_companies')
          .select('id,name,active', { count: 'exact' }).eq('active', true)
          .order('name').range(0, 999).abortSignal(controller.signal);
        if (cancelled) return;
        if (error || !Array.isArray(data) || count !== data.length || data.some((company) =>
          !company || !COMPANY_ID.test(company.id) || typeof company.name !== 'string'
          || !company.name.trim() || company.name.length > 150 || company.active !== true
        ) || new Set(data.map((company) => company.id)).size !== data.length) {
          throw new Error('Company catalog unavailable');
        }
        for (const company of data) companyNames.current.set(company.id, company.name);
        setCatalog({ status: 'ready', companies: data });
      } catch {
        if (!cancelled) setCatalog((current) => ({ ...current, status: 'error' }));
      }
    }
    void loadCompanies();
    return () => { cancelled = true; controller.abort(); };
  }, [catalogReload]);

  const markDraftChanged = () => {
    setSubmissionKey(null);
    if (status === 'error') setStatus('idle');
    setErrorMsg('');
  };
  const changeField = (event) => {
    markDraftChanged();
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };
  const toggleCompany = (id) => {
    markDraftChanged();
    setCompanyIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  const retryChallenge = () => {
    setTurnstileToken('');
    setTurnstileResetKey((key) => key + 1);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setErrorMsg('');
    if (!formData.full_name.trim() || !formData.major || !formData.graduation_year) { setErrorMsg('Complete your name, major, and graduation year.'); return; }
    if (!isOSUEmail(formData.email)) { setErrorMsg('Use an osu.edu, buckeyemail.osu.edu, or alumni.osu.edu email address.'); return; }
    if (formData.major === 'Other' && !customMajor.trim()) { setErrorMsg('Please describe your major.'); return; }
    if (formData.major === 'Other' && customMajor.trim().length > 150) { setErrorMsg('Major description is too long.'); return; }
    const linkedinUrl = normalizeLinkedInUrl(formData.linkedin_url);
    if (linkedinUrl === null) { setErrorMsg('Enter a LinkedIn profile URL such as https://www.linkedin.com/in/your-name/, or leave it blank.'); return; }
    if (catalog.status !== 'ready') { setErrorMsg('The company list is not available. Retry loading it before submitting.'); return; }
    if (companyIds.length > 100) { setErrorMsg('Select no more than 100 companies.'); return; }
    if (companyIds.some((id) => !availableIds.has(id))) { setErrorMsg('A selected company is no longer available. Remove it and review your selections.'); return; }
    if (!file) { setErrorMsg('Please select a PDF file.'); return; }
    if (file.size < MIN_RESUME_BYTES) { setErrorMsg('That file looks empty or incomplete. Please upload your full resume PDF.'); return; }
    if (file.size > MAX_RESUME_BYTES) {
      setErrorMsg(`Your file is ${formatFileSize(file.size)}, and resumes must be under ${formatFileSize(MAX_RESUME_BYTES)}. Try re-exporting as a text-based PDF or compressing the file.`);
      return;
    }
    if (!turnstileToken) { setErrorMsg('Please complete the security check before submitting.'); return; }

    // Lock before the first await, so one challenge cannot be sent twice by
    // rapid clicks. Exact retries retain their key; any draft edit clears it.
    submittingRef.current = true;
    setStatus('uploading');
    try {
      let pdfValid;
      try {
        pdfValid = await isValidPDF(file);
      } catch {
        setErrorMsg('The selected file could not be read. Please choose the PDF again.');
        setStatus('error');
        return;
      }
      if (!pdfValid) {
        setErrorMsg('The selected file does not appear to be a valid PDF. Only PDF files are accepted.');
        setStatus('error');
        return;
      }
      const draftKey = submissionKey ?? createResumeDraftKey();
      if (!submissionKey) setSubmissionKey(draftKey);
      const result = await submitResume(supabase, {
        fields: {
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          major: formatMajor(formData.major, customMajor),
          graduation_year: formData.graduation_year,
          linkedin_url: linkedinUrl,
          company_ids: [...new Set(companyIds)].sort(),
        },
        file, submissionId: draftKey.id, submissionStartedAt: draftKey.startedAt, turnstileToken,
      });
      if (!result.ok) {
        if (result.reason === 'idempotency_conflict') setSubmissionKey(null);
        if (result.reason === 'company_choices_changed') setCatalogReload((value) => value + 1);
        retryChallenge();
        setErrorMsg(resumeErrorMessage(result.reason));
        setStatus('error');
        return;
      }
      setStatus('success');
    } catch {
      // Do not log names, email, file details, or backend response payloads.
      retryChallenge();
      setErrorMsg(resumeErrorMessage('service_unavailable'));
      setStatus('error');
    } finally {
      submittingRef.current = false;
    }
  };

  const startAnother = () => {
    setStatus('idle'); setFile(null); setSubmissionKey(null); retryChallenge();
    setCustomMajor(''); setFormData({ ...EMPTY_FORM }); setCompanyIds([]); setCompanySearch(''); setErrorMsg('');
    setCatalogReload((value) => value + 1);
  };

  return <main className={styles.page}>
    <header className={styles.pageHeader}><a href="/" aria-label="SHPE at Ohio State home"><img src="/photos/shpeLogo.png" alt="SHPE at Ohio State" width="500" height="155" /></a><span>SHPE at Ohio State<small>Student resources</small></span></header>
    {status === 'success' ? <section className={`${styles.panel} ${styles.success}`} aria-labelledby="resume-success-title">
      <span className={styles.successIcon}><Check size={28} aria-hidden="true" /></span>
      <p className={styles.eyebrow}>Resume submitted</p><h1 id="resume-success-title">Ready for a second look.</h1>
      <p role="status">Your submission is in the review queue. Once approved by the E-Board, it will appear in the recruiter directory.</p>
      <div className={styles.successDetails}><strong>{formData.full_name}</strong><span>{companyIds.length ? `Interested in ${companyIds.map((id) => companyNames.current.get(id)).join(', ')}` : 'No company preferences provided'}</span></div>
      <p className={styles.finePrint}>Your currently approved resume stays available until this new version is approved.</p>
      <button type="button" className={styles.primaryButton} onClick={startAnother}>Submit another resume <ArrowRight size={17} aria-hidden="true" /></button>
    </section> : <section className={styles.panel} aria-labelledby="resume-title">
      <header className={styles.header}><h1 id="resume-title">Student Resume Submission</h1></header>
      <p className={styles.intro}>Add your details, attach your resume, and choose the companies you’re interested in.</p>
      <form onSubmit={handleUpload} aria-busy={status === 'uploading'}>
        <fieldset className={styles.fieldset} disabled={status === 'uploading'}>
          <legend className={styles.sectionTitle}>Your profile</legend>
          <div className={styles.fields}>
            <label htmlFor="full-name">Full name <span aria-hidden="true">*</span><input id="full-name" name="full_name" value={formData.full_name} onChange={changeField} autoComplete="name" maxLength={200} required /></label>
            <label htmlFor="email">OSU email <span aria-hidden="true">*</span><input id="email" name="email" type="email" value={formData.email} onChange={changeField} placeholder="name.1@osu.edu" autoComplete="email" maxLength={254} required /></label>
            <label htmlFor="major">Major <span aria-hidden="true">*</span><select id="major" name="major" value={formData.major} onChange={changeField} required><option value="">Choose your major</option>{MAJORS.map((major) => <option key={major}>{major}</option>)}</select></label>
            <label htmlFor="grad-year">Graduation year <span aria-hidden="true">*</span><select id="grad-year" name="graduation_year" value={formData.graduation_year} onChange={changeField} required><option value="">Choose your year</option>{GRADUATION_YEARS.map((year) => <option key={year}>{year}</option>)}</select></label>
            <label className={styles.fullWidth} htmlFor="linkedin-url">LinkedIn profile <span>(optional)</span><input id="linkedin-url" name="linkedin_url" type="url" inputMode="url" value={formData.linkedin_url} onChange={changeField} placeholder="https://www.linkedin.com/in/your-name/" maxLength={2048} aria-describedby="linkedin-help" /><small id="linkedin-help" className={styles.fieldHelp}>Recruiters can open this profile alongside your approved resume.</small></label>
            {formData.major === 'Other' && <label className={styles.fullWidth} htmlFor="custom-major">Your major <span aria-hidden="true">*</span><input id="custom-major" value={customMajor} onChange={(event) => { markDraftChanged(); setCustomMajor(event.target.value); }} maxLength={150} required /></label>}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset} disabled={status === 'uploading'}>
          <legend className={styles.sectionTitle}>Your resume</legend>
          <div className={styles.fileBox}><label className={styles.fileLabel} htmlFor="resume-file">Attach resume<input id="resume-file" type="file" accept=".pdf,application/pdf" required onChange={(event) => { markDraftChanged(); setFile(event.target.files?.[0] || null); }} aria-describedby="resume-file-help" /></label><p>PDF only · 10–250 KB · Up to 10 pages</p></div>
          <p id="resume-file-help" className={styles.fieldHelp}>Use a standard PDF without passwords, forms, or attachments.</p>
          {file && <p className={styles.fileStatus}><FileText size={16} aria-hidden="true" />{file.name} · {formatFileSize(file.size)}</p>}
        </fieldset>
        <fieldset className={styles.fieldset} disabled={status === 'uploading'} aria-describedby="company-help">
          <legend className={styles.sectionTitle}>Which companies are you interested in?</legend>
          <p className={styles.sectionDescription}>Select all that apply. This part is optional.</p>
          <p id="company-help" className={styles.interestNote}>Your choices highlight your interest. Authorized recruiters can still view your approved resume. Leaving this blank means no preferences provided.</p>
          {catalog.status === 'loading' ? <p role="status" className={styles.empty}>Loading companies…</p> : catalog.status === 'error' ? <div role="alert" className={styles.empty}>The company list could not be loaded. Your form is still here. <button type="button" className={styles.textButton} onClick={() => setCatalogReload((value) => value + 1)}>Retry loading companies</button></div> : <>
            {catalog.companies.length > 5 && <label className={styles.search} htmlFor="company-search"><Search size={18} aria-hidden="true" /><span className={styles.srOnly}>Search companies</span><input id="company-search" type="search" value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Search companies" /></label>}
            {!catalog.companies.length ? <p className={styles.empty}>No companies are listed yet. You can still submit without preferences.</p> : !visibleCompanies.length ? <p className={styles.empty}>No companies match your search. <button type="button" className={styles.textButton} onClick={() => setCompanySearch('')}>Clear search</button></p> : <div className={styles.companyList}>{visibleCompanies.map((company) => <label className={styles.companyOption} key={company.id}><input type="checkbox" checked={companyIds.includes(company.id)} onChange={() => toggleCompany(company.id)} /><span className={styles.checkCircle} aria-hidden="true">{companyIds.includes(company.id) && <Check size={16} strokeWidth={2.5} />}</span><span>{company.name}</span></label>)}</div>}
          </>}
          <div className={styles.selectionSummary}><p className={styles.selectionTitle}>Your selections <span>{companyIds.length}</span></p><div aria-live="polite">{companyIds.length ? <div className={styles.chips}>{companyIds.map((id) => <button key={id} type="button" className={styles.chip} onClick={() => toggleCompany(id)} aria-label={`Remove ${companyNames.current.get(id) || 'unavailable company'} from your selections`}>{companyNames.current.get(id) || 'Previously selected company'}{catalog.status === 'ready' && !availableIds.has(id) && ' (unavailable)'}<X size={14} aria-hidden="true" /></button>)}</div> : <p className={styles.noSelection}>No preferences selected. You will still appear in the approved resume book.</p>}</div></div>
        </fieldset>
        <fieldset className={styles.verification} disabled={status === 'uploading'}><legend className={styles.srOnly}>Submission verification</legend><TurnstileWidget siteKey={TURNSTILE_SITE_KEY} action="resume_submit" onToken={setTurnstileToken} resetKey={turnstileResetKey} /></fieldset>
        {errorMsg && <p role="alert" className={styles.error}>{errorMsg}</p>}
        <div className={styles.submitRow}><p>Your resume becomes visible to recruiters after E-Board approval.</p><button type="submit" disabled={status === 'uploading' || !turnstileToken || catalog.status !== 'ready'} className={styles.primaryButton}>{status === 'uploading' ? 'Submitting…' : 'Submit for review'}<ArrowRight size={17} aria-hidden="true" /></button></div>
      </form>
    </section>}
    <footer className={styles.pageFooter}>SHPE OSU · Supporting the next generation of Hispanic STEM talent.</footer>
  </main>;
}

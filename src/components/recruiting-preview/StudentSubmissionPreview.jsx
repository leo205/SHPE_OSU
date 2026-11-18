import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Search, Upload, X } from 'lucide-react';
import {
  buildGraduationYears,
  formatFileSize,
  isOSUEmail,
  isValidPDF,
  MAX_RESUME_BYTES,
  MIN_RESUME_BYTES,
} from '../../lib/resume';
import { formatMajor } from '../../lib/majors';
import { normalizeLinkedInUrl } from '../../lib/linkedin';
import styles from './StudentSubmissionPreview.module.css';

const YEARS = buildGraduationYears();
const MAJORS = [
  'Aerospace Engineering', 'Biomedical Engineering', 'Chemical Engineering',
  'Civil Engineering', 'Computer Science & Engineering', 'Computer & Information Science',
  'Data Analytics', 'Electrical and Computer Engineering', 'Engineering Physics',
  'Environmental Engineering', 'Food, Agricultural, & Biological Engineering',
  'Industrial & Systems Eng.', 'Materials Science Engineering', 'Mechanical Engineering',
  'Welding Engineering', 'Other',
];
const EMPTY_FORM = { fullName: '', email: '', major: '', graduationYear: '', linkedinUrl: '' };

export default function StudentSubmissionPreview({ companies = [], onSubmit }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [customMajor, setCustomMajor] = useState('');
  const [companyIds, setCompanyIds] = useState([]);
  const [search, setSearch] = useState('');
  const [file, setFile] = useState(null);
  const [demoResume, setDemoResume] = useState(false);
  const [fileError, setFileError] = useState('');
  const [checkingFile, setCheckingFile] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('editing');
  const inputRef = useRef(null);
  const busy = useRef(false);
  const fileVersion = useRef(0);

  useEffect(() => () => { fileVersion.current += 1; }, []);

  const catalogAvailable = Array.isArray(companies);
  const catalog = catalogAvailable ? companies : [];
  const available = catalog.filter((company) => company.active);
  const visible = available.filter((company) => company.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = catalog.filter((company) => companyIds.includes(company.id));

  const changeField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
  };

  const toggleCompany = (id) => {
    setCompanyIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setError('');
  };

  const chooseDemoResume = () => {
    fileVersion.current += 1;
    setFile(null);
    setCheckingFile(false);
    setDemoResume(true);
    setFileError('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const fillSampleDetails = () => {
    setForm({ fullName: 'Student K', email: 'preview.student.k@osu.edu', major: 'Computer Science & Engineering', graduationYear: YEARS[1], linkedinUrl: 'https://www.linkedin.com/in/sample-student-k/' });
    setCustomMajor('');
    chooseDemoResume();
  };

  const chooseFile = async (event) => {
    const candidate = event.target.files?.[0];
    if (!candidate) return;
    const version = ++fileVersion.current;
    setFile(null);
    setDemoResume(false);
    setFileError('');
    setError('');
    if (candidate.type !== 'application/pdf') {
      setCheckingFile(false);
      setFileError('Choose a PDF file.');
      return;
    }
    if (candidate.size < MIN_RESUME_BYTES || candidate.size > MAX_RESUME_BYTES) {
      setCheckingFile(false);
      setFileError(`This file is ${formatFileSize(candidate.size)}. Choose a PDF between 10 KB and 250 KB.`);
      return;
    }
    setCheckingFile(true);
    try {
      const valid = await isValidPDF(candidate);
      if (version !== fileVersion.current) return;
      if (!valid) setFileError('This file does not have a PDF header. Try a fresh PDF export.');
      else setFile(candidate);
    } catch {
      if (version === fileVersion.current) setFileError('This file could not be read. Choose it again or use the demo resume.');
    } finally {
      if (version === fileVersion.current) setCheckingFile(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (busy.current || checkingFile) return;
    setError('');
    if (!form.fullName.trim() || !form.major || !form.graduationYear) {
      setError('Complete your name, major, and graduation year.');
      return;
    }
    if (!isOSUEmail(form.email)) {
      setError('Use an osu.edu, buckeyemail.osu.edu, or alumni.osu.edu email address.');
      return;
    }
    if (form.major === 'Other' && !customMajor.trim()) {
      setError('Enter your major before continuing.');
      return;
    }
    const linkedinUrl = normalizeLinkedInUrl(form.linkedinUrl);
    if (linkedinUrl === null) {
      setError('Enter a LinkedIn profile URL such as https://www.linkedin.com/in/your-name/, or leave it blank.');
      return;
    }
    if (!file && !demoResume) {
      setError('Choose a PDF or use the demo resume to try the review flow.');
      return;
    }
    if (!catalogAvailable || companyIds.some((id) => !available.some((company) => company.id === id))) {
      setError('A selected company is no longer available. Remove it and review your selections.');
      return;
    }
    busy.current = true;
    setStatus('submitting');
    try {
      const result = onSubmit({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        major: formatMajor(form.major, customMajor),
        graduationYear: form.graduationYear,
        linkedinUrl,
        companyIds: [...companyIds],
        // This demo passes metadata only; the selected File never leaves here.
        fileName: demoResume ? 'demo-student-resume.pdf' : file.name,
      });
      if (!result?.ok) {
        setError(result?.error || 'The preview could not queue this submission. Please try again.');
        setStatus('editing');
      } else setStatus('submitted');
    } catch {
      setError('The preview could not queue this submission. Your selections are still here.');
      setStatus('editing');
    } finally {
      busy.current = false;
    }
  };

  const startAnother = () => {
    setForm({ ...EMPTY_FORM });
    setCustomMajor('');
    setCompanyIds([]);
    setSearch('');
    setFile(null);
    setDemoResume(false);
    setFileError('');
    setError('');
    setStatus('editing');
  };

  if (status === 'submitted') {
    return (
      <section className={`${styles.panel} ${styles.success}`} aria-labelledby="student-preview-success">
        <span className={styles.successIcon}><Check size={28} aria-hidden="true" /></span>
        <p className={styles.eyebrow}>Resume submitted</p>
        <h1 id="student-preview-success">Ready for a second look.</h1>
        <p role="status">Your submission is in the review queue. Once approved by the E-Board, it will appear in the recruiter directory.</p>
        <div className={styles.successDetails}>
          <strong>{form.fullName}</strong>
          <span>{selected.length ? `Interested in ${selected.map((company) => company.name).join(', ')}` : 'No company preferences provided'}</span>
        </div>
        <p className={styles.finePrint}>Your currently approved resume stays visible until this new version is approved. In this local preview, no PDF is uploaded or sent.</p>
        <button type="button" className={styles.primaryButton} onClick={startAnother}>Try another submission <ArrowRight size={17} aria-hidden="true" /></button>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="student-preview-title">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Your next opportunity</p><h1 id="student-preview-title">Student Resume Submission</h1></div>
        <button type="button" className={styles.sampleButton} onClick={fillSampleDetails}>Use sample details</button>
      </header>
      <p className={styles.intro}>Put your experience in front of our recruiting partners. Tell us a little about yourself and where you would love to work.</p>
      <p className={styles.demoNote}>Local preview · Use fictional details. Files are checked on this device and never uploaded or sent.</p>

      <form onSubmit={submit}>
        <fieldset className={styles.fieldset} disabled={status === 'submitting'}>
          <legend className={styles.sectionTitle}><span>01</span>Your profile</legend>
          <div className={styles.fields}>
            <label htmlFor="preview-full-name">Full name <span aria-hidden="true">*</span><input id="preview-full-name" name="fullName" value={form.fullName} onChange={changeField} placeholder="e.g. Student K" autoComplete="off" maxLength={200} required /></label>
            <label htmlFor="preview-student-email">OSU email <span aria-hidden="true">*</span><input id="preview-student-email" type="email" name="email" value={form.email} onChange={changeField} placeholder="name.1@osu.edu" autoComplete="off" maxLength={254} required /></label>
            <label htmlFor="preview-major">Major <span aria-hidden="true">*</span><select id="preview-major" name="major" value={form.major} onChange={changeField} required><option value="">Choose your major</option>{MAJORS.map((major) => <option key={major}>{major}</option>)}</select></label>
            <label htmlFor="preview-graduation-year">Graduation year <span aria-hidden="true">*</span><select id="preview-graduation-year" name="graduationYear" value={form.graduationYear} onChange={changeField} required><option value="">Choose your year</option>{YEARS.map((year) => <option key={year}>{year}</option>)}</select></label>
            <label className={styles.fullWidth} htmlFor="preview-linkedin">LinkedIn profile <span>(optional)</span><input id="preview-linkedin" name="linkedinUrl" type="url" inputMode="url" value={form.linkedinUrl} onChange={changeField} placeholder="https://www.linkedin.com/in/your-name/" maxLength={2048} aria-describedby="preview-linkedin-help" /><small id="preview-linkedin-help" className={styles.fieldHelp}>Recruiters can open this profile alongside your approved resume.</small></label>
            {form.major === 'Other' && <label className={styles.fullWidth} htmlFor="preview-custom-major">Your major <span aria-hidden="true">*</span><input id="preview-custom-major" value={customMajor} onChange={(event) => { setCustomMajor(event.target.value); setError(''); }} maxLength={150} required placeholder="Tell us what you study" /></label>}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={status === 'submitting'}>
          <legend className={styles.sectionTitle}><span>02</span>Your resume</legend>
          <div className={styles.fileBox}>
            <span className={styles.uploadIcon}><Upload size={22} aria-hidden="true" /></span>
            <div><strong>A little about everything you bring.</strong><p>PDF only · 10–250 KB</p></div>
            <label className={styles.fileLabel} htmlFor="preview-resume-file">Choose a PDF<input ref={inputRef} id="preview-resume-file" type="file" accept="application/pdf" onChange={chooseFile} disabled={checkingFile} aria-describedby="preview-file-help" /></label>
          </div>
          <div className={styles.fileActions}><button type="button" className={styles.textButton} onClick={chooseDemoResume}>Use demo resume instead</button><span id="preview-file-help">Only its filename is used in this demo.</span></div>
          {checkingFile && <p role="status" className={styles.fileStatus}>Checking the PDF on this device…</p>}
          {(file || demoResume) && <p role="status" className={styles.fileStatus}><FileText size={16} aria-hidden="true" />{demoResume ? 'demo-student-resume.pdf · sample only' : `${file.name} · ${formatFileSize(file.size)} · stays on this device`}</p>}
          {fileError && <p role="alert" className={styles.error}>{fileError}</p>}
        </fieldset>

        <fieldset className={styles.fieldset} disabled={status === 'submitting'} aria-describedby="preview-company-help">
          <legend className={styles.sectionTitle}><span>03</span>Which companies are you interested in?</legend>
          <p className={styles.sectionDescription}>Select all that apply. This part is optional.</p>
          <p id="preview-company-help" className={styles.interestNote}>Your choices highlight your interest. All approved recruiting partners can still view your approved resume. Leaving this blank means no preferences provided.</p>
          {catalogAvailable && available.length > 5 && <label className={styles.search} htmlFor="preview-company-search"><Search size={18} aria-hidden="true" /><span className={styles.srOnly}>Search companies</span><input id="preview-company-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search companies" /></label>}
          {!catalogAvailable ? <p role="alert" className={styles.empty}>The company list could not be loaded. Try returning to this view.</p> : !available.length ? <p className={styles.empty}>No companies are listed yet. You can still submit without preferences.</p> : !visible.length ? <p className={styles.empty}>No companies match “{search}”. <button type="button" className={styles.textButton} onClick={() => setSearch('')}>Clear search</button></p> : <div className={styles.companyList}>{visible.map((company) => <label className={styles.companyOption} key={company.id}><input type="checkbox" checked={companyIds.includes(company.id)} onChange={() => toggleCompany(company.id)} /><span className={styles.checkCircle} aria-hidden="true">{companyIds.includes(company.id) && <Check size={16} strokeWidth={2.5} />}</span><span>{company.name}</span></label>)}</div>}
          <div className={styles.selectionSummary}>
            <p className={styles.selectionTitle}>Your selections <span>{companyIds.length}</span></p>
            <div aria-live="polite">{selected.length ? <div className={styles.chips}>{selected.map((company) => <button key={company.id} type="button" className={styles.chip} onClick={() => toggleCompany(company.id)} aria-label={`Remove ${company.name} from your selections`}>{company.name}{!company.active && ' (unavailable)'}<X size={14} aria-hidden="true" /></button>)}</div> : <p className={styles.noSelection}>No preferences selected. You will still appear in the approved resume book.</p>}</div>
          </div>
        </fieldset>

        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.submitRow}><p>Your resume becomes visible to recruiters after E-Board approval.</p><button type="submit" disabled={checkingFile || status === 'submitting'} className={styles.primaryButton}>{status === 'submitting' ? 'Submitting…' : 'Submit for review'}<ArrowRight size={17} aria-hidden="true" /></button></div>
      </form>
    </section>
  );
}

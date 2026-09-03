import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatMajor } from '../lib/majors';
import {
  MAX_RESUME_BYTES,
  MIN_RESUME_BYTES,
  buildGraduationYears,
  createResumeDraftKey,
  formatFileSize,
  isOSUEmail,
  isValidPDF,
  resumeErrorMessage,
  submitResume,
} from '../lib/resume';
import { TURNSTILE_SITE_KEY } from '../lib/turnstile';
import TurnstileWidget from '../components/TurnstileWidget';

// ── Constants ───────────────────────────────────────────────────────────────
/**
 * Graduation years, derived from the current date rather than hardcoded.
 *
 * The previous list was a literal 2024–2029 plus a stray "2029+" that duplicated
 * 2029, and by 2026 it was offering years that had already passed. Deriving the
 * range means it stays correct without anyone remembering to edit it at
 * rollover — one less thing on the semester checklist to forget.
 *
 * Spans the current year through +5, which covers a first-year starting now.
 */
const GRADUATION_YEARS = buildGraduationYears();

const MAJORS = [
  'Aerospace Engineering',
  'Biomedical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Computer Science & Engineering',
  'Computer & Information Science',
  'Data Analytics',
  'Electrical and Computer Engineering',
  'Engineering Physics',
  'Environmental Engineering',
  'Food, Agricultural, & Biological Engineering',
  'Industrial & Systems Eng.',
  'Materials Science Engineering',
  'Mechanical Engineering',
  'Welding Engineering',
  'Other',
];

// ── Component ────────────────────────────────────────────────────────────────
export default function ResumeUpload() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    major: '',
    graduation_year: '',
  });
  const [customMajor, setCustomMajor] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [submissionKey, setSubmissionKey] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const submittingRef = useRef(false);

  // ── Core upload logic ──────────────────────────────────────────────────────
  const doUpload = async (draftKey) => {
    setStatus('uploading');
    setErrorMsg('');

    try {
      const result = await submitResume(supabase, {
        fields: {
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          major: formatMajor(formData.major, customMajor),
          graduation_year: formData.graduation_year,
        },
        file,
        submissionId: draftKey.id,
        submissionStartedAt: draftKey.startedAt,
        turnstileToken,
      });

      if (!result.ok) {
        if (result.reason === 'idempotency_conflict') setSubmissionKey(null);
        setTurnstileToken('');
        setTurnstileResetKey((key) => key + 1);
        setErrorMsg(resumeErrorMessage(result.reason));
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch (err) {
      console.error('[ResumeUpload] Upload error:', err);
      setTurnstileToken('');
      setTurnstileResetKey((key) => key + 1);
      setErrorMsg(resumeErrorMessage('service_unavailable'));
      setStatus('error');
    }
  };

  const markDraftChanged = () => {
    if (submissionKey) setSubmissionKey(null);
    if (status === 'error') setStatus('idle');
    setErrorMsg('');
  };

  // ── Form submit handler ────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;

    if (!file) { setErrorMsg('Please select a PDF file.'); return; }
    if (file.size < MIN_RESUME_BYTES) { setErrorMsg('That file looks empty or incomplete. Please upload your full resume PDF.'); return; }
    if (file.size > MAX_RESUME_BYTES) {
      // Say the actual size and a concrete next step — a student with a
      // 300 KB Canva export otherwise has no idea what to do about it.
      setErrorMsg(
        `Your file is ${formatFileSize(file.size)}, and resumes must be under ${formatFileSize(MAX_RESUME_BYTES)}. ` +
        'Large files are usually caused by embedded images or a photo — try re-exporting as a text-based PDF, ' +
        'or run it through a free PDF compressor. Still stuck? Send it to an E-Board member and we\'ll upload it for you.'
      );
      return;
    }
    if (!isOSUEmail(formData.email)) { setErrorMsg('Please use your OSU email address (e.g. name.1@osu.edu).'); return; }
    if (formData.major === 'Other' && !customMajor.trim()) { setErrorMsg('Please describe your major.'); return; }
    if (formData.major === 'Other' && customMajor.trim().length > 150) { setErrorMsg('Major description is too long.'); return; }

    if (!turnstileToken) {
      setErrorMsg('Please complete the security check before submitting.');
      return;
    }

    // Set this before the first await. A rapid double click would otherwise
    // send the same single-use challenge twice and could show a false failure
    // even though the first request was accepted.
    submittingRef.current = true;
    setStatus('uploading');
    try {
      const pdfValid = await isValidPDF(file);
      if (!pdfValid) {
        setErrorMsg('The selected file does not appear to be a valid PDF. Only PDF files are accepted.');
        setStatus('error');
        return;
      }

      // The timestamp/UUID pair is created only when the first real request is
      // ready. Exact retries retain it; editing any draft field clears it.
      const draftKey = submissionKey ?? createResumeDraftKey();
      if (!submissionKey) setSubmissionKey(draftKey);

      // No client-side duplicate lookup any more. It could only see approved
      // rows, so a pending resume produced a duplicate instead of a replacement.
      // The protected Edge endpoint queues the submission server-side.
      await doUpload(draftKey);
    } catch {
      setErrorMsg('The selected file could not be read. Please choose the PDF again.');
      setStatus('error');
    } finally {
      submittingRef.current = false;
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-outline-variant/20">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>
          <h2 className="font-headline text-3xl font-bold mb-4 text-on-surface">Upload Successful</h2>
          <p className="text-on-surface-variant mb-8">
            Your resume has been submitted to the E-Board for review. If a resume
            under this email is already approved, it stays available until an
            admin reviews and approves this submission.
          </p>
          <button
            onClick={() => {
              setStatus('idle');
              setFile(null);
              setSubmissionKey(null);
              setTurnstileToken('');
              setTurnstileResetKey((key) => key + 1);
              setCustomMajor('');
              setFormData({ full_name: '', email: '', major: '', graduation_year: '' });
            }}
            className="text-primary font-bold hover:underline"
          >
            Submit another resume
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-24 px-4">
      <div className="max-w-2xl mx-auto bg-surface-container-lowest p-8 md:p-12 rounded-2xl shadow-xl border border-outline-variant/20">
        <div className="mb-10 text-center">
          <span className="inline-block px-4 py-1 bg-tertiary-container text-on-tertiary-container text-xs font-bold uppercase tracking-widest rounded-full mb-4">
            Members Only
          </span>
          <h1 className="font-headline text-4xl font-extrabold text-primary mb-2">Resume Portal</h1>
          <p className="text-on-surface-variant">
            Upload your resume to be featured in the official SHPE OSU Resume Book, accessible to our corporate sponsors and recruiters.
          </p>
        </div>

        {/* Error banner — gated on errorMsg, not status. Every validation
            early-return sets errorMsg and returns without touching status, so
            keying this off status meant a student picking an oversized file or a
            non-OSU email saw absolutely nothing happen when they hit Submit. */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl font-medium text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleUpload} aria-busy={status === 'uploading'}>
          <fieldset disabled={status === 'uploading'} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="full-name" className="block text-sm font-bold text-on-surface mb-2">Full Name</label>
              <input
                id="full-name"
                required
                type="text"
                maxLength={200}
                value={formData.full_name}
                onChange={(e) => {
                  markDraftChanged();
                  setFormData({ ...formData, full_name: e.target.value });
                }}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Brutus Buckeye"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-on-surface mb-2">
                Email <span className="text-xs font-normal text-on-surface-variant">(OSU email required)</span>
              </label>
              <input
                id="email"
                required
                type="email"
                maxLength={254}
                value={formData.email}
                onChange={(e) => {
                  markDraftChanged();
                  setFormData({ ...formData, email: e.target.value });
                }}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="buckeye.1@osu.edu"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="major" className="block text-sm font-bold text-on-surface mb-2">Major</label>
              <select
                id="major"
                required
                value={formData.major}
                onChange={(e) => {
                  markDraftChanged();
                  setFormData({ ...formData, major: e.target.value });
                }}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="" disabled>Select Major</option>
                {MAJORS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {formData.major === 'Other' && (
                <div className="mt-3">
                  <label htmlFor="custom-major" className="block text-sm font-bold text-on-surface mb-2">
                    Please describe your major *
                  </label>
                  <input
                    id="custom-major"
                    type="text"
                    maxLength={150}
                    required
                    value={customMajor}
                    onChange={(e) => {
                      markDraftChanged();
                      setCustomMajor(e.target.value);
                    }}
                    placeholder="e.g. Environmental Engineering"
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              )}
            </div>
            <div>
              <label htmlFor="grad-year" className="block text-sm font-bold text-on-surface mb-2">Graduation Year</label>
              <select
                id="grad-year"
                required
                value={formData.graduation_year}
                onChange={(e) => {
                  markDraftChanged();
                  setFormData({ ...formData, graduation_year: e.target.value });
                }}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="" disabled>Select Year</option>
                {GRADUATION_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="resume-file" className="block text-sm font-bold text-on-surface mb-2">
              Upload Resume (PDF only, up to 250 KB)
            </label>
            <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center bg-surface-bright hover:bg-surface-container transition-colors cursor-pointer relative">
              <input
                id="resume-file"
                required
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  setErrorMsg('');
                  if (status === 'error') setStatus('idle');
                  const selectedFile = e.target.files[0] || null;
                  setFile(selectedFile);
                  setSubmissionKey(null);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
                upload_file
              </span>
              {file ? (
                <div>
                  <p className="font-bold text-primary">{file.name}</p>
                  <p className={`text-xs mt-1 ${file.size > MAX_RESUME_BYTES ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                    {formatFileSize(file.size)}
                    {file.size > MAX_RESUME_BYTES && ` — over the ${formatFileSize(MAX_RESUME_BYTES)} limit`}
                  </p>
                </div>
              ) : (
                <p className="text-on-surface-variant text-sm font-medium">
                  Click or drag and drop to upload your PDF
                </p>
              )}
            </div>
          </div>

          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            action="resume_submit"
            onToken={setTurnstileToken}
            resetKey={turnstileResetKey}
          />

          <button
            type="submit"
            disabled={status === 'uploading' || !turnstileToken}
            className="w-full bg-primary text-on-primary py-4 rounded-xl font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {status === 'uploading' ? (
              <><span className="material-symbols-outlined animate-spin">progress_activity</span>
              Uploading...</>
            ) : (
              'Submit Resume'
            )}
          </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

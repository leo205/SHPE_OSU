import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatMajor } from '../lib/majors';

// ── Constants ───────────────────────────────────────────────────────────────
// Ceiling keeps the free-tier storage bucket sustainable. Measured against the
// resumes already on file (n=9): median 168 KB, max 305 KB — so 250 KB accepts
// the clear majority while still rejecting image-heavy exports. 200 KB was
// considered and rejects exactly the same files, so 250 KB is the safer pick.
const MAX_FILE_SIZE_BYTES = 250 * 1024; // 250 KB
// Floor only rules out truncated/empty files.
const MIN_FILE_SIZE_BYTES = 10 * 1024; // 10 KB
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** Human-readable file size — resumes are KB-scale, so MB reads as "0.13 MB". */
function formatFileSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

// OSU email domains accepted (members + alumni graduate addresses)
const VALID_EMAIL_DOMAINS = ['@osu.edu', '@alumni.osu.edu', '@buckeyemail.osu.edu'];

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
function buildGraduationYears(now = new Date()) {
  const current = now.getFullYear();
  return [
    ...Array.from({ length: 6 }, (_, i) => String(current + i)),
    'Alumni',
  ];
}
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

// ── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Reads the first 4 bytes of a File and checks for the PDF magic number %PDF.
 * This prevents MIME-type spoofing (e.g., renaming malware.exe -> resume.pdf).
 */
async function isValidPDF(file) {
  const buf = await file.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(buf);
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

function isOSUEmail(email) {
  const lower = email.toLowerCase().trim();
  return VALID_EMAIL_DOMAINS.some((domain) => lower.endsWith(domain));
}

/**
 * Maps errors from submit_resume() to something a student can act on.
 * The function raises these deliberately; anything else is unexpected and gets
 * the generic message so internals never leak into the UI.
 */
function friendlyError(err) {
  const msg = String(err?.message ?? '');
  if (msg.includes('invalid_email')) return 'Please use your OSU email address (e.g. name.1@osu.edu).';
  if (msg.includes('invalid_name')) return 'Please enter your full name.';
  if (msg.includes('invalid_major')) return 'Please select or describe your major.';
  if (msg.includes('invalid_year')) return 'Please select your graduation year.';
  if (msg.includes('too_soon')) return 'We just received a submission for this email. Please wait a moment before uploading again.';
  return 'Something went wrong. Please try again or contact an E-Board member.';
}

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

  // Set after a successful submit when the server replaced an existing entry.
  const [replacedExisting, setReplacedExisting] = useState(false);

  // ── Core upload logic ──────────────────────────────────────────────────────
  const doUpload = async () => {
    setStatus('uploading');
    setErrorMsg('');

    // Build a safe, user-independent filename — never trust file.name (C4).
    // The pattern is also enforced server-side by submit_resume().
    const filePath = `submissions/${Date.now()}_${crypto.randomUUID()}.pdf`;

    try {
      // 1. Upload the file FIRST. Nothing the student already has is touched
      //    until this succeeds, so a failed upload can never cost them the
      //    resume they already had on file.
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // 2. Hand off to the database, which does the lookup-and-upsert itself.
      //
      //    This used to be a client-side "SELECT by email, then UPDATE or
      //    INSERT". Both halves were broken: the SELECT only saw approved rows
      //    (so pending resumes produced duplicates), and anon has no UPDATE
      //    policy, so replacements silently affected zero rows while still
      //    reporting success. The function runs with the privileges the
      //    operation actually needs and validates its own input.
      const { data, error: rpcError } = await supabase.rpc('submit_resume', {
        p_full_name: formData.full_name.trim(),
        p_email: formData.email.trim().toLowerCase(),
        p_major: formatMajor(formData.major, customMajor),
        p_graduation_year: formData.graduation_year,
        p_resume_path: filePath,
      });

      if (rpcError) {
        // Roll back the now-orphaned upload so storage doesn't accumulate junk.
        await supabase.storage.from('resumes').remove([filePath]);
        throw rpcError;
      }

      // The previous file is intentionally left in storage so a bad replacement
      // stays recoverable by an admin; see supabase/resume-submit.sql.
      setReplacedExisting(data?.[0]?.action === 'replaced');
      setStatus('success');
    } catch (err) {
      console.error('[ResumeUpload] Upload error:', err);
      setErrorMsg(friendlyError(err));
      setStatus('error');
    }
  };

  // ── Form submit handler ────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) { setErrorMsg('Please select a PDF file.'); return; }
    if (file.size < MIN_FILE_SIZE_BYTES) { setErrorMsg('That file looks empty or incomplete. Please upload your full resume PDF.'); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      // Say the actual size and a concrete next step — a student with a
      // 300 KB Canva export otherwise has no idea what to do about it.
      setErrorMsg(
        `Your file is ${formatFileSize(file.size)}, and resumes must be under ${formatFileSize(MAX_FILE_SIZE_BYTES)}. ` +
        'Large files are usually caused by embedded images or a photo — try re-exporting as a text-based PDF, ' +
        'or run it through a free PDF compressor. Still stuck? Send it to an E-Board member and we\'ll upload it for you.'
      );
      return;
    }
    if (!isOSUEmail(formData.email)) { setErrorMsg('Please use your OSU email address (e.g. name.1@osu.edu).'); return; }
    if (formData.major === 'Other' && !customMajor.trim()) { setErrorMsg('Please describe your major.'); return; }
    if (formData.major === 'Other' && customMajor.trim().length > 150) { setErrorMsg('Major description is too long.'); return; }

    const pdfValid = await isValidPDF(file);
    if (!pdfValid) { setErrorMsg('The selected file does not appear to be a valid PDF. Only PDF files are accepted.'); return; }

    // No client-side duplicate lookup any more. It could only see approved
    // rows, so a pending resume produced a duplicate instead of a replacement.
    // submit_resume() does the lookup server-side where it can see everything.
    await doUpload();
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
            {replacedExisting
              ? 'We replaced the resume previously submitted under this email. It goes back to the E-Board for review, then appears in the Corporate Resume Book.'
              : 'Your resume has been submitted to the E-Board for review. Once approved, it will be visible in the Corporate Resume Book.'}
          </p>
          <button
            onClick={() => {
              setStatus('idle');
              setReplacedExisting(false);
              setFile(null);
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

        <form onSubmit={handleUpload} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="full-name" className="block text-sm font-bold text-on-surface mb-2">Full Name</label>
              <input
                id="full-name"
                required
                type="text"
                maxLength={200}
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, major: e.target.value })}
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
                    onChange={(e) => setCustomMajor(e.target.value)}
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
                onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
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
                  setFile(e.target.files[0] || null);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
                upload_file
              </span>
              {file ? (
                <div>
                  <p className="font-bold text-primary">{file.name}</p>
                  <p className={`text-xs mt-1 ${file.size > MAX_FILE_SIZE_BYTES ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                    {formatFileSize(file.size)}
                    {file.size > MAX_FILE_SIZE_BYTES && ` — over the ${formatFileSize(MAX_FILE_SIZE_BYTES)} limit`}
                  </p>
                </div>
              ) : (
                <p className="text-on-surface-variant text-sm font-medium">
                  Click or drag and drop to upload your PDF
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={status === 'uploading'}
            className="w-full bg-primary text-on-primary py-4 rounded-xl font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {status === 'uploading' ? (
              <><span className="material-symbols-outlined animate-spin">progress_activity</span>
              Uploading...</>
            ) : (
              'Submit Resume'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

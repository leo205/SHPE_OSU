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
  const [status, setStatus] = useState('idle'); // idle | checking | confirming | uploading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  // Holds the existing DB record when a duplicate email is detected
  const [existingRecord, setExistingRecord] = useState(null);

  // ── Core upload logic (shared by first-time and replace flows) ─────────────
  const doUpload = async (replaceRecord = null) => {
    setStatus('uploading');
    setErrorMsg('');

    // Build a safe, user-independent filename — never trust file.name (C4)
    const filePath = `submissions/${Date.now()}_${crypto.randomUUID()}.pdf`;

    const record = {
      full_name: formData.full_name.trim(),
      email: formData.email.trim().toLowerCase(),
      major: formatMajor(formData.major, customMajor),
      graduation_year: formData.graduation_year,
      resume_path: filePath,
      uploaded_at: new Date().toISOString(),
      approved: false, // replacements go back to pending for re-review
    };

    try {
      // ── Order matters ──────────────────────────────────────────────────
      // 1. Upload the new file FIRST. Nothing the student already has is
      //    touched until this succeeds, so a failed upload can never leave
      //    them with no resume on file. (The previous order deleted the old
      //    file and row up front, so any later failure lost their data.)
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // 2. Point the database at the new file. Replacing updates the existing
      //    row in place rather than delete-then-insert, so there is never a
      //    window where the student has no record at all.
      const { error: dbError } = replaceRecord
        ? await supabase.from('resumes').update(record).eq('id', replaceRecord.id)
        : await supabase.from('resumes').insert([record]);

      if (dbError) {
        // Roll back the now-orphaned upload so storage doesn't accumulate junk.
        await supabase.storage.from('resumes').remove([filePath]);
        throw dbError;
      }

      // 3. Only now is the old file unreachable, so it's safe to delete. A
      //    failure here leaves an orphaned blob — a janitorial problem, not a
      //    data-loss one — so it must not fail an otherwise good submission.
      if (replaceRecord?.resume_path) {
        const { error: cleanupErr } = await supabase.storage
          .from('resumes')
          .remove([replaceRecord.resume_path]);
        if (cleanupErr) {
          console.warn(
            '[ResumeUpload] Could not remove replaced file (orphaned):',
            replaceRecord.resume_path,
            cleanupErr
          );
        }
      }

      setStatus('success');
    } catch (err) {
      // M4: Log raw error for devs — never surface internal messages to users
      console.error('[ResumeUpload] Upload error:', err);
      setErrorMsg('Something went wrong. Please try again or contact an E-Board member.');
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

    setStatus('checking');
    setErrorMsg('');

    // Check if this email already has a resume on file
    const { data: existing, error: lookupErr } = await supabase
      .from('resumes')
      .select('id, full_name, resume_path, approved, uploaded_at')
      .eq('email', formData.email.trim().toLowerCase())
      .maybeSingle();

    if (lookupErr) {
      console.error('[ResumeUpload] Lookup error:', lookupErr);
      setErrorMsg('Something went wrong while checking your email. Please try again.');
      setStatus('error');
      return;
    }

    if (existing) {
      // Duplicate found — pause and show confirmation prompt
      setExistingRecord(existing);
      setStatus('confirming');
    } else {
      // No duplicate — proceed directly
      await doUpload(null);
    }
  };

  // ── Confirmation handlers ──────────────────────────────────────────────────
  const handleConfirmReplace = async () => {
    await doUpload(existingRecord);
    setExistingRecord(null);
  };

  const handleCancelReplace = () => {
    setExistingRecord(null);
    setStatus('idle');
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
            Your resume has been submitted to the E-Board for review. Once approved, it will be visible in the Corporate Resume Book.
          </p>
          <button
            onClick={() => {
              setStatus('idle');
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

  // ── Replace confirmation modal ─────────────────────────────────────────────
  const showReplacePrompt = status === 'confirming' && existingRecord;

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

        {/* Error banner */}
        {status === 'error' && (
          <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl font-medium text-sm">
            {errorMsg}
          </div>
        )}

        {/* Replace confirmation prompt */}
        {showReplacePrompt && (
          <div className="mb-6 p-6 bg-tertiary-container text-on-tertiary-container rounded-2xl border border-on-tertiary-container/20 shadow-md">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-3xl flex-shrink-0 mt-0.5">swap_horiz</span>
              <div className="flex-1">
                <h3 className="font-headline font-extrabold text-lg mb-1">Resume Already on File</h3>
                <p className="text-sm opacity-90 leading-relaxed mb-1">
                  We found an existing resume submitted by <strong>{existingRecord.full_name}</strong> under this email address.
                </p>
                <p className="text-xs opacity-70 mb-4">
                  Submitted: {new Date(existingRecord.uploaded_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  {existingRecord.approved ? ' · Currently approved' : ' · Pending approval'}
                </p>
                <p className="text-sm font-bold mb-4">
                  Do you want to replace it with your new upload? Your resume will go back to pending for admin review.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={handleConfirmReplace}
                    className="bg-on-tertiary-container text-tertiary-container px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-all shadow"
                  >
                    Yes, Replace My Resume
                  </button>
                  <button
                    onClick={handleCancelReplace}
                    className="bg-on-tertiary-container/20 text-on-tertiary-container px-6 py-2.5 rounded-full font-bold text-sm hover:bg-on-tertiary-container/30 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
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
            disabled={status === 'uploading' || status === 'checking' || status === 'confirming'}
            className="w-full bg-primary text-on-primary py-4 rounded-xl font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {status === 'uploading' || status === 'checking' ? (
              <><span className="material-symbols-outlined animate-spin">progress_activity</span>
              {status === 'checking' ? 'Checking...' : 'Uploading...'}</>
            ) : (
              'Submit Resume'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

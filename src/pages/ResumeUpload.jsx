import { useState } from 'react';
import { supabase } from '../lib/supabase';

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

// OSU email domains accepted (members + alumni graduate addresses)
const VALID_EMAIL_DOMAINS = ['@osu.edu', '@alumni.osu.edu', '@buckeyemail.osu.edu'];

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
 * This prevents MIME-type spoofing (e.g., renaming malware.exe → resume.pdf).
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
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleUpload = async (e) => {
    e.preventDefault();

    // ── File presence ────────────────────────────────────────────────────────
    if (!file) {
      setErrorMsg('Please select a PDF file.');
      return;
    }

    // ── File size cap (5 MB) ─────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMsg('File must be under 5 MB. Please compress your PDF and try again.');
      return;
    }

    // ── OSU email validation (M3) ────────────────────────────────────────────
    if (!isOSUEmail(formData.email)) {
      setErrorMsg('Please use your OSU email address (e.g. name.1@osu.edu).');
      return;
    }

    // ── Validation for custom major ─────────────────────────────────────────
    if (formData.major === 'Other' && !customMajor.trim()) {
      setErrorMsg('Please describe your major.');
      return;
    }
    if (formData.major === 'Other' && customMajor.trim().length > 150) {
      setErrorMsg('Major description is too long.');
      return;
    }

    // ── Magic-byte PDF check (C4) — must await before upload ─────────────────
    const pdfValid = await isValidPDF(file);
    if (!pdfValid) {
      setErrorMsg('The selected file does not appear to be a valid PDF. Only PDF files are accepted.');
      return;
    }

    setStatus('uploading');
    setErrorMsg('');

    try {
      // 1. Build a safe, user-independent filename — never trust file.name (C4)
      const safeFileName = `${Date.now()}_${crypto.randomUUID()}.pdf`;
      const filePath = `submissions/${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Resolve major name
      const resolvedMajor = formData.major === 'Other'
        ? `Other – ${customMajor.trim()}`
        : formData.major;

      // 2. Insert metadata into DB
      const { error: dbError } = await supabase.from('resumes').insert([
        {
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          major: resolvedMajor,
          graduation_year: formData.graduation_year,
          resume_path: filePath,
          approved: false, // Requires admin approval
        },
      ]);

      if (dbError) throw dbError;

      setStatus('success');
    } catch (err) {
      // M4: Log raw error for devs — never surface internal messages to users
      console.error('[ResumeUpload] Upload error:', err);
      setErrorMsg('Something went wrong. Please try again or contact an E-Board member.');
      setStatus('error');
    }
  };

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

        {status === 'error' && (
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
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 animate-fade-in"
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
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
                <option value="2029+">2029+</option>
                <option value="Alumni">Alumni</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="resume-file" className="block text-sm font-bold text-on-surface mb-2">
              Upload Resume (PDF only, max 5 MB)
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
                  <p className="text-xs text-on-surface-variant mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
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
              <><span className="material-symbols-outlined animate-spin">progress_activity</span> Uploading...</>
            ) : (
              'Submit Resume'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

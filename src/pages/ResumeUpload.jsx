import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ResumeUpload() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    major: '',
    graduation_year: '',
  });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Please select a PDF file.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setErrorMsg('Only PDF files are allowed.');
      return;
    }

    setStatus('uploading');
    setErrorMsg('');

    try {
      // 1. Upload to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `submissions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Insert into DB
      const { error: dbError } = await supabase.from('resumes').insert([
        {
          full_name: formData.full_name,
          email: formData.email,
          major: formData.major,
          graduation_year: formData.graduation_year,
          resume_path: filePath,
          approved: false, // Requires admin approval
        },
      ]);

      if (dbError) throw dbError;

      setStatus('success');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Something went wrong.');
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
              <label className="block text-sm font-bold text-on-surface mb-2">Full Name</label>
              <input
                required
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Brutus Buckeye"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-2">Email</label>
              <input
                required
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="buckeye.1@osu.edu"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-on-surface mb-2">Major</label>
              <input
                required
                type="text"
                value={formData.major}
                onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Computer Science & Engineering"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-2">Graduation Year</label>
              <select
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
                <option value="2028+">2028+</option>
                <option value="Alumni">Alumni</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Upload Resume (PDF only)</label>
            <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center bg-surface-bright hover:bg-surface-container transition-colors cursor-pointer relative">
              <input
                required
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
                upload_file
              </span>
              {file ? (
                <p className="font-bold text-primary">{file.name}</p>
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

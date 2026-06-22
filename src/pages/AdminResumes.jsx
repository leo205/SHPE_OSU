import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminResumes() {
  const [resumes, setResumes] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCompany, setNewCompany] = useState('');

  // Inline major editing
  const [editingId, setEditingId] = useState(null);
  const [editMajorVal, setEditMajorVal] = useState('');
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [resData, codesData] = await Promise.all([
      supabase.from('resumes').select('*').order('uploaded_at', { ascending: false }),
      supabase.from('company_access').select('*').order('created_at', { ascending: false })
    ]);
    if (resData.data) setResumes(resData.data);
    if (codesData.data) setCodes(codesData.data);
    setLoading(false);
  };

  const handleToggleApproval = async (id, currentStatus) => {
    const { error } = await supabase.from('resumes').update({ approved: !currentStatus }).eq('id', id);
    if (!error) fetchData();
  };

  const saveMajor = async (id) => {
    setSavingId(id);
    const trimmed = editMajorVal.trim();
    const { error } = await supabase
      .from('resumes')
      .update({ major: trimmed || null })
      .eq('id', id);
    if (!error) {
      setResumes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, major: trimmed || null } : r))
      );
      setEditingId(null);
    } else {
      console.error('[AdminResumes] Update error:', error);
    }
    setSavingId(null);
  };

  const handleDeleteResume = async (id, path) => {
    if (!window.confirm('Delete this resume?')) return;
    await supabase.storage.from('resumes').remove([path]);
    await supabase.from('resumes').delete().eq('id', id);
    fetchData();
  };

  const handleGenerateCode = async (e) => {
    e.preventDefault();
    if (!newCompany) return;
    // C3: crypto.getRandomValues is cryptographically secure — Math.random() is NOT
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const randomCode = Array.from(bytes)
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .toUpperCase()
      .slice(0, 8);
    const { error } = await supabase.from('company_access').insert([{
      company_name: newCompany,
      access_code: randomCode
    }]);
    if (!error) {
      setNewCompany('');
      fetchData();
    }
  };

  const handleDeleteCode = async (id) => {
    if (!window.confirm('Revoke access code?')) return;
    await supabase.from('company_access').delete().eq('id', id);
    fetchData();
  };

  const handleViewResume = async (path) => {
    const { data } = await supabase.storage.from('resumes').createSignedUrl(path, 60);
    if (data) window.open(data.signedUrl, '_blank');
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-12">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-3xl font-extrabold text-on-surface">Resume Book Admin</h1>
        <a href="/admin" className="text-primary font-bold hover:underline">← Back to Dashboard</a>
      </div>

      <section>
        <h2 className="text-xl font-bold mb-4">Pending & Approved Resumes</h2>
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 shadow-sm bg-surface-container-lowest">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-container-high text-on-surface-variant font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Major</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {resumes.map(r => (
                <tr key={r.id}>
                  <td className="px-6 py-4 font-medium">
                    {r.full_name} <br/><span className="text-xs text-on-surface-variant font-normal">{r.email}</span>
                  </td>
                  <td className="px-6 py-4">
                    {editingId === r.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          maxLength={150}
                          value={editMajorVal}
                          onChange={(e) => setEditMajorVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveMajor(r.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="px-2 py-1 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-44"
                        />
                        <button
                          onClick={() => saveMajor(r.id)}
                          disabled={savingId === r.id}
                          title="Save"
                          className="p-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-primary text-base">
                            {savingId === r.id ? 'progress_activity' : 'check'}
                          </span>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          title="Cancel"
                          className="p-1 rounded-lg hover:bg-surface-container transition-colors"
                        >
                          <span className="material-symbols-outlined text-on-surface-variant text-base">close</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span>{r.major} ({r.graduation_year})</span>
                        <button
                          onClick={() => { setEditingId(r.id); setEditMajorVal(r.major || ''); }}
                          title="Edit major"
                          className="p-1 rounded-lg hover:bg-surface-container transition-colors opacity-40 hover:opacity-100 focus:opacity-100"
                        >
                          <span className="material-symbols-outlined text-on-surface-variant text-base">edit</span>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {r.uploaded_at ? (
                      <span className="text-on-surface-variant text-xs leading-snug block">
                        {new Date(r.uploaded_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        <br />
                        <span className="opacity-70">
                          {new Date(r.uploaded_at).toLocaleTimeString('en-US', {
                            hour: 'numeric', minute: '2-digit', hour12: true,
                          })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-on-surface-variant text-xs opacity-50">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {r.approved ? (
                      <span className="px-2 py-1 bg-primary/10 text-primary rounded-md font-bold text-xs">Approved</span>
                    ) : (
                      <span className="px-2 py-1 bg-error/10 text-error rounded-md font-bold text-xs">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end items-center gap-4">
                      <button onClick={() => handleViewResume(r.resume_path)} className="text-on-surface-variant hover:text-primary font-bold">View</button>
                      <button onClick={() => handleToggleApproval(r.id, r.approved)} className="text-primary hover:underline font-bold">
                        {r.approved ? 'Revoke' : 'Approve'}
                      </button>
                      <button onClick={() => handleDeleteResume(r.id, r.resume_path)} className="text-error hover:underline font-bold">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Company Access Codes</h2>
        <form onSubmit={handleGenerateCode} className="flex gap-4 mb-6">
          <input
            type="text"
            required
            value={newCompany}
            onChange={e => setNewCompany(e.target.value)}
            placeholder="Company Name"
            className="px-4 py-2 rounded-xl border border-outline-variant focus:ring-2 focus:ring-primary/50 flex-1 max-w-sm"
          />
          <button type="submit" className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold">Generate Code</button>
        </form>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {codes.map(c => (
            <div key={c.id} className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-lowest flex justify-between items-center">
              <div>
                <p className="font-bold">{c.company_name}</p>
                <p className="font-mono text-primary text-lg tracking-widest">{c.access_code}</p>
              </div>
              <button onClick={() => handleDeleteCode(c.id)} className="text-error"><span className="material-symbols-outlined">delete</span></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import AdminDashboard from '../../pages/AdminDashboard';
import AdminResumeWorkspace from './AdminResumeWorkspace';
import { BookOpen, Building2 } from 'lucide-react';

const RESUME_SECTIONS = [
  { id: 'book', label: 'Resume book', icon: BookOpen },
  { id: 'companies', label: 'Recruiting companies', icon: Building2 },
];

/** Reuse the actual admin layout; Vite's preview-only adapter blocks live services. */
export default function AdminRecruitingPreview(props) {
  return <AdminDashboard
    resumeSections={RESUME_SECTIONS}
    previewNotice={<div role="note" className="mb-6 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-xs leading-relaxed text-on-surface-variant"><strong>Local recruiting preview.</strong> Use fictional details only. Sign-in is simulated; existing admin sections show empty sample data. Recruiting changes are shared in this browser for two hours without changes. Files are never uploaded.</div>}
    resumeWorkspace={<AdminResumeWorkspace {...props} />}
  />;
}

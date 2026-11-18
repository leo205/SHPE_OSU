import { useSearchParams } from 'react-router-dom';
import { BookOpen, Building2 } from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import ConnectedAdminResumeWorkspace from '../components/recruiting/ConnectedAdminResumeWorkspace';

const RESUME_SECTIONS = [
  { id: 'book', label: 'Resume book', icon: BookOpen },
  { id: 'companies', label: 'Recruiting companies', icon: Building2 },
];

export default function ConnectedAdminDashboard() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section = requested === 'book' || requested === 'companies' ? requested : 'submissions';
  return <AdminDashboard resumeSections={RESUME_SECTIONS} resumeWorkspace={(callbacks) => <ConnectedAdminResumeWorkspace section={section} {...callbacks} />} />;
}

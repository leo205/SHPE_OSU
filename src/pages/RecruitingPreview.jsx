import { lazy, Suspense, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import StudentSubmissionPreview from '../components/recruiting-preview/StudentSubmissionPreview';
import RecruiterDirectoryPreview from '../components/recruiting-preview/RecruiterDirectoryPreview';
import {
  createPreviewState,
  addPreviewSubmission,
  approvePreviewSubmission,
  getRecruiterStudents,
  addPreviewCompany,
  setPreviewCompanyActive,
} from '../lib/recruitingPreview';
import styles from './RecruitingPreview.module.css';
import { useRecruitingPreviewState } from '../lib/recruitingPreviewSession';

const PAGES = {
  '/resume-upload': { view: 'student', title: 'Student resume submission', area: 'Student resources' },
  '/company/dashboard': { view: 'recruiter', title: 'Corporate recruiting portal', area: 'Corporate recruiting' },
  '/admin': { view: 'admin', title: 'Admin recruiting workspace', area: 'Admin workspace' },
};

const AdminRecruitingPreview = lazy(() => import('../components/recruiting-preview/AdminRecruitingPreview'));

export default function RecruitingPreview() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const page = PAGES[pathname];
  const view = page?.view;
  const isAdmin = view === 'admin';
  const [state, setState] = useRecruitingPreviewState();
  // This fixed fictional account represents the company's assigned identity.
  // The connected portal will derive it from authenticated membership.
  const company = state.companies.find((item) => item.id === 'jpmorgan-chase') || state.companies[0];
  const students = getRecruiterStudents(state, company.id);

  useEffect(() => {
    document.title = `${page?.title || 'Recruiting preview'} · SHPE OSU`;
  }, [page?.title]);

  const submit = (fields) => {
    let result;
    setState((current) => {
      result = addPreviewSubmission(current, fields);
      return result.ok ? result.state : current;
    });
    return result;
  };

  const addCompany = (name) => {
    let result;
    setState((current) => {
      result = addPreviewCompany(current, name);
      return result.ok ? result.state : current;
    });
    return result;
  };

  if (pathname === '/admin/resumes' || pathname === '/admin/recruiting-companies') {
    const section = pathname === '/admin/resumes' ? 'submissions' : 'companies';
    return <Navigate to={`/admin?tab=resume&section=${section}`} replace />;
  }

  if (!page) {
    const oldView = new URLSearchParams(location.search).get('view');
    const destination = oldView === 'recruiter' ? '/company/dashboard' : oldView === 'review' ? '/admin?tab=resume&section=submissions' : '/resume-upload';
    return <Navigate to={destination} replace />;
  }

  if (isAdmin) {
    return <Suspense fallback={<p role="status" className="p-6">Loading admin preview…</p>}>
      <AdminRecruitingPreview
        section={new URLSearchParams(location.search).get('section') || 'submissions'}
        state={state}
        onApprove={(id) => setState((current) => approvePreviewSubmission(current, id))}
        onAddCompany={addCompany}
        onSetActive={(id, active) => setState((current) => setPreviewCompanyActive(current, id, active))}
        onReset={() => setState(createPreviewState())}
      />
    </Suspense>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.previewHeader}>
        <div className={styles.brand}><img src="/photos/shpeLogo.png" alt="SHPE at Ohio State" width="500" height="155" /><span>SHPE at Ohio State<small>{page.area}</small></span></div>
      </header>

      <div className={styles.previewNotice}><span className={styles.demoDot} /><p><strong>Local preview.</strong> Use sample details only. Demo records are shared between these pages in this browser and expire after two hours without changes. Files are never uploaded. Sign-in is simulated.</p></div>

      {view === 'student' && <StudentSubmissionPreview companies={state.companies} onSubmit={submit} />}
      {view === 'recruiter' && <RecruiterDirectoryPreview company={company} students={students} />}

      <footer className={styles.footer}>
        <span>SHPE OSU · Fictional preview data</span>
        <span>Supporting the next generation of Hispanic STEM talent.</span>
      </footer>
    </main>
  );
}

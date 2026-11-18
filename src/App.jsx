import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ScrollToTop from './components/ScrollToTop';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Events from './pages/Events';
import Sponsors from './pages/Sponsors';
import Resources from './pages/Resources';
import Attendance from './pages/Attendance';
import AdminLogin from './pages/AdminLogin';
import ProtectedRoute from './components/ProtectedRoute';

/*
 * Lazily loaded routes.
 *
 * Keep page-specific code, including the admin dashboard and its charting
 * library, out of the bundle every public visitor pays for.
 */
const AdminDashboard = lazy(() => import('./pages/ConnectedAdminDashboard'));
const CompanyDashboard = lazy(() => import('./pages/CompanyDashboard'));
const ProfessionalDevelopment = lazy(() => import('./pages/ProfessionalDevelopment'));
const Eboard = lazy(() => import('./pages/EboardRedPolos'));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-4xl text-primary">
        progress_activity
      </span>
    </div>
  );
}

import ResumeUpload from './pages/ResumeUpload';
import CompanyLogin from './pages/CompanyLogin';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* ── Public site (with Navbar + Footer) ── */}
        <Route
          path="/*"
          element={
            <>
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/events" element={<Events />} />
                <Route path="/eboard" element={<Eboard />} />
                <Route path="/eboard-preview" element={<Navigate to="/eboard" replace />} />
                <Route path="/sponsors" element={<Sponsors />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/professional-development" element={<ProfessionalDevelopment />} />
                <Route path="*" element={<Home />} />
              </Routes>
              <Footer />
            </>
          }
        />

        {/* ── Hidden routes (no Navbar / no Footer) ── */}
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/resume-upload" element={<ResumeUpload />} />
        <Route path="/company" element={<CompanyLogin />} />
        <Route
          path="/company/dashboard"
          element={
            <ProtectedRoute>
              <CompanyDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/resumes"
          element={
            <ProtectedRoute requireAdmin>
              <Navigate to="/admin?tab=resume" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/recruiting-companies"
          element={<ProtectedRoute requireAdmin><Navigate to="/admin?tab=resume&section=companies" replace /></ProtectedRoute>}
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

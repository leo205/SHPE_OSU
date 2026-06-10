import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Events from './pages/Events';
import Eboard from './pages/Eboard';
import Sponsors from './pages/Sponsors';
import Resources from './pages/Resources';
import ProfessionalDevelopment from './pages/ProfessionalDevelopment';
import Attendance from './pages/Attendance';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

import ResumeUpload from './pages/ResumeUpload';
import CompanyLogin from './pages/CompanyLogin';
import CompanyDashboard from './pages/CompanyDashboard';
import AdminResumes from './pages/AdminResumes';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
        <Route path="/company/dashboard" element={<CompanyDashboard />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/resumes"
          element={
            <ProtectedRoute>
              <AdminResumes />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}


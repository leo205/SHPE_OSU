import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Events from './pages/Events';
import Eboard from './pages/Eboard';
import Sponsors from './pages/Sponsors';
import Resources from './pages/Resources';
import Attendance from './pages/Attendance';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
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
                <Route path="*" element={<Home />} />
              </Routes>
              <Footer />
            </>
          }
        />

        {/* ── Hidden routes (no Navbar / no Footer) ── */}
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}


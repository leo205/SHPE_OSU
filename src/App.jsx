import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Events from './pages/Events';
import Eboard from './pages/Eboard';
import Sponsors from './pages/Sponsors';
import Resources from './pages/Resources';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<Events />} />
        <Route path="/eboard" element={<Eboard />} />
        <Route path="/sponsors" element={<Sponsors />} />
        <Route path="/resources" element={<Resources />} />
        {/* Catch-all → Home */}
        <Route path="*" element={<Home />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}

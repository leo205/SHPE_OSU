import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { navLinks } from '../lib/navigation';

export default function Navbar() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (to) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <header className="fixed top-0 w-full z-50 bg-surface backdrop-blur-xl shadow-sm">
      <div className="flex justify-between items-center px-6 md:px-10 py-4 max-w-screen-2xl mx-auto font-headline font-semibold tracking-tight">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center transition-transform hover:scale-105"
        >
          <img src="/photos/shpeLogo.png" alt="SHPE OSU Logo" className="h-10 md:h-12 w-auto object-contain" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-8 items-center">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`transition-all duration-200 ${
                isActive(to)
                  ? 'text-primary border-b-2 border-primary pb-0.5'
                  : 'text-on-surface-variant hover:text-primary hover:scale-105'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-full hover:bg-surface-container transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className="material-symbols-outlined text-on-surface">
            {mobileOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-surface/95 backdrop-blur-xl border-t border-outline-variant/20 px-6 py-4 flex flex-col gap-4 font-headline font-semibold">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`py-2 transition-colors ${
                isActive(to)
                  ? 'text-primary border-l-4 border-primary pl-3'
                  : 'text-on-surface-variant hover:text-primary pl-3'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

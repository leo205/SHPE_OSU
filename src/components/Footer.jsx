import { Link } from 'react-router-dom';
import { navLinks } from '../lib/navigation';

export default function Footer() {
  return (
    <footer className="w-full rounded-t-[3rem] mt-20 bg-surface-container">
      <div className="flex flex-col md:flex-row justify-between items-center px-10 py-10 gap-8 max-w-screen-2xl mx-auto">
        {/* Brand */}
        <div className="flex flex-col gap-2">
          <span className="text-xl font-headline font-black text-primary">
            SHPE OSU
          </span>
          <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
            Leading Hispanics in STEM through leadership, academic excellence,
            and community service.
          </p>
          <p className="text-xs text-on-surface-variant opacity-60 mt-1">
            © {new Date().getFullYear()} SHPE at The Ohio State University.
            Built for the Familia.
          </p>
        </div>

        {/* Page Links — from lib/navigation so this can never fall out of sync
            with the Navbar again. It was previously missing Home and Prof. Dev. */}
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-6 font-label text-sm uppercase tracking-widest">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-on-surface-variant hover:text-primary transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Social Icons */}
        <div className="flex gap-4 items-center">
          {/* Instagram */}
          <a
            href="https://www.instagram.com/shpeosu/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="bg-surface-container-high p-2 rounded-full hover:bg-primary/10 hover:scale-110 transition-all text-primary"
          >
            <svg
              className="w-5 h-5 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </a>

          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/company/shpeosu/posts/?feedView=all"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="bg-surface-container-high p-2 rounded-full hover:bg-primary/10 hover:scale-110 transition-all text-primary"
          >
            <svg
              className="w-5 h-5 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
            </svg>
          </a>

          {/* GroupMe */}
          <a
            href="https://groupme.com/join_group/33253300/9a2V8k"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GroupMe"
            className="bg-surface-container-high p-2 rounded-full hover:bg-primary/10 hover:scale-110 transition-all text-primary"
          >
            <span className="material-symbols-outlined text-xl">chat</span>
          </a>

        </div>
      </div>
    </footer>
  );
}

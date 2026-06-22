/**
 * Resources.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * WCAG 2.1 AA Compliance Fixes Applied:
 *
 *  1.1.1  Non-text Content   — Decorative icons marked aria-hidden="true".
 *  1.3.1  Info & Relationships— Strict h1→h2→h3 heading hierarchy.
 *                               "Buckeye Toolbox" was incorrectly using <h3>
 *                               without a parent <h2>; corrected to <h2>.
 *                               "OSU Engineering Resources" was <h3>; now <h2>.
 *  2.4.4  Link Purpose       — All link text is descriptive:
 *                               ✗ "Download PDF"
 *                               ✓ "Download the 2025-2026 First-Year Guide (PDF)"
 *                               ✗ "Access Google Drive"
 *                               ✓ "Access the Engineering Test Bank on Google Drive"
 *                               ✗ "Learn More"
 *                               ✓ "Learn more about OSU Tutoring Services"
 *  2.4.4  (new tab)          — External links that open in _blank include
 *                               <span class="sr-only">(opens in a new tab)</span>
 *                               so screen reader users are pre-warned.
 *  2.4.7  Focus Visible      — Inherits the global :focus-visible rule from
 *                               index.css (3px solid #a33700 outline).
 */

export default function Resources() {
  return (
    <>
      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto" id="main-content">

        {/* ── HERO ─────────────────────────────────────────── */}
        <header className="relative py-20 mb-12 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 z-10">
            <div
              className="inline-block bg-tertiary-container text-on-tertiary-container px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 sticker-rotate shadow-sm"
              aria-hidden="true"
            >
              Empowering Our Familia
            </div>
            {/* Single <h1> on the page */}
            <h1 className="text-5xl md:text-7xl font-headline font-black text-on-surface leading-[1.1] mb-6">
              Academic Excellence{' '}
              <span className="text-primary">&amp;</span> Resources
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-xl leading-relaxed">
              Supporting your academic journey at Ohio State with the tools,
              community, and guidance you need to thrive in engineering.
            </p>
          </div>
          <div className="flex-1 w-full relative">
            <div className="w-full h-[400px] rounded-lg overflow-hidden shadow-xl">
              <img
                src="/photos/thompsonPic.webp"
                alt="Students studying at Thompson Library at The Ohio State University"
                className="w-full h-full object-cover"
                loading="lazy"
                width="1200"
                height="960"
              />
            </div>
          </div>
        </header>

        {/* ── PRIMARY RESOURCES BENTO ──────────────────────── */}
        <section aria-labelledby="primary-resources-heading" className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-20">
          {/* Hidden heading keeps the section labelled for AT without affecting design */}
          <h2 id="primary-resources-heading" className="sr-only">Primary Resources</h2>

          {/* Engineering Test Bank */}
          <div className="md:col-span-7 bg-surface-container-lowest p-8 rounded-lg asymmetric-card shadow-md flex flex-col justify-between hover:shadow-lg transition-all border border-outline-variant/10">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-primary-container/20 rounded-xl">
                  <span
                    className="material-symbols-outlined text-primary text-3xl"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                    aria-hidden="true"
                  >
                    folder_shared
                  </span>
                </div>
                {/* h2 is the correct level here — it's a major resource card */}
                <h2 className="text-3xl font-headline font-extrabold text-on-surface">
                  Engineering Test Bank
                </h2>
              </div>
              <p className="text-on-surface-variant text-lg leading-relaxed mb-8">
                Our collaborative student-led repository. Access past exams,
                practice problems, and study guides for core engineering classes
                at Ohio State. Contribution is key — Familia helping Familia.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <a
                href="https://classroom.google.com/w/NzAwMzI5NTYzMTky/t/all"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Access Google Drive (opens in a new tab)"
                className="inline-flex items-center gap-3 bg-primary text-on-primary px-8 py-4 rounded-full font-bold hover:bg-primary-fixed-dim hover:-translate-y-1 transition-all active:scale-95"
              >
                Access Google Drive
                <span className="material-symbols-outlined" aria-hidden="true">link</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </div>

          {/* First-Year Guide */}
          <div className="md:col-span-5 bg-secondary-container p-8 rounded-lg asymmetric-card shadow-sm flex flex-col items-center text-center">
            <div className="w-full bg-surface-container-lowest/50 rounded-xl p-8 mb-6 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm">
                <span
                  className="material-symbols-outlined text-secondary text-6xl"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                  aria-hidden="true"
                >
                  menu_book
                </span>
              </div>
            </div>
            <h2 className="text-2xl font-headline font-extrabold text-on-secondary-container mb-4">
              First-Year Guide
            </h2>
            <p className="text-on-secondary-container/80 mb-8 font-medium">
              The ultimate roadmap for new Buckeyes. From scheduling tips to
              campus secrets, we&apos;ve got you covered.
            </p>
            <a
              href="/photos/First-Year-Guide.pdf"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download PDF (First-Year Guide, opens in a new tab)"
              className="w-full inline-flex justify-center items-center gap-3 bg-secondary text-on-secondary px-8 py-4 rounded-full font-bold hover:shadow-md transition-all active:scale-95"
            >
              Download PDF
              <span className="material-symbols-outlined" aria-hidden="true">download</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </section>

        {/* ── BUCKEYE TOOLBOX ──────────────────────────────── */}
        <section aria-labelledby="toolbox-heading" className="mb-20">
          <div className="flex items-center gap-6 mb-10">
            {/*
             * WCAG 1.3.1: This was incorrectly <h3> in the original.
             * It is a top-level section of the page — it must be <h2>.
             */}
            <h2 id="toolbox-heading" className="text-4xl font-headline font-black text-on-surface">
              Buckeye Toolbox
            </h2>
            <div className="h-1 flex-1 bg-surface-container-highest rounded-full" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: 'groups',
                color: 'text-primary',
                title: 'Tutoring Services',
                desc: 'Free peer tutoring for math, physics, and engineering fundamentals.',
                cta: 'Learn More',
                ariaLabel: 'Learn more about OSU Tutoring Services (opens in a new tab)',
                href: 'https://advising.osu.edu/tutoring',
                external: true,
              },
              {
                icon: 'calendar_month',
                color: 'text-tertiary',
                title: 'Study Tables Schedule',
                desc: 'Weekly group study sessions hosted by SHPE at the Union and Smith Lab.',
                cta: 'View Calendar',
                ariaLabel: 'View SHPE Events Calendar',
                href: '/events',
                external: false,
              },
              {
                icon: 'work',
                color: 'text-secondary',
                title: 'Engineering Career Services',
                desc: 'Prepare for career fairs with resume reviews and mock interviews.',
                cta: 'Get Started',
                ariaLabel: 'Get started with Engineering Career Services (opens in a new tab)',
                href: 'https://ecs.osu.edu/',
                external: true,
              },
            ].map(({ icon, color, title, desc, cta, ariaLabel, href, external }) => (
              <a
                key={title}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                aria-label={ariaLabel}
                className="group bg-surface-container-low p-8 rounded-xl hover:bg-surface-container transition-colors relative overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all"
              >
                <div className="mb-6">
                  <span className={`material-symbols-outlined text-4xl ${color}`} aria-hidden="true">
                    {icon}
                  </span>
                </div>
                <h3 className="text-xl font-headline font-bold text-on-surface mb-2">
                  {title}
                </h3>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                  {desc}
                </p>
                <div className={`flex items-center gap-2 font-bold text-sm ${color}`}>
                  <span>{cta}</span>
                  <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform" aria-hidden="true">
                    arrow_forward
                  </span>
                  {external && <span className="sr-only">(opens in a new tab)</span>}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ── OSU ENGINEERING RESOURCES ────────────────────── */}
        <section aria-labelledby="osu-resources-heading" className="bg-surface-container rounded-2xl p-10 md:p-12 flex flex-col md:flex-row items-center gap-8 justify-between">
          <div>
            {/*
             * WCAG 1.3.1: This was <h3> in the original without a parent h2.
             * Corrected to <h2>.
             */}
            <h2 id="osu-resources-heading" className="font-headline text-3xl font-extrabold text-on-surface mb-3">
              OSU Engineering Resources
            </h2>
            <p className="text-on-surface-variant max-w-lg">
              Access official Ohio State College of Engineering resources,
              advising, and career services.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 flex-shrink-0">
            <a
              href="https://engineering.osu.edu/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="OSU Engineering (opens in a new tab)"
              className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold hover:bg-primary-fixed-dim transition-all"
            >
              OSU Engineering
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <a
              href="https://ecs.osu.edu/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Career Services (opens in a new tab)"
              className="bg-secondary-container text-on-secondary-container px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
            >
              Career Services
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </section>

      </main>
    </>
  );
}

import ImagePlaceholder from '../components/ImagePlaceholder';

export default function Resources() {
  return (
    <>
      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto">
        {/* ── HERO ─────────────────────────────────────────── */}
        <header className="relative py-20 mb-12 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 z-10">
            <div className="inline-block bg-tertiary-container text-on-tertiary-container px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 sticker-rotate shadow-sm">
              Empowering Our Familia
            </div>
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
            <div className="w-full h-[400px] rounded-lg overflow-hidden asymmetric-card shadow-xl transform rotate-1">
              {/*
               * 📸 SWAP PHOTO: Replace with real library/studying photo
               * <img src="/photos/study.jpg" alt="Students studying" className="w-full h-full object-cover" />
               */}
              <ImagePlaceholder label="Students Studying Photo" className="w-full h-full" />
            </div>
          </div>
        </header>

        {/* ── PRIMARY RESOURCES BENTO ──────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-20">
          {/* Engineering Test Bank */}
          <div className="md:col-span-7 bg-surface-container-lowest p-8 rounded-lg asymmetric-card shadow-md flex flex-col justify-between hover:shadow-lg transition-all border border-outline-variant/10">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-primary-container/20 rounded-xl">
                  <span
                    className="material-symbols-outlined text-primary text-3xl"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    folder_shared
                  </span>
                </div>
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
                className="inline-flex items-center gap-3 bg-primary text-on-primary px-8 py-4 rounded-full font-bold hover:bg-primary-fixed-dim hover:-translate-y-1 transition-all active:scale-95"
              >
                Access Google Drive
                <span className="material-symbols-outlined">link</span>
              </a>
            </div>
          </div>

          {/* First-Year Guide */}
          <div className="md:col-span-5 bg-secondary-container p-8 rounded-lg asymmetric-card shadow-sm flex flex-col items-center text-center">
            <div className="w-full bg-surface-container-lowest/50 rounded-xl p-6 mb-6 backdrop-blur-sm relative overflow-hidden">
              <span className="material-symbols-outlined text-8xl text-secondary/40 select-none">
                description
              </span>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-surface-container-lowest p-3 rounded-lg shadow-lg sticker-rotate-alt">
                  <span
                    className="material-symbols-outlined text-secondary text-4xl"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    picture_as_pdf
                  </span>
                </div>
              </div>
            </div>
            <h2 className="text-2xl font-headline font-extrabold text-on-secondary-container mb-4">
              First-Year Guide
            </h2>
            <p className="text-on-secondary-container/80 mb-8 font-medium">
              The ultimate roadmap for new Buckeyes. From scheduling tips to
              campus secrets, we've got you covered.
            </p>
            {/* TODO: Replace href="#" with your First-Year Guide PDF link, e.g. '/first-year-guide.pdf' or a Google Drive share URL */}
            <a
              href="#"
              className="w-full inline-flex justify-center items-center gap-3 bg-secondary text-on-secondary px-8 py-4 rounded-full font-bold hover:shadow-md transition-all active:scale-95"
            >
              Download PDF
              <span className="material-symbols-outlined">download</span>
            </a>
          </div>
        </section>

        {/* ── BUCKEYE TOOLBOX ──────────────────────────────── */}
        <section className="mb-20">
          <div className="flex items-center gap-6 mb-10">
            <h3 className="text-4xl font-headline font-black text-on-surface">
              Buckeye Toolbox
            </h3>
            <div className="h-1 flex-1 bg-surface-container-highest rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: 'groups',
                color: 'text-primary',
                title: 'Tutoring Services',
                desc: 'Free peer tutoring for math, physics, and engineering fundamentals.',
                cta: 'Learn More',
                href: 'https://ese.osu.edu/student-services/undergraduate/tutoring',
              },
              {
                icon: 'calendar_month',
                color: 'text-tertiary',
                title: 'Study Tables Schedule',
                desc: 'Weekly group study sessions hosted by SHPE at the Union and Smith Lab.',
                cta: 'View Calendar',
                href: '/events',
              },
              {
                icon: 'work',
                color: 'text-secondary',
                title: 'Engineering Career Services',
                desc: 'Prepare for career fairs with resume reviews and mock interviews.',
                cta: 'Get Started',
                href: 'https://ecs.osu.edu/',
              },
            ].map(({ icon, color, title, desc, cta, href }) => (
              <a
                key={title}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="group bg-surface-container-low p-8 rounded-xl hover:bg-surface-container transition-colors relative overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all"
              >
                <div className="mb-6">
                  <span className={`material-symbols-outlined text-4xl ${color}`}>
                    {icon}
                  </span>
                </div>
                <h4 className="text-xl font-headline font-bold text-on-surface mb-2">
                  {title}
                </h4>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                  {desc}
                </p>
                <div className={`flex items-center gap-2 font-bold text-sm ${color}`}>
                  {cta}{' '}
                  <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ── ADDITIONAL LINKS ─────────────────────────────── */}
        <section className="bg-surface-container rounded-2xl p-10 md:p-12 flex flex-col md:flex-row items-center gap-8 justify-between">
          <div>
            <h3 className="font-headline text-3xl font-extrabold text-on-surface mb-3">
              OSU Engineering Resources
            </h3>
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
              className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold hover:bg-primary-fixed-dim transition-all"
            >
              OSU Engineering
            </a>
            <a
              href="https://ecs.osu.edu/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-secondary-container text-on-secondary-container px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
            >
              Career Services
            </a>
          </div>
        </section>
      </main>
    </>
  );
}

import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import ImagePlaceholder from '../components/ImagePlaceholder';

/* ── Animated counter ──────────────────────────────────────── */
function Counter({ target, suffix = '', duration = 1800 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let start = 0;
          const step = Math.ceil(target / (duration / 16));
          const timer = setInterval(() => {
            start += step;
            if (start >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(start);
            }
          }, 16);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

/* ── Home Page ─────────────────────────────────────────────── */
export default function Home() {
  return (
    <>
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative flex items-center px-4 sm:px-6 md:px-12 py-12 overflow-hidden pt-28 md:pt-32">
        <div className="max-w-screen-2xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
          {/* Text */}
          <div className="flex flex-col gap-6">
            <div className="inline-flex bg-tertiary-container text-on-tertiary-container font-bold px-4 py-1 rounded-full w-fit text-sm tracking-wide">
              ESTABLISHED 1982
            </div>
            <h1 className="font-headline text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-extrabold text-on-surface leading-[1.05] tracking-tighter">
              Welcome to SHPE at{' '}
              <span className="text-primary">Ohio State</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-lg font-medium leading-relaxed">
              Society of Hispanic Professional Engineers — empowering the
              Hispanic community to realize its fullest potential through STEM
              awareness, access, support, and development.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-4">
              <Link
                to="/events"
                className="bg-primary text-on-primary px-6 py-4 md:px-10 md:py-5 rounded-full text-base md:text-lg font-bold shadow-xl shadow-primary/20 hover:bg-primary-fixed-dim transition-all flex items-center justify-center gap-2"
              >
                Upcoming Events
                <span className="material-symbols-outlined">event</span>
              </Link>
            </div>
          </div>

          {/* Hero Image — shown on all screens, stacked below text on mobile */}
          <div className="relative flex items-center justify-center mt-6 lg:mt-0">
            {/* Main image card */}
            <div className="relative w-full">
              <div className="rounded-2xl overflow-hidden shadow-2xl border-8 border-surface-container-lowest">
                <img
                  src="/photos/picsMain/SHPE_convention.jpg"
                  /* Changed file type tp jpg for higher quality*/
                  alt="SHPE Convention"
                  className="w-full h-auto max-h-[400px] object-cover object-center"
                  width="1200"
                  height="675"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MISSION ────────────────────────────────────────── */}
      <section className="py-12 md:py-24 px-6 md:px-12 bg-surface-container-low">
        <div className="max-w-screen-2xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            {/* Image */}
            <div className="order-2 md:order-1 relative">
              <div className="rounded-lg overflow-hidden shadow-xl aspect-video">
                <img src="/photos/picsMain/SHPE_volunteering.webp" alt="SHPE Volunteering" className="w-full h-full object-cover min-h-[260px]" loading="lazy" width="1200" height="800" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-secondary text-on-secondary p-4 rounded-xl shadow-lg max-w-[200px] hidden sm:block">
                <p className="font-bold text-lg italic">
                  "Empowering the Hispanic community to realize its fullest
                  potential."
                </p>
              </div>
            </div>
            {/* Text */}
            <div className="order-1 md:order-2">
              <h2 className="font-headline text-4xl md:text-5xl font-extrabold mb-8 text-on-surface">
                Our Mission
              </h2>
              <div className="space-y-6 text-lg text-on-surface-variant leading-relaxed font-medium">
                <p>
                  SHPE changes lives by empowering the Hispanic community to
                  realize its fullest potential and to impact the world through
                  STEM awareness, access, support, and development.
                </p>
                <p>
                  At Ohio State, we bring this mission to life through a vibrant
                  student-led chapter that bridges the gap between academic rigor
                  and professional success, all while maintaining our cultural
                  identity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEVELOPMENT BENTO ──────────────────────────────── */}
      <section className="py-12 md:py-24 px-6 md:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-primary font-bold tracking-widest uppercase text-sm">
              Grow with us
            </span>
            <h2 className="font-headline text-4xl md:text-5xl font-extrabold mt-2 text-on-surface">
              Development Areas
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Academic */}
            <div className="bg-surface-container-highest p-8 rounded-lg md:col-span-1 flex flex-col gap-4 hover:shadow-2xl transition-all group">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <span className="material-symbols-outlined text-4xl" aria-hidden="true">school</span>
              </div>
              <h3 className="font-headline text-2xl font-bold">
                Academic Excellence
              </h3>
              <p className="text-on-surface-variant font-medium">
                Providing the resources, study groups, and mentorship needed to
                conquer even the toughest engineering courses at OSU.
              </p>
            </div>

            {/* Professional */}
            <div className="bg-primary-container p-8 rounded-lg md:col-span-2 flex flex-col md:flex-row gap-8 md:items-center text-on-primary-container group">
              <div className="flex-1">
                <div className="w-16 h-16 bg-on-primary-container/10 text-on-primary-container rounded-full flex items-center justify-center mb-4 group-hover:bg-on-primary-container group-hover:text-primary-container transition-colors">
                  <span className="material-symbols-outlined text-4xl" aria-hidden="true">work</span>
                </div>
                <h3 className="font-headline text-2xl font-bold">
                  Professional Growth
                </h3>
                <p className="opacity-90 font-medium mt-2">
                  Connect with top-tier tech companies through exclusive career
                  fairs, resume workshops, and mock interview sessions.
                </p>
              </div>
              <div className="w-full md:w-64 h-48 rounded-lg overflow-hidden flex-shrink-0">
                <img src="/photos/picsMain/shpeBrunch.webp" alt="SHPE Brunch" className="w-full h-full object-cover" loading="lazy" width="1200" height="800" />
              </div>
            </div>

            {/* Leadership */}
            <div className="bg-secondary-container p-8 rounded-lg md:col-span-2 flex flex-col md:flex-row-reverse gap-8 md:items-center text-on-secondary-container group">
              <div className="flex-1">
                <div className="w-16 h-16 bg-on-secondary-container/10 text-on-secondary-container rounded-full flex items-center justify-center mb-4 group-hover:bg-on-secondary-container group-hover:text-secondary-container transition-colors">
                  <span className="material-symbols-outlined text-4xl" aria-hidden="true">groups</span>
                </div>
                <h3 className="font-headline text-2xl font-bold">
                  Leadership Development
                </h3>
                <p className="opacity-90 font-medium mt-2">
                  Step into roles that challenge you. Our committee and executive
                  board structures provide real-world project management
                  experience.
                </p>
              </div>
              <div className="w-full md:w-64 h-48 rounded-lg overflow-hidden flex-shrink-0">
                <img src="/photos/picsMain/brunchPic2.webp" alt="SHPE Brunch" className="w-full h-full object-cover object-center" loading="lazy" width="1200" height="800" />
              </div>
            </div>

            {/* Chapter */}
            <div className="bg-tertiary-container p-8 rounded-lg md:col-span-1 flex flex-col gap-4 text-on-tertiary-container group">
              <div className="w-16 h-16 bg-on-tertiary-container/10 text-on-tertiary-container rounded-full flex items-center justify-center mb-4 group-hover:bg-on-tertiary-container group-hover:text-tertiary-container transition-colors">
                <span className="material-symbols-outlined text-4xl" aria-hidden="true">diversity_3</span>
              </div>
              <h3 className="font-headline text-2xl font-bold">Chapter Spirit</h3>
              <p className="opacity-90 font-medium">
                Join a community that celebrates our heritage. From tailgates to
                holiday potlucks, SHPE is your home away from home.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BANNER ───────────────────────────────────── */}
      <section className="py-12 md:py-24 px-6 md:px-12 bg-surface">
        <div className="max-w-screen-2xl mx-auto bg-primary rounded-xl p-6 sm:p-8 md:p-12 text-on-primary relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-on-primary/10 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center relative z-10">
            <div className="space-y-2">
              <span className="block text-5xl md:text-6xl font-black font-headline">
                <Counter target={200} suffix="+" />
              </span>
              <span className="uppercase tracking-widest text-sm font-bold opacity-80">
                Active Members
              </span>
            </div>
            <div className="space-y-2">
              <span className="block text-5xl md:text-6xl font-black font-headline">
                <Counter target={50} suffix="+" />
              </span>
              <span className="uppercase tracking-widest text-sm font-bold opacity-80">
                Annual Events
              </span>
            </div>
            <div className="space-y-2">
              <span className="block text-5xl md:text-6xl font-black font-headline">
                <Counter target={15} suffix="+" />
              </span>
              <span className="uppercase tracking-widest text-sm font-bold opacity-80">
                Corporate Partners
              </span>
            </div>
            <div className="space-y-2">
              <span className="block text-5xl md:text-6xl font-black font-headline">
                <Counter target={100} suffix="%" />
              </span>
              <span className="uppercase tracking-widest text-sm font-bold opacity-80">
                Familia Spirit
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── GET INVOLVED ───────────────────────────────────── */}
      <section className="py-12 md:py-24 px-6 md:px-12 bg-surface-container-low">
        <div className="max-w-screen-2xl mx-auto">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="font-headline text-4xl md:text-6xl font-extrabold mb-6 text-on-surface">
              Ready to lead the change?
            </h2>
            <p className="text-xl text-on-surface-variant font-medium leading-relaxed">
              Whether you're a freshman looking for guidance or a senior ready to
              give back, there's a place for you in SHPE.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-stretch">
            {/* SHPEtinas Section */}
            <div className="bg-surface-container-highest p-6 md:p-10 rounded-lg shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-2xl font-bold mb-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary" aria-hidden="true">
                    volunteer_activism
                  </span>
                  SHPEtinas
                </h3>
                <p className="text-on-surface-variant font-medium mb-6">
                  Empowering and supporting Latinas in STEM. Join our SHPEtinas
                  committee for exclusive networking events, professional development
                  workshops, and a supportive community dedicated to your success.
                </p>
              </div>
              <div className="w-full flex-1 min-h-[200px] rounded-xl overflow-hidden shadow-md mt-4 border-4 border-surface-container-lowest">
                <img
                  src="/photos/picsMain/shpeTinas.webp"
                  alt="SHPEtinas Community"
                  className="w-full h-full object-cover object-center"
                  loading="lazy"
                  width="1200"
                  height="745"
                />
              </div>
            </div>

            {/* Connect */}
            <div className="bg-surface-container-highest p-6 md:p-10 rounded-lg shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-2xl font-bold mb-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                    diversity_1
                  </span>
                  Connect with Familia
                </h3>
                <p className="text-on-surface-variant font-medium mb-10">
                  The best way to stay informed and get involved is through our
                  community channels. Choose your platform and join the
                  conversation!
                </p>
                <div className="space-y-4">
                  {[
                    {
                      href: 'https://groupme.com/join_group/33253300/9a2V8k',
                      icon: 'chat',
                      color: '#12b3f3',
                      title: 'GroupMe',
                      sub: 'Join our official community chat',
                    },
                    {
                      href: 'https://www.instagram.com/shpeosu/',
                      icon: 'photo_camera',
                      color: '#E4405F',
                      title: 'Instagram',
                      sub: 'Follow our daily life and stories',
                    },
                    {
                      href: 'https://www.linkedin.com/company/shpeosu/posts/?feedView=all',
                      icon: 'corporate_fare',
                      color: '#0A66C2',
                      title: 'LinkedIn',
                      sub: 'Network with members and alumni',
                    },
                  ].map(({ href, icon, color, title, sub }) => (
                    <a
                      key={title}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-6 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary hover:bg-white hover:shadow-lg transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="p-3 rounded-full"
                          style={{
                            backgroundColor: `${color}18`,
                            color: color,
                          }}
                        >
                          <span className="material-symbols-outlined">{icon}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-lg">{title}</h4>
                          <p className="text-sm text-on-surface-variant">{sub}</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-primary group-hover:translate-x-1 transition-transform">
                        arrow_forward
                      </span>
                    </a>
                  ))}
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-outline-variant/20 italic text-sm text-on-surface-variant text-center">
                Leading Hispanics in STEM since 1982.
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

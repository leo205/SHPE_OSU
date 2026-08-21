import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEvents, mergeEvents, sortForCheckIn } from '../lib/events';
import {
  oneLiner, heroPhoto, belonging, whatYouGet, gallery,
  primaryAction, secondaryLinks,
} from '../data/join';

/**
 * /join — the involvement-fair landing page.
 *
 * This is not a normal page. It is a 45-second funnel, and the reading
 * conditions should drive every decision:
 *
 *   Someone is standing up, holding a tote bag, one-handed, on wifi shared with
 *   hundreds of other people, while a different booth competes for their
 *   attention. They will not scroll far and most will never come back.
 *
 * Consequences baked into the layout below:
 *
 *  - ONE action. Joining the GroupMe is the whole point; everything else is
 *    visually subordinate. Each extra thing added reduces the chance they do it.
 *  - "Do I belong here?" is answered high up. For someone who has never heard of
 *    SHPE that is the actual barrier, not "what do you do" — and student orgs
 *    consistently under-answer it.
 *  - Nothing blocks on the network. Copy, photos and the event list all render
 *    from the bundle; the database call only ever upgrades what is on screen.
 *  - Only the hero image loads eagerly. Every other photo is lazy, so pictures
 *    stream in as someone scrolls instead of delaying the button.
 *  - The 6.6 MB First-Year Guide is a quiet secondary link, never a button. At
 *    2,000 scans it would be ~14 GB of bandwidth and a 30-60 second wait each.
 *
 * Width: readable text columns stay narrow (max-w-2xl / max-w-3xl) because long
 * lines are hard to read, but the SECTIONS go full width so the page does not
 * sit in a thin ribbon with empty margins on a laptop.
 *
 * Content and photos live in src/data/join.js so they can be changed without
 * touching JSX.
 */
export default function Join() {
  // Seeded from the bundled list so the section renders immediately; the DB
  // fetch only replaces it if it returns something.
  const [nextEvent, setNextEvent] = useState(
    () => sortForCheckIn(mergeEvents([]))[0] ?? null
  );

  useEffect(() => {
    let cancelled = false;
    fetchEvents()
      .then((all) => {
        if (cancelled) return;
        const soonest = sortForCheckIn(all)[0];
        if (soonest) setNextEvent(soonest);
      })
      .catch(() => {
        /* Bundled list already on screen; a failure changes nothing. */
      });
    return () => { cancelled = true; };
  }, []);

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isUpcoming = nextEvent && nextEvent.date >= todayStr;

  return (
    <main className="min-h-screen bg-surface">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8 lg:px-12 pt-10 pb-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="text-center lg:text-left">
            <img
              src="/photos/shpeLogo.png"
              alt="SHPE at Ohio State"
              className="h-14 w-auto object-contain mx-auto lg:mx-0 mb-6"
              width="200" height="56"
            />

            <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-extrabold text-on-surface leading-[1.05] tracking-tight">
              Welcome to <span className="text-primary">SHPE</span> at Ohio State
            </h1>

            <p className="mt-5 text-on-surface-variant text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
              {oneLiner}
            </p>

            {/* Sits above the explanations on purpose — plenty of people decide
                before they finish reading. */}
            <a
              href={primaryAction.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center justify-center gap-3 w-full sm:w-auto bg-primary text-on-primary px-10 py-5 rounded-full font-bold text-lg shadow-lg hover:bg-primary-fixed-dim active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" aria-hidden="true">chat</span>
              {primaryAction.label}
            </a>
            <p className="mt-3 text-sm text-on-surface-variant">{primaryAction.note}</p>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-2xl border-8 border-surface-container-lowest">
            <img
              src={heroPhoto.src}
              alt={heroPhoto.alt}
              width={heroPhoto.width}
              height={heroPhoto.height}
              className="w-full aspect-[16/9] object-cover object-center"
            />
          </div>
        </div>
      </section>

      {/* ── The question people are actually asking ─────────────────── */}
      <section aria-labelledby="belong-heading" className="px-5 sm:px-8 lg:px-12 py-14 bg-surface-container-low">
        <div className="max-w-5xl mx-auto">
          <h2
            id="belong-heading"
            className="font-headline text-3xl sm:text-4xl font-extrabold text-on-surface text-center mb-10"
          >
            Wondering if you belong here?
          </h2>

          <dl className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {belonging.map(({ question, answer }) => (
              <div
                key={question}
                className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/20"
              >
                <dt className="font-headline font-bold text-on-surface flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0" aria-hidden="true">
                    help
                  </span>
                  {question}
                </dt>
                <dd className="mt-2 text-on-surface-variant leading-relaxed">{answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── What you get ───────────────────────────────────────────── */}
      <section aria-labelledby="get-heading" className="px-5 sm:px-8 lg:px-12 py-14">
        <div className="max-w-6xl mx-auto">
          <h2
            id="get-heading"
            className="font-headline text-3xl sm:text-4xl font-extrabold text-on-surface text-center mb-10"
          >
            What you get
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {whatYouGet.map(({ icon, title, text, photo, alt }) => (
              <div key={title} className="flex flex-col">
                {/* Fixed 4:3 frame — data/join.js keeps these landscape-only,
                    because cropping a portrait source here cuts its top and
                    bottom off. */}
                <div className="rounded-2xl overflow-hidden shadow-lg mb-5">
                  <img
                    src={photo}
                    alt={alt}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover object-center"
                    width="900" height="675"
                  />
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
                  </div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">{title}</h3>
                </div>
                <p className="text-on-surface-variant leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery ────────────────────────────────────────────────── */}
      <section aria-labelledby="gallery-heading" className="px-5 sm:px-8 lg:px-12 pt-14 pb-12 bg-surface-container-low">
        <div className="max-w-6xl mx-auto">
          <h2
            id="gallery-heading"
            className="font-headline text-3xl sm:text-4xl font-extrabold text-on-surface text-center mb-3"
          >
            This is the Familia
          </h2>
          <p className="text-on-surface-variant text-center max-w-2xl mx-auto mb-10">
            Brunches, study tables, volunteering, conventions — and a lot of food.
          </p>

          {/* Uniform square grid, six items, so it tiles evenly with a flat
              bottom edge. A masonry layout here left one column much longer
              than the others and a block of dead space below it. Keeping the
              count a multiple of the column count is what keeps it even.

              Corners use the "2xl" step (16px), not "xl". tailwind.config.js
              overrides the radius scale, so the "xl" step is 3rem/48px here —
              three times rounder than "2xl" despite the name. At 48px these
              tiles rendered as blobs on a phone, where each is only ~167px. */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gallery.map(({ src, alt }) => (
              <div key={src} className="rounded-2xl overflow-hidden shadow-md bg-surface-container">
                <img
                  src={src}
                  alt={alt}
                  loading="lazy"
                  className="w-full aspect-square object-cover object-center"
                  width="900" height="900"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Next event. Hidden entirely when there is nothing upcoming,
             because "our last event was in April" is worse than silence. ── */}
      {isUpcoming && (
        <section aria-labelledby="next-heading" className="px-5 sm:px-8 lg:px-12 py-14">
          <div className="max-w-3xl mx-auto bg-tertiary-container text-on-tertiary-container rounded-2xl p-8 text-center">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80">
              Come to our next event
            </p>
            <h2 id="next-heading" className="font-headline text-2xl sm:text-3xl font-extrabold mt-2">
              {nextEvent.title}
            </h2>
            <p className="mt-3 font-medium">
              {new Date(nextEvent.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
              {nextEvent.time ? ` · ${nextEvent.time}` : ''}
              {nextEvent.location ? ` · ${nextEvent.location}` : ''}
            </p>
            <Link
              to="/events"
              className="inline-block mt-5 text-sm font-bold underline underline-offset-4"
            >
              See the full calendar
            </Link>
          </div>
        </section>
      )}

      {/* ── Second chance at the primary action, for anyone who scrolled ── */}
      <section className="px-5 sm:px-8 lg:px-12 pt-12 pb-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-on-surface mb-5">
            Ready to join us?
          </h2>
          <a
            href={primaryAction.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-3 w-full sm:w-auto bg-primary text-on-primary px-10 py-5 rounded-full font-bold text-lg shadow-lg hover:bg-primary-fixed-dim active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined" aria-hidden="true">chat</span>
            {primaryAction.label}
          </a>
        </div>
      </section>

      {/* ── Everything else, deliberately quiet ─────────────────────── */}
      <section aria-labelledby="more-heading" className="px-5 sm:px-8 lg:px-12 pb-14 pt-8">
        <div className="max-w-3xl mx-auto">
          <h2 id="more-heading" className="sr-only">More about SHPE OSU</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {secondaryLinks.map(({ label, href, note }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-center hover:bg-surface-container transition-colors"
              >
                <span className="block font-bold text-on-surface text-sm">{label}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5">{note}</span>
              </a>
            ))}
          </div>

          <Link
            to="/"
            className="block text-center mt-6 text-sm font-bold text-primary hover:underline"
          >
            Explore the full site →
          </Link>
        </div>
      </section>
    </main>
  );
}

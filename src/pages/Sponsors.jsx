import { useState, useRef, useEffect } from 'react';
import emailjs from '@emailjs/browser';
import ImagePlaceholder from '../components/ImagePlaceholder';

/*
 * ══════════════════════════════════════════════════════════════
 *  EmailJS Setup — Quick 3-step process (takes ~5 minutes):
 *
 *  1. Go to https://emailjs.com and create a free account
 *  2. Add an Email Service (Gmail works great) — copy the Service ID
 *  3. Create an Email Template with these variables:
 *       {{company_name}}, {{contact_name}}, {{reply_to}}, {{tier}}, {{message}}
 *     Set the "To email" to: santosmartinez.2@osu.edu
 *     Copy the Template ID and your Public Key (Account > API Keys)
 *  4. Paste all three IDs below:
 * ══════════════════════════════════════════════════════════════
 */
const EMAILJS_SERVICE_ID = 'service_2mxh4lk';
const EMAILJS_TEMPLATE_ID = 'template_5ngu58z';
const EMAILJS_PUBLIC_KEY = 'crKODcgRV-tKTx-Ha';

/*
 * ── Sponsor Tiers ─────────────────────────────────────────────
 * Update prices, names, and benefits as needed.
 */
const tiers = [
  {
    name: 'Buckeye',
    price: '$500',
    accent: 'secondary',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
    ],
  },
  {
    name: 'Carmen',
    price: '$1,000',
    accent: 'secondary',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
      'Industry Competition Invitation',
      'Company Logo on Merch',
      'Social Media Feature',
      'Workshop Session',
    ],
  },
  {
    name: 'Scarlet & Gray',
    price: '$1,500',
    accent: 'secondary',
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
      'Industry Competition Invitation',
      'Company Logo on Merch',
      'Social Media Feature',
      'Workshop Session',
      'Sponsor National Convention Attendance',
      'Tabling at a General Meeting',
    ],
  },
  {
    name: 'Platinum',
    price: '$2,000',
    accent: 'primary',
    premium: true,
    benefits: [
      'Networking Brunch Invitation',
      'Resume Book Access',
      'Feature on SHPE OSU Website',
      'Industry Competition Invitation',
      'Company Logo on Merch',
      'Social Media Feature',
      'Workshop Session',
      'Sponsor National Convention Attendance',
      'Tabling at a General Meeting',
      'Community Outreach Invitation (K-12)',
      'SHPEasada Invitation',
      'Primary Sponsor Status',
    ],
  },
];

/*
 * ── Current & Past Sponsors ────────────────────────────────────
 * Add logos to /public/logos/ and update the `logo` field.
 * Example: logo: '/logos/lockheed.png'
 */
const sponsors = {
  platinum: [
    { name: 'Lincoln Electric', logo: '/photos/sponsors/lincolnElectric.png' },
    { name: 'Accenture', logo: '/photos/sponsors/Accenture.png' },
  ],
  gold: [
    { name: 'GM', logo: '/photos/sponsors/GM.png' },
    { name: 'JPMC', logo: '/photos/sponsors/JPMC.png' },
  ],
  bronze: [
    { name: 'Honda', logo: '/photos/sponsors/honda.png' },
    { name: 'AEP', logo: '/photos/sponsors/AEP.png' },
  ],
};

/* ── Sponsor Logo Card ─────────────────────────────────────── */
function SponsorCard({ sponsor, size = 'lg' }) {
  const h = size === 'lg' ? 'h-28' : size === 'md' ? 'h-24' : 'h-20';
  const w = size === 'lg' ? 'w-[320px]' : size === 'md' ? 'w-[280px]' : 'w-[240px]';
  return (
    <div className={`bg-surface-container-lowest p-6 md:p-8 rounded-lg flex items-center justify-center hover:scale-[1.02] transition-all duration-300 platinum-glow border border-outline-variant/20 max-w-full ${w}`}>
      {sponsor.logo ? (
        <img
          src={sponsor.logo}
          alt={`${sponsor.name} logo`}
          className={`${h} max-w-full object-contain`}
        />
      ) : (
        /*
         * 📸 SWAP LOGO:
         * 1. Add logo to /public/logos/companyname.png
         * 2. Set `logo: '/logos/companyname.png'` in the sponsors object above
         */
        <ImagePlaceholder
          label={`${sponsor.name} Logo`}
          className={`${h} w-full max-w-[200px]`}
        />
      )}
    </div>
  );
}

/* ── Sponsorship Contact Form ──────────────────────────────── */
function ContactForm() {
  const formRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('sponsorFormData');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return {
      company_name: '',
      contact_name: '',
      reply_to: '',
      tier: 'Buckeye ($500)',
      message: '',
    };
  });

  useEffect(() => {
    localStorage.setItem('sponsorFormData', JSON.stringify(formData));
  }, [formData]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');

    try {
      await emailjs.sendForm(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        formRef.current,
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      setStatus('success');
      formRef.current.reset();
      localStorage.removeItem('sponsorFormData');
      setFormData({ company_name: '', contact_name: '', reply_to: '', tier: 'Buckeye ($500)', message: '' });
    } catch (err) {
      console.error('EmailJS error:', err);
      setStatus('error');
    }
  };

  return (
    <section
      className="max-w-4xl mx-auto px-6 pb-24"
      id="become-a-sponsor"
    >
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-10 md:p-16 shadow-lg">
        <div className="text-center mb-12">
          <h2 className="font-headline text-4xl font-bold text-on-surface mb-4">
            Become a Sponsor
          </h2>
          <p className="text-on-surface-variant">
            Interested in partnering with SHPE at OSU? Fill out this quick form
            and our team will reach out within 2–3 business days to discuss
            partnership opportunities.
          </p>
        </div>

        {status === 'success' && (
          <div className="mb-8 p-5 bg-tertiary-container text-on-tertiary-container rounded-xl font-bold text-center text-lg">
            🎉 Thank you! We'll be in touch at your email soon.
          </div>
        )}
        {status === 'error' && (
          <div className="mb-8 p-5 bg-error-container text-on-error-container rounded-xl font-bold text-center">
            Something went wrong. Please email us directly at{' '}
            <a
              href="mailto:santosmartinez.2@osu.edu"
              className="underline"
            >
              santosmartinez.2@osu.edu
            </a>
          </div>
        )}

        <form ref={formRef} className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                className="block text-sm font-bold text-on-surface mb-2"
                htmlFor="company_name"
              >
                Company Name <span className="text-primary">*</span>
              </label>
              <input
                id="company_name"
                name="company_name"
                required
                type="text"
                value={formData.company_name}
                onChange={handleChange}
                placeholder="Acme Corp"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <div>
              <label
                className="block text-sm font-bold text-on-surface mb-2"
                htmlFor="contact_name"
              >
                Contact Name <span className="text-primary">*</span>
              </label>
              <input
                id="contact_name"
                name="contact_name"
                required
                type="text"
                value={formData.contact_name}
                onChange={handleChange}
                placeholder="Jane Smith"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-bold text-on-surface mb-2"
              htmlFor="reply_to"
            >
              Email Address <span className="text-primary">*</span>
            </label>
            <input
              id="reply_to"
              name="reply_to"
              required
              type="email"
              value={formData.reply_to}
              onChange={handleChange}
              placeholder="jane@acmecorp.com"
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          <div>
            <label
              className="block text-sm font-bold text-on-surface mb-2"
              htmlFor="tier"
            >
              Sponsorship Tier of Interest
            </label>
            <select
              id="tier"
              name="tier"
              value={formData.tier}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            >
              <option>Buckeye ($500)</option>
              <option>Carmen ($1,000)</option>
              <option>Scarlet &amp; Gray ($1,500)</option>
              <option>Platinum ($2,000)</option>
              <option>Custom</option>
            </select>
          </div>

          <div>
            <label
              className="block text-sm font-bold text-on-surface mb-2"
              htmlFor="message"
            >
              Brief Message (Optional)
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={4}
              placeholder="Tell us a bit about your interest in partnering with SHPE at OSU…"
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
            />
          </div>

          <div className="pt-4 flex justify-center">
            <button
              type="submit"
              disabled={status === 'sending'}
              className="bg-primary text-on-primary px-14 py-4 rounded-full font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-3"
            >
              {status === 'sending' ? (
                <>
                  <span className="material-symbols-outlined animate-spin">
                    progress_activity
                  </span>
                  Sending…
                </>
              ) : (
                'Submit Inquiry'
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

/* ── Sponsors Page ─────────────────────────────────────────── */
export default function Sponsors() {
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('sponsorsScrollY');
    if (savedScroll) {
      // Small timeout to bypass the browser's default reset
      setTimeout(() => {
        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
      }, 10);
    }

    const handleBeforeUnload = () => {
      sessionStorage.setItem('sponsorsScrollY', window.scrollY);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <>
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative px-6 md:px-12 pt-36 pb-24 overflow-hidden">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="z-10">
            <span className="inline-block px-4 py-1 mb-6 bg-tertiary-container text-on-tertiary-container text-xs font-bold uppercase tracking-widest rounded-full sticker-rotate-neg">
              Corporate Partnership
            </span>
            <h1 className="font-headline text-6xl md:text-7xl font-extrabold text-primary leading-tight mb-6">
              Partner with SHPE at OSU
            </h1>
            <p className="text-xl text-on-surface-variant leading-relaxed mb-10 max-w-xl">
              Empowering Hispanic engineers through corporate collaboration.
              Together, we bridge the gap between classroom theory and industry
              excellence while fostering the next generation of STEM leaders.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="#become-a-sponsor"
                className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-lg hover:-translate-y-1 inline-block"
              >
                Become a Sponsor
              </a>
              {/*
               * To use the packet: Drop your PDF into the public/ folder
               * and name it "Sponsorship_Packet.pdf"
               */}
              <a
                href="/Sponsorship_Packet.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-secondary-container text-on-secondary-container px-8 py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-all inline-block"
              >
                View Packet
              </a>
            </div>
          </div>
          <div className="relative scale-105 md:scale-110">
            <div className="relative z-10 rounded-lg overflow-hidden border-8 border-surface-container-lowest shadow-2xl">
              <img src="/photos/sponsors/eventGM.jpg" alt="Partnership Hero" className="w-full aspect-[4/3] object-cover object-center" />
            </div>
            <div className="absolute -bottom-6 -left-6 z-20 bg-primary-container p-6 rounded-lg text-on-primary-container shadow-xl">
              <p className="font-headline font-black text-4xl">200+</p>
              <p className="font-bold text-sm uppercase">Active Members</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CURRENT SPONSORS ───────────────────────────────── */}
      <section className="bg-surface-container-low py-24">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-headline text-5xl font-black text-primary italic tracking-tight">
              Our Sponsors
            </h2>
            <div className="h-1.5 w-24 bg-primary-container mx-auto rounded-full mt-4" />
            <p className="text-on-surface-variant mt-4 text-sm">
              We're proud to partner with leading companies who invest in
              Hispanic STEM talent.
            </p>
          </div>

          <div className="space-y-16">
            {/* Platinum */}
            <div className="flex flex-col items-center">
              <h3 className="font-headline text-xs font-black text-on-surface-variant uppercase tracking-[0.3em] mb-8">
                Platinum Sponsors
              </h3>
              <div className="flex flex-wrap justify-center gap-6 w-full max-w-5xl">
                {sponsors.platinum.map((s, i) => (
                  <SponsorCard key={i} sponsor={s} size="lg" />
                ))}
              </div>
            </div>
            {/* Gold */}
            <div className="flex flex-col items-center">
              <h3 className="font-headline text-xs font-black text-on-surface-variant uppercase tracking-[0.3em] mb-8">
                Gold Sponsors
              </h3>
              <div className="flex flex-wrap justify-center gap-6 w-full max-w-5xl">
                {sponsors.gold.map((s, i) => (
                  <SponsorCard key={i} sponsor={s} size="md" />
                ))}
              </div>
            </div>
            {/* Bronze */}
            <div className="flex flex-col items-center">
              <h3 className="font-headline text-xs font-black text-on-surface-variant uppercase tracking-[0.3em] mb-8">
                Bronze Sponsors
              </h3>
              <div className="flex flex-wrap justify-center gap-6 w-full max-w-5xl">
                {sponsors.bronze.map((s, i) => (
                  <SponsorCard key={i} sponsor={s} size="sm" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SPONSORSHIP TIERS ──────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-screen-xl mx-auto">
          <div className="mb-16">
            <h2 className="font-headline text-5xl font-black text-primary italic tracking-tight">
              SponsorSHPE Tiers
            </h2>
            <p className="text-on-surface-variant font-medium mt-2">
              Select the level that best aligns with your recruitment goals.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl p-8 flex flex-col transition-all ${tier.premium
                  ? 'bg-primary text-on-primary shadow-2xl scale-105 z-10'
                  : 'bg-surface-container hover:bg-surface-container-highest'
                  }`}
              >
                <div className="mb-6">
                  <h3
                    className={`font-headline text-2xl font-bold ${tier.premium ? 'text-on-primary' : 'text-secondary'
                      }`}
                  >
                    {tier.name}
                  </h3>
                  <div
                    className={`text-4xl font-black mt-2 ${tier.premium ? 'text-white' : 'text-primary'
                      }`}
                  >
                    {tier.price}
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                  {tier.benefits.map((b) => (
                    <li key={b} className="flex gap-3 text-sm font-medium">
                      <span
                        className={`material-symbols-outlined text-[20px] flex-shrink-0 ${tier.premium ? 'text-tertiary-container' : 'text-primary'
                          }`}
                        style={{ fontVariationSettings: '"FILL" 1' }}
                      >
                        {tier.premium ? 'stars' : 'check_circle'}
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
                <a
                  href="#become-a-sponsor"
                  className={`text-center py-3 rounded-full font-bold transition-all ${tier.premium
                    ? 'bg-on-primary text-primary hover:opacity-90'
                    : 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
                    }`}
                >
                  Get Started
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT FORM ───────────────────────────────────── */}
      <ContactForm />
    </>
  );
}

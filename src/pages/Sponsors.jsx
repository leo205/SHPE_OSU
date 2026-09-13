import { useState, useRef, useEffect } from 'react';
import ImagePlaceholder from '../components/ImagePlaceholder';
import TurnstileWidget from '../components/TurnstileWidget';
import { scrollToAnchor } from '../lib/scroll';
import { supabase } from '../lib/supabase';
import {
  prepareInquiryDraft,
  SPONSOR_TIERS,
  SPONSOR_TIER_LABELS,
  sponsorInquiryErrorMessage,
  submitSponsorInquiry,
} from '../lib/sponsorInquiry';
import { TURNSTILE_SITE_KEY } from '../lib/turnstile';

// Pricing cards and their exact inquiry labels share one immutable definition
// in sponsorInquiry.js. "Custom" is the only non-card option.
const TIER_OPTIONS = SPONSOR_TIER_LABELS;

/*
 * ── Current & Past Sponsors ────────────────────────────────────
 * Add logos to /public/logos/ and update the `logo` field.
 * Example: logo: '/logos/lockheed.png'
 */
/*
 * Current sponsors, grouped by the tier they actually purchased.
 *
 * The tier names here match `SPONSOR_TIERS` — the levels we actually
 * sell. They used to be "platinum / gold / bronze", which are not levels this
 * chapter offers, so a company that bought Scarlet & Gray ($1,500) was being
 * displayed under a "Platinum" heading. Grouping by the real tier keeps the
 * logo wall consistent with the pricing table on the same page.
 *
 * Amounts are from the chapter sponsorship sheet and map onto the tier prices
 * exactly ($500 Buckeye / $1,000 Carmen / $1,500 Scarlet & Gray / $2,000
 * Platinum), which is how the two blank tier cells in the sheet were resolved.
 *
 * To update: add the logo to public/photos/sponsors/ as .webp and add an entry
 * under the right tier. Empty tiers are hidden automatically.
 */
const sponsors = {
  'Platinum': [],                                          // $2,000 — none yet
  'Scarlet & Gray': [                                      // $1,500
    { name: 'Lincoln Electric', logo: '/photos/sponsors/lincolnElectric.webp' },
  ],
  'Carmen': [                                              // $1,000
    { name: 'Honda', logo: '/photos/sponsors/honda.webp' },
    { name: 'Burns & McDonnell', logo: '/photos/sponsors/burnsMcDonnell.webp' },
    { name: 'Whiting-Turner', logo: '/photos/sponsors/wtLogo.jpg' },
  ],
  'Buckeye': [                                             // $500
    { name: 'Gresham Smith', logo: '/photos/sponsors/greshamSmith.webp' },
  ],
};

// Largest card for the highest tier, so the visual hierarchy matches the price.
// A tier missing from this map falls back to 'sm' at the call site — NOT to
// SponsorCard's own 'lg' default, which would hand a brand-new cheap tier the
// biggest card on the page and quietly outrank the sponsors who paid more.
const TIER_CARD_SIZE = {
  'Platinum': 'lg',
  'Scarlet & Gray': 'lg',
  'Carmen': 'md',
  'Buckeye': 'sm',
};

/* ── Sponsor Logo Card ─────────────────────────────────────── */
/**
 * WCAG 1.1.1 Non-text Content:
 * Every corporate logo image must have an explicit, descriptive alt attribute.
 * When the logo acts as a purely decorative flourish inside a labelled section,
 * we still provide company identity alt text so AT users understand who sponsors us.
 * Format: "[Company] corporate sponsor logo"
 */
function SponsorCard({ sponsor, size = 'lg' }) {
  const h = size === 'lg' ? 'h-28' : size === 'md' ? 'h-24' : 'h-20';
  const w = size === 'lg' ? 'w-[320px]' : size === 'md' ? 'w-[280px]' : 'w-[240px]';
  return (
    <div className={`bg-surface-container-lowest p-6 md:p-8 rounded-lg flex items-center justify-center hover:scale-[1.02] transition-all duration-300 platinum-glow border border-outline-variant/20 max-w-full ${w}`}>
      {sponsor.logo ? (
        <img
          src={sponsor.logo}
          alt={`${sponsor.name} corporate sponsor logo`}
          className={`${h} max-w-full object-contain`}
          loading="lazy"
          width="600"
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
// Draft is kept in sessionStorage, not localStorage: recruiters often fill this
// out on shared/conference machines, and the draft holds their name and email.
// sessionStorage dies with the tab; localStorage persisted it indefinitely.
const DRAFT_KEY = 'sponsorFormDraft';
const EMPTY_FORM = {
  company_name: '',
  contact_name: '',
  reply_to: '',
  tier: SPONSOR_TIERS[0].label,
  message: '',
};

// These mirror the server caps for quick feedback. The Edge Function remains
// authoritative because browser validation is always bypassable.
const MAX_LEN = { company_name: 150, contact_name: 120, reply_to: 254, message: 2000 };

/**
 * `pick` is `{ label, seq }` from the parent. The sequence number matters: after
 * a successful submit the form resets to the cheapest tier, so a plain
 * `[label]` dependency would ignore a second click on the SAME tier and leave
 * the wrong one selected. Bumping `seq` on every click makes each one distinct.
 */
function ContactForm({ pick }) {
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [formData, setFormData] = useState(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) return { ...EMPTY_FORM, ...JSON.parse(saved) };
    } catch {
      // Corrupt draft — drop it rather than leaving it to fail on every load.
      sessionStorage.removeItem(DRAFT_KEY);
    }
    return EMPTY_FORM;
  });

  // The UUID survives an ambiguous manual retry so duplicate emails can be
  // recognized. Editing the draft starts a new inquiry identity.
  const inquiryDraftRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    } catch {
      // Private-browsing quota errors shouldn't break typing.
    }
  }, [formData]);

  // A Get Started click wins over whatever the restored draft had, since it is
  // the more recent expression of intent. Skipped on first mount (seq 0) so the
  // draft survives a plain page reload.
  useEffect(() => {
    if (!pick?.seq || !pick.label) return;
    inquiryDraftRef.current = null;
    setFormData((prev) => ({ ...prev, tier: pick.label }));
  }, [pick?.seq, pick?.label]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const cap = MAX_LEN[name];
    inquiryDraftRef.current = null;
    setStatus('idle');
    setErrorMsg('');
    setFormData((prev) => ({ ...prev, [name]: cap ? value.slice(0, cap) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sendingRef.current) return;

    const company = formData.company_name.trim();
    const contact = formData.contact_name.trim();
    const email = formData.reply_to.trim();

    if (!company || !contact || !email) {
      setStatus('error');
      setErrorMsg('Please fill in your company name, contact name, and email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus('error');
      setErrorMsg('That email address doesn’t look right. Please double-check it.');
      return;
    }
    if (!TIER_OPTIONS.includes(formData.tier)) {
      setStatus('error');
      setErrorMsg('Please choose a valid sponsorship tier.');
      return;
    }
    if (!turnstileToken) {
      setStatus('error');
      setErrorMsg(sponsorInquiryErrorMessage('verification_required'));
      return;
    }

    const fields = {
      company_name: company,
      contact_name: contact,
      reply_to: email.toLowerCase(),
      tier: formData.tier,
      message: formData.message.trim(),
    };
    inquiryDraftRef.current = prepareInquiryDraft(inquiryDraftRef.current, fields);
    const inquiryId = inquiryDraftRef.current.id;

    sendingRef.current = true;
    setStatus('sending');
    setErrorMsg('');

    try {
      const result = await submitSponsorInquiry(supabase, {
        fields,
        inquiryId,
        turnstileToken,
      });
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(sponsorInquiryErrorMessage(result.reason));
        return;
      }

      setStatus('success');
      sessionStorage.removeItem(DRAFT_KEY);
      inquiryDraftRef.current = null;
      setFormData(EMPTY_FORM);
    } catch {
      setStatus('error');
      setErrorMsg(sponsorInquiryErrorMessage('delivery_unconfirmed'));
    } finally {
      sendingRef.current = false;
      // Turnstile tokens are single-use. Require a fresh challenge after every
      // real Edge request, regardless of whether its response was successful.
      setTurnstileToken('');
      setTurnstileResetKey((key) => key + 1);
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
          <div role="alert" className="mb-8 p-5 bg-error-container text-on-error-container rounded-xl font-bold text-center">
            {errorMsg || 'Something went wrong.'}
            <div className="mt-1 font-medium">
              You can also email us directly at{' '}
              <a
                href="mailto:santosmartinez.2@osu.edu"
                className="underline"
              >
                santosmartinez.2@osu.edu
              </a>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset disabled={status === 'sending'} className="space-y-6">
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
                maxLength={150}
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
                maxLength={120}
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
              maxLength={254}
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
              {TIER_OPTIONS.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
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
              maxLength={2000}
              value={formData.message}
              onChange={handleChange}
              rows={4}
              placeholder="Tell us a bit about your interest in partnering with SHPE at OSU…"
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
            />
          </div>

          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            action="sponsor_inquiry"
            onToken={setTurnstileToken}
            resetKey={turnstileResetKey}
          />

          <div className="pt-4 flex justify-center">
            <button
              type="submit"
              disabled={status === 'sending' || !turnstileToken}
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
          </fieldset>
        </form>
      </div>
    </section>
  );
}

/* ── Sponsors Page ─────────────────────────────────────────── */
export default function Sponsors() {
  // Which tier the visitor clicked "Get Started" on. Every card used to link to
  // the same #become-a-sponsor anchor, so clicking Platinum scrolled you to a
  // form defaulting to Buckeye — and unless you noticed, that is the tier the
  // E-Board received the inquiry under.
  const [tierPick, setTierPick] = useState({ label: null, seq: 0 });
  // NOTE: this page used to save its scroll offset to sessionStorage and restore
  // it on mount, behind a 10ms setTimeout whose comment said it was there "to
  // bypass the browser's default reset". That reset was ScrollToTop doing its
  // job — so opening Sponsors put you at the top and then, a frame later, threw
  // you back down to wherever you had been reading. Removed: navigation should
  // land at the top of the page, every time.

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
                onClick={(e) => scrollToAnchor(e, 'become-a-sponsor')}
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
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </div>
          <div className="relative scale-105 md:scale-110">
            <div className="relative z-10 rounded-lg overflow-hidden border-8 border-surface-container-lowest shadow-2xl">
              {/* WCAG 1.1.1: Descriptive alt instead of generic "Partnership Hero" */}
              <img
                src="/photos/profDev/shpeNationalGroup.webp"
                alt="SHPE OSU members attending the national convention together"
                /* Source is 1179x649 (~16:9). A 4/3 frame made object-cover
                   discard 27% of the width — 13% off each side — which cut the
                   people standing at the edges of the group in half. Matching
                   the frame to the source drops that to ~2%. */
                className="w-full aspect-[16/9] object-cover object-center"
                /* Intrinsic size of the source file. These are the CLS fallback
                   if the stylesheet is ever deferred, so they must describe the
                   image, not the frame. */
                width="1179"
                height="649"
              />
            </div>
            {/* Decorative stat badge — duplicated as visible text so no information is lost */}
            <div
              className="absolute -bottom-6 -left-6 z-20 bg-primary-container p-6 rounded-lg text-on-primary-container shadow-xl"
              aria-hidden="true"
            >
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

          {/* One section per tier, highest first. Tiers with no sponsors are
              skipped, so an empty Platinum level doesn't render a bare heading. */}
          <div className="space-y-16">
            {Object.entries(sponsors)
              .filter(([, companies]) => companies.length > 0)
              .map(([tier, companies]) => (
                <div key={tier} className="flex flex-col items-center">
                  <h3 className="font-headline text-xs font-black text-on-surface-variant uppercase tracking-[0.3em] mb-8">
                    {tier} Sponsors
                  </h3>
                  <div className="flex flex-wrap justify-center gap-6 w-full max-w-5xl">
                    {companies.map((s) => (
                      <SponsorCard key={s.name} sponsor={s} size={TIER_CARD_SIZE[tier] ?? 'sm'} />
                    ))}
                  </div>
                </div>
              ))}
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
            {SPONSOR_TIERS.map((tier) => (
              <div
                key={tier.name}
                className="rounded-xl p-8 flex flex-col transition-all bg-surface-container hover:bg-surface-container-highest"
              >
                <div className="mb-6">
                  <h3
                    className="font-headline text-2xl font-bold text-secondary"
                  >
                    {tier.name}
                  </h3>
                  <div
                    className="text-4xl font-black mt-2 text-primary"
                  >
                    {tier.price}
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                  {tier.benefits.map((b) => (
                    <li key={b} className="flex gap-3 text-sm font-medium">
                      <span
                        className="material-symbols-outlined text-[20px] flex-shrink-0 text-primary"
                        style={{ fontVariationSettings: '"FILL" 1' }}
                      >
                        check_circle
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
                <a
                  href="#become-a-sponsor"
                  onClick={(e) => {
                    setTierPick((p) => ({ label: tier.label, seq: p.seq + 1 }));
                    scrollToAnchor(e, 'become-a-sponsor');
                  }}
                  aria-label={`Get started with the ${tier.name} sponsorship tier`}
                  className="text-center py-3 rounded-full font-bold transition-all bg-primary text-on-primary hover:bg-primary-fixed-dim"
                >
                  Get Started
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT FORM ───────────────────────────────────── */}
      <ContactForm pick={tierPick} />
    </>
  );
}

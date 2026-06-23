import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { events } from '../data/events';

// ── Whitelisted enum values (C2, M2) ────────────────────────────────────────
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate Student', 'Professional'];

const MAJORS = [
  'Aerospace Engineering',
  'Biomedical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Computer Science & Engineering',
  'Computer & Information Science',
  'Electrical and Computer Engineering',
  'Engineering Physics',
  'Environmental Engineering',
  'Food, Agricultural, & Biological Engineering',
  'Industrial & System Engineering',
  'Materials Science Engineering',
  'Mechanical Engineering',
  'Welding Engineering',
  'Other',
];

const PRONOUNS = ['She / Her / Hers', 'He / Him / His', 'They / Them / Theirs', 'Other'];

const HOW_HEARD = [
  'Friend / Word of mouth',
  'Instagram (@shpeosu)',
  'Involvement Fair / Tabling',
  'Professor / Advisor',
  'GroupMe',
  'Canvas / Email',
  'Other',
];

// Build event list from events.js so it stays in sync automatically
const EVENT_OPTIONS = events.map((e) => {
  const dateLabel = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
  });
  return `${dateLabel} - ${e.title}`;
});

// ── Rate-limit constants (H1) ────────────────────────────────────────────────
const SUBMIT_COOLDOWN_SEC = 30;

// ── Validation helper (C2, M2) ───────────────────────────────────────────────
function validatePayload(form, isFirst, customMajor) {
  if (!EVENT_OPTIONS.includes(form.event_name)) return 'Invalid event selection.';
  if (!YEARS.includes(form.year)) return 'Invalid year selection.';
  if (!form.first_name.trim()) return 'First name is required.';
  if (!form.last_name_dotnum.trim()) return 'Last Name.## is required.';
  if (form.first_name.trim().length > 100) return 'First name is too long.';
  if (form.last_name_dotnum.trim().length > 100) return 'Last name/dot number is too long.';
  if (form.feedback && form.feedback.length > 2000) return 'Feedback must be under 2000 characters.';
  if (isFirst) {
    if (!MAJORS.includes(form.major)) return 'Invalid major selection.';
    if (form.major === 'Other' && !customMajor.trim()) return 'Please describe your major.';
    if (customMajor.trim().length > 150) return 'Major description is too long.';
    if (!PRONOUNS.includes(form.pronouns)) return 'Invalid pronouns selection.';
    if (!HOW_HEARD.includes(form.how_heard)) return 'Invalid "how heard" selection.';
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Attendance() {
  const [step, setStep] = useState(1); // 1 = section 1, 2 = new member section, 3 = success
  const [isFirst, setIsFirst] = useState(null); // null | true | false
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // H1: Rate-limit state
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const cooldownTimer = useRef(null);

  // H1: Double-submit guard
  const isSubmittingRef = useRef(false);

  // Custom major text when "Other" is selected
  const [customMajor, setCustomMajor] = useState('');

  const [form, setForm] = useState({
    event_name: '',
    first_name: '',
    last_name_dotnum: '',
    year: '',
    feedback: '',
    major: '',
    pronouns: '',
    how_heard: '',
  });

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ── Cooldown ticker ─────────────────────────────────────────────────────────
  const startCooldown = () => {
    const until = Date.now() + SUBMIT_COOLDOWN_SEC * 1000;
    setCooldownUntil(until);
    setCooldownSec(SUBMIT_COOLDOWN_SEC);
    clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(cooldownTimer.current);
        setCooldownUntil(null);
        setCooldownSec(0);
      } else {
        setCooldownSec(remaining);
      }
    }, 1000);
  };

  const handleSection1Submit = (e) => {
    e.preventDefault();
    if (isFirst === null) {
      setError('Please answer whether this is your first meeting.');
      return;
    }
    setError('');
    if (isFirst) {
      setStep(2);
    } else {
      submitForm();
    }
  };

  const handleSection2Submit = (e) => {
    e.preventDefault();
    submitForm();
  };

  const submitForm = async () => {
    if (isSubmittingRef.current) return;
    if (cooldownUntil && Date.now() < cooldownUntil) {
      setError(`Please wait ${cooldownSec} second${cooldownSec !== 1 ? 's' : ''} before submitting again.`);
      return;
    }

    // C2/M2: Whitelist validation before hitting the DB
    const validationError = validatePayload(form, isFirst, customMajor);
    if (validationError) {
      setError(validationError);
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    setError('');

    // If major is "Other", store "Other – [custom text]" so admins can see the real major
    const resolvedMajor = isFirst
      ? (form.major === 'Other' && customMajor.trim()
          ? `Other – ${customMajor.trim()}`
          : form.major)
      : null;

    const payload = {
      event_name: form.event_name,
      first_name: form.first_name.trim(),
      last_name_dotnum: form.last_name_dotnum.trim(),
      year: form.year,
      is_first_meeting: isFirst,
      feedback: form.feedback.trim() || null,
      major: resolvedMajor,
      pronouns: isFirst ? form.pronouns : null,
      how_heard: isFirst ? form.how_heard : null,
    };

    const { error: dbError } = await supabase.from('attendance').insert([payload]);

    isSubmittingRef.current = false;
    setSubmitting(false);

    if (dbError) {
      console.error('[Attendance] Insert error:', dbError);
      setError('Something went wrong. Please try again or let an E-Board member know.');
    } else {
      startCooldown();
      setStep(3);
    }
  };

  /* ── Success Screen ──────────────────────────────────────── */
  if (step === 3) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-tertiary-container rounded-full flex items-center justify-center mb-6 shadow-lg">
          <span
            className="material-symbols-outlined text-5xl text-on-tertiary-container"
            style={{ fontVariationSettings: '"FILL" 1' }}
          >
            check_circle
          </span>
        </div>
        <h1 className="font-headline text-4xl font-black text-primary mb-3">
          You're checked in!
        </h1>
        <p className="text-on-surface-variant text-lg max-w-sm leading-relaxed">
          Thanks for coming out{isFirst ? ', and welcome to the Familia! 🎉' : '! Great to see you again 🙌'}
        </p>
        {isFirst && (
          <div className="mt-8 bg-surface-container-high rounded-2xl p-8 max-w-sm w-full text-left space-y-4">
            <h3 className="font-headline font-bold text-lg text-on-surface">Stay connected 👋</h3>
            <a
              href="https://groupme.com/join_group/33253300/9a2V8k"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-surface-container-lowest p-4 rounded-xl hover:bg-surface-container-high border border-outline-variant/20 transition-all"
            >
              <span className="material-symbols-outlined text-primary">chat</span>
              <div>
                <p className="font-bold text-sm">Join our GroupMe</p>
                <p className="text-xs text-on-surface-variant">Official SHPE OSU community chat</p>
              </div>
            </a>
            <a
              href="http://eepurl.com/drG0Or"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-surface-container-lowest p-4 rounded-xl hover:bg-surface-container-high border border-outline-variant/20 transition-all"
            >
              <span className="material-symbols-outlined text-secondary">mail</span>
              <div>
                <p className="font-bold text-sm">Subscribe to Newsletter</p>
                <p className="text-xs text-on-surface-variant">Events, opportunities & scholarships</p>
              </div>
            </a>
          </div>
        )}
      </div>
    );
  }

  const isCoolingDown = cooldownUntil && Date.now() < cooldownUntil;

  return (
    <div className="min-h-screen bg-surface px-4 py-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex flex-col items-center gap-2 group">
            <img
              src="/photos/shpeLogo.png"
              alt="SHPE OSU Logo"
              className="h-16 w-auto object-contain group-hover:scale-105 transition-transform"
            />
          </a>
          <h1 className="font-headline text-2xl font-bold text-on-surface mt-3">
            Attendance Check-In
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            We're so glad you could make it 🙌
          </p>
          {step === 2 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="w-8 h-2 rounded-full bg-primary" />
              <div className="w-8 h-2 rounded-full bg-primary" />
              <span className="text-xs text-on-surface-variant ml-2">New Member Info</span>
            </div>
          )}
        </div>

        {/* ── SECTION 1 ──────────────────────────────────────── */}
        {step === 1 && (
          <form
            onSubmit={handleSection1Submit}
            className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-8 shadow-sm space-y-6"
          >
            <div>
              <label htmlFor="event-name" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Which event did you attend? *
              </label>
              <select
                id="event-name"
                name="event_name"
                required
                value={form.event_name}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">Select an event…</option>
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first-name" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                  First Name *
                </label>
                <input
                  id="first-name"
                  name="first_name"
                  required
                  type="text"
                  maxLength={100}
                  value={form.first_name}
                  onChange={handleChange}
                  placeholder="Maria"
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
              <div>
                <label htmlFor="last-name" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                  Last Name.## *
                </label>
                <input
                  id="last-name"
                  name="last_name_dotnum"
                  required
                  type="text"
                  maxLength={100}
                  value={form.last_name_dotnum}
                  onChange={handleChange}
                  placeholder="Buckeye.01"
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="year" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Year *
              </label>
              <select
                id="year"
                name="year"
                required
                value={form.year}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">Select your year…</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="feedback" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Any Feedback or Suggestions?
              </label>
              <textarea
                id="feedback"
                name="feedback"
                value={form.feedback}
                onChange={handleChange}
                maxLength={2000}
                rows={3}
                placeholder="Optional — we read every response!"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
              />
              {form.feedback.length > 1800 && (
                <p className="text-xs text-on-surface-variant mt-1 text-right">
                  {form.feedback.length}/2000
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-bold uppercase tracking-wider mb-3 text-on-surface-variant">
                Is this your first meeting this year? *
              </p>
              <div className="flex gap-3">
                {[
                  { label: 'Yes', value: true },
                  { label: 'No', value: false },
                ].map(({ label, value }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setIsFirst(value)}
                    className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${
                      isFirst === value
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface border-outline-variant text-on-surface hover:border-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm font-bold text-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting || isCoolingDown}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-lg active:scale-95 disabled:opacity-60"
            >
              {isCoolingDown
                ? `Please wait ${cooldownSec}s…`
                : isFirst
                ? 'Next →'
                : submitting
                ? 'Submitting…'
                : 'Submit'}
            </button>
          </form>
        )}

        {/* ── SECTION 2 — New Member ─────────────────────────── */}
        {step === 2 && (
          <form
            onSubmit={handleSection2Submit}
            className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-8 shadow-sm space-y-6"
          >
            <div className="bg-tertiary-container text-on-tertiary-container rounded-xl p-5 mb-2">
              <h2 className="font-headline font-bold text-lg mb-1">Welcome to the Familia! 🎉</h2>
              <p className="text-sm opacity-90">
                We're so excited you're here. Just a few more questions to help us get to know you better.
              </p>
            </div>

            <div>
              <label htmlFor="major" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Major *
              </label>
              <select
                id="major"
                name="major"
                required
                value={form.major}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">Select your major…</option>
                {MAJORS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {form.major === 'Other' && (
                <div className="mt-3">
                  <label htmlFor="custom-major" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                    Please describe your major *
                  </label>
                  <input
                    id="custom-major"
                    type="text"
                    maxLength={150}
                    required
                    value={customMajor}
                    onChange={(e) => setCustomMajor(e.target.value)}
                    placeholder="e.g. Environmental Engineering"
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="pronouns" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Pronouns *
              </label>
              <select
                id="pronouns"
                name="pronouns"
                required
                value={form.pronouns}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">Select…</option>
                {PRONOUNS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="how-heard" className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                How did you find out about SHPE at OSU? *
              </label>
              <select
                id="how-heard"
                name="how_heard"
                required
                value={form.how_heard}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">Select…</option>
                {HOW_HEARD.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm font-bold text-error">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-full font-bold border-2 border-outline-variant text-on-surface hover:border-primary transition-all"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={submitting || isCoolingDown}
                className="flex-1 bg-primary text-on-primary py-4 rounded-full font-bold hover:bg-primary-fixed-dim transition-all shadow-lg active:scale-95 disabled:opacity-60"
              >
                {isCoolingDown ? `Please wait ${cooldownSec}s…` : submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

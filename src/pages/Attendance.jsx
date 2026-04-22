import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { events } from '../data/events';

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

export default function Attendance() {
  const [step, setStep] = useState(1); // 1 = section 1, 2 = new member section, 3 = success
  const [isFirst, setIsFirst] = useState(null); // null | true | false
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    event_name: '',
    first_name: '',
    last_name_dotnum: '',
    year: '',
    feedback: '',
    // new member fields
    major: '',
    pronouns: '',
    how_heard: '',
  });

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSection1Submit = (e) => {
    e.preventDefault();
    if (isFirst === null) {
      setError('Please answer whether this is your first meeting.');
      return;
    }
    setError('');
    if (isFirst) {
      setStep(2); // show new member section
    } else {
      submitForm();
    }
  };

  const handleSection2Submit = (e) => {
    e.preventDefault();
    submitForm();
  };

  const submitForm = async () => {
    setSubmitting(true);
    setError('');

    const payload = {
      event_name: form.event_name,
      first_name: form.first_name.trim(),
      last_name_dotnum: form.last_name_dotnum.trim(),
      year: form.year,
      is_first_meeting: isFirst,
      feedback: form.feedback.trim() || null,
      major: isFirst ? form.major : null,
      pronouns: isFirst ? form.pronouns : null,
      how_heard: isFirst ? form.how_heard : null,
    };

    const { error: dbError } = await supabase.from('attendance').insert([payload]);

    if (dbError) {
      setError('Something went wrong. Please try again or let an E-Board member know.');
      console.error(dbError);
      setSubmitting(false);
    } else {
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
            <h3 className="font-headline font-bold text-lg text-on-surface">
              Stay connected 👋
            </h3>
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

  return (
    <div className="min-h-screen bg-surface px-4 py-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="text-3xl font-headline font-black text-primary italic tracking-tighter">
            SHPE OSU
          </span>
          <h1 className="font-headline text-2xl font-bold text-on-surface mt-2">
            Attendance Check-In
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            We're so glad you could make it 🙌
          </p>

          {/* Step indicator */}
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
            {/* Event */}
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Which event did you attend? *
              </label>
              <select
                name="event_name"
                required
                value={form.event_name}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">Select an event…</option>
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                  First Name *
                </label>
                <input
                  name="first_name"
                  required
                  type="text"
                  value={form.first_name}
                  onChange={handleChange}
                  placeholder="Maria"
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                  Last Name.## *
                </label>
                <input
                  name="last_name_dotnum"
                  required
                  type="text"
                  value={form.last_name_dotnum}
                  onChange={handleChange}
                  placeholder="Buckeye.01"
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Year *
              </label>
              <select
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

            {/* Feedback */}
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Any Feedback or Suggestions?
              </label>
              <textarea
                name="feedback"
                value={form.feedback}
                onChange={handleChange}
                rows={3}
                placeholder="Optional — we read every response!"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
              />
            </div>

            {/* First meeting? */}
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

            {error && (
              <p className="text-sm font-bold text-error">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-bold text-lg hover:bg-primary-fixed-dim transition-all shadow-lg active:scale-95 disabled:opacity-60"
            >
              {isFirst ? 'Next →' : submitting ? 'Submitting…' : 'Submit'}
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
              <h2 className="font-headline font-bold text-lg mb-1">
                Welcome to the Familia! 🎉
              </h2>
              <p className="text-sm opacity-90">
                We're so excited you're here. Just a few more questions to help us get to know you better.
              </p>
            </div>

            {/* Major */}
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Major *
              </label>
              <select
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
            </div>

            {/* Pronouns */}
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                Pronouns *
              </label>
              <select
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

            {/* How heard */}
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-on-surface-variant">
                How did you find out about SHPE at OSU? *
              </label>
              <select
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

            {error && (
              <p className="text-sm font-bold text-error">{error}</p>
            )}

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
                disabled={submitting}
                className="flex-1 bg-primary text-on-primary py-4 rounded-full font-bold hover:bg-primary-fixed-dim transition-all shadow-lg active:scale-95 disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { createSubmissionId, isOSUEmail } from './resume.js';
import { normalizeLinkedInUrl } from './linkedin.js';

// Fictional local-preview fixtures only. These companies do not represent
// chapter partners, recruiter accounts, or permission to access real resumes.
const SAMPLE_COMPANIES = [
  { id: 'jpmorgan-chase', name: 'JPMorgan Chase', active: true },
  { id: 'google', name: 'Google', active: true },
  { id: 'microsoft', name: 'Microsoft', active: true },
  { id: 'palantir', name: 'Palantir', active: true },
  { id: 'capital-one', name: 'Capital One', active: true },
];

const SAMPLE_SUBMISSIONS = [
  ['a', 'Student A', 'demo.student.a@osu.edu', 'Computer Science & Engineering', '2028', ['jpmorgan-chase', 'google']],
  ['b', 'Student B', 'demo.student.b@osu.edu', 'Data Analytics', '2027', ['jpmorgan-chase', 'capital-one']],
  ['c', 'Student C', 'demo.student.c@osu.edu', 'Electrical and Computer Engineering', '2028', ['microsoft']],
  ['d', 'Student D', 'demo.student.d@osu.edu', 'Mechanical Engineering', '2027', []],
  ['e', 'Student E', 'demo.student.e@osu.edu', 'Computer Science & Engineering', '2029', ['google', 'palantir']],
  ['f', 'Student F', 'demo.student.f@osu.edu', 'Industrial & Systems Eng.', '2028', ['jpmorgan-chase']],
  ['g', 'Student G', 'demo.student.g@osu.edu', 'Biomedical Engineering', '2029', []],
  ['h', 'Student H', 'demo.student.h@osu.edu', 'Chemical Engineering', '2027', ['microsoft', 'capital-one']],
];

const normalizedEmail = (value) => value.trim().toLowerCase();
const hasControls = (value) => [...value].some((character) => {
  const code = character.codePointAt(0);
  return code <= 31 || code === 127;
});

/** A fresh state per mounted demo; no browser or remote persistence. */
export function createPreviewState() {
  return {
    companies: SAMPLE_COMPANIES.map((company) => ({ ...company })),
    submissions: [
      ...SAMPLE_SUBMISSIONS.map(([key, fullName, email, major, graduationYear, companyIds], index) => ({
        id: `resume-${key}`,
        fullName,
        email,
        major,
        graduationYear,
        // Fictional example URL only; the sample profile may not exist.
        linkedinUrl: key === 'a' ? 'https://www.linkedin.com/in/sample-student-a/' : '',
        companyIds: [...companyIds].sort(),
        status: 'approved',
        uploadedAt: `2026-11-${String(16 - index).padStart(2, '0')}T14:00:00.000Z`,
        fileName: `sample-student-${key}.pdf`,
      })),
      {
        id: 'resume-i', fullName: 'Student I', email: 'demo.student.i@osu.edu',
        major: 'Civil Engineering', graduationYear: '2028', linkedinUrl: '', companyIds: ['google', 'jpmorgan-chase'],
        status: 'pending', uploadedAt: '2026-11-17T13:00:00.000Z', fileName: 'sample-student-i.pdf',
      },
      {
        id: 'resume-a-revision', fullName: 'Student A', email: 'demo.student.a@osu.edu',
        major: 'Computer Science & Engineering', graduationYear: '2028', linkedinUrl: '', companyIds: ['google', 'microsoft'],
        status: 'pending', uploadedAt: '2026-11-17T14:00:00.000Z', fileName: 'sample-student-a-updated.pdf',
      },
    ],
  };
}

/** Simulate protected submission into the pending queue, never direct editing. */
export function addPreviewSubmission(state, fields) {
  const fail = (error) => ({ ok: false, state, error });
  if (state.submissions.length >= 1000) return fail('The local sample queue is full. Reset sample data in the admin preview.');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return fail('Enter your resume details.');

  for (const [field, maximum] of [['fullName', 200], ['email', 254], ['major', 158], ['graduationYear', 6], ['fileName', 255]]) {
    const value = fields[field];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || hasControls(value)) {
      return fail('Check your name, email, major, graduation year, and PDF selection.');
    }
  }

  const email = normalizedEmail(fields.email);
  if (!isOSUEmail(email) || /\s/.test(email)) return fail('Use an OSU, Buckeyemail, or OSU alumni email address.');
  const graduationYear = fields.graduationYear.trim();
  const currentYear = new Date().getFullYear();
  if (graduationYear !== 'Alumni' && (!/^\d{4}$/.test(graduationYear)
    || Number(graduationYear) < currentYear - 1 || Number(graduationYear) > currentYear + 6)) {
    return fail('Choose a valid graduation year.');
  }
  const linkedinUrl = normalizeLinkedInUrl(fields.linkedinUrl);
  if (linkedinUrl === null) return fail('Use a LinkedIn profile URL such as https://www.linkedin.com/in/your-name/, or leave it blank.');
  if (!Array.isArray(fields.companyIds) || fields.companyIds.length > 100
    || fields.companyIds.some((id) => typeof id !== 'string')) {
    return fail('Choose companies from the available list.');
  }
  const companyIds = [...new Set(fields.companyIds)].sort();
  if (companyIds.some((id) => !state.companies.some((company) => company.id === id && company.active))) {
    return fail('A selected company is no longer available. Review your selections and try again.');
  }

  const id = createSubmissionId();
  const submission = {
    id,
    fullName: fields.fullName.trim(),
    email,
    major: fields.major.trim(),
    graduationYear,
    linkedinUrl,
    companyIds,
    status: 'pending',
    uploadedAt: new Date().toISOString(),
    fileName: fields.fileName.trim(),
  };
  return { ok: true, state: { ...state, submissions: [submission, ...state.submissions] }, id, error: null };
}

/** Approval publishes one complete revision and its interests together. */
export function approvePreviewSubmission(state, id) {
  const target = state.submissions.find((submission) => submission.id === id && submission.status === 'pending');
  if (!target) return state;
  const email = normalizedEmail(target.email);
  return {
    ...state,
    submissions: state.submissions
      .filter((submission) => submission.id === id || normalizedEmail(submission.email) !== email)
      .map((submission) => submission.id === id ? { ...submission, status: 'approved' } : submission),
  };
}

/**
 * A real server must derive companyId from the recruiter's verified membership.
 * The preview company picker only changes fictional examples. Its DTO exposes
 * the current company's interest flag, never the student's other company IDs.
 */
export function getRecruiterStudents(state, companyId) {
  if (!state.companies.some((company) => company.id === companyId)) return [];
  return state.submissions
    .filter((submission) => submission.status === 'approved')
    .map(({ id, fullName, email, major, graduationYear, linkedinUrl, uploadedAt, companyIds }) => ({
      id, fullName, email, major, graduationYear, uploadedAt,
      linkedinUrl: normalizeLinkedInUrl(linkedinUrl) || '',
      interested: companyIds.includes(companyId),
    }));
}

/** Stable catalog IDs keep interests attached when names change in the future. */
export function addPreviewCompany(state, name) {
  const fail = (error) => ({ ok: false, state, error });
  if (state.companies.length >= 100) return fail('The local sample company list is full. Reset sample data to start over.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150 || hasControls(name)) {
    return fail('Enter a company name between 1 and 150 characters.');
  }
  const cleanName = name.trim();
  if (state.companies.some((company) => company.name.toLowerCase() === cleanName.toLowerCase())) {
    return fail('That company is already in the recruiting list.');
  }
  const company = { id: createSubmissionId(), name: cleanName, active: true };
  return { ok: true, state: { ...state, companies: [...state.companies, company] }, error: null };
}

/** Pause future selections without erasing interests or recruiter membership. */
export function setPreviewCompanyActive(state, id, active) {
  if (typeof active !== 'boolean') return state;
  return {
    ...state,
    companies: state.companies.map((company) => company.id === id ? { ...company, active } : company),
  };
}

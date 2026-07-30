/**
 * Recruiter (corporate portal) session handling.
 *
 * ⚠️  THIS IS NOT AN AUTHORIZATION BOUNDARY.
 *
 * Everything here is a UX convenience that runs in the browser, where the user
 * controls all of it — a recruiter can hand-write this sessionStorage entry from
 * devtools in seconds. The only thing actually protecting the resume book is
 * Supabase Row-Level Security. Any policy that says "allowed if the recruiter
 * has a valid session (validated client-side)" is not enforcing anything: RLS
 * runs per-row in Postgres and cannot see this code.
 *
 * See HANDOFF.md → "Corporate portal authorization" for the server-side model
 * this needs to sit behind.
 *
 * Extracted from CompanyLogin.jsx so that file exports only its component
 * (react-refresh/only-export-components) and so these helpers can be reused
 * without importing a page.
 */
const SESSION_KEY = 'shpe_company_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function saveCompanySession(companyName) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ company: companyName, expiresAt: Date.now() + SESSION_TTL_MS })
  );
}

export function getCompanySession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.expiresAt || Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearCompanySession() {
  sessionStorage.removeItem(SESSION_KEY);
}

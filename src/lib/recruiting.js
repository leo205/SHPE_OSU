import { normalizeLinkedInUrl } from './linkedin';

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;

function checkAborted(signal) {
  if (signal?.aborted) throw new Error('cancelled');
}

function exactCount(value) {
  const count = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Incomplete record count.');
  return count;
}

async function readAll(queryPage, keyFor, { signal } = {}) {
  const rows = [];
  const ids = new Set();
  let expected;
  for (let page = 0; page < MAX_PAGES; page++) {
    checkAborted(signal);
    const { data, error, count } = await queryPage(rows.length);
    checkAborted(signal);
    if (error) throw new Error('The records could not be loaded.');
    if (!Array.isArray(data)) throw new Error('Incomplete record set.');
    const confirmed = exactCount(count);
    if (expected !== undefined && confirmed !== expected) throw new Error('The records changed. Please reload.');
    expected = confirmed;
    if (rows.length + data.length > expected || (!data.length && rows.length < expected)) throw new Error('Incomplete record set.');
    for (const row of data) {
      const key = keyFor(row);
      if (!key || ids.has(key)) throw new Error('The records changed. Please reload.');
      ids.add(key);
      rows.push(row);
    }
    if (rows.length === expected) return rows;
  }
  throw new Error('The record set is too large to load completely.');
}

export function loadRecruitingCompanies(client, { activeOnly = false, signal } = {}) {
  return readAll(async (offset) => {
    let query = client.from('recruiting_companies').select('id,name,active', { count: 'exact' });
    if (activeOnly) query = query.eq('active', true);
    query = query.order('name').order('id').range(offset, offset + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    return query;
  }, (row) => row.id, { signal });
}

export function loadResumeCompanyInterests(client, { signal } = {}) {
  return readAll(async (offset) => {
    let query = client.from('resume_company_interests')
      .select('resume_id,company_id', { count: 'exact' })
      .order('resume_id').order('company_id').range(offset, offset + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    return query;
  }, (row) => row.resume_id && row.company_id ? `${row.resume_id}:${row.company_id}` : null, { signal });
}

export async function getRecruiterContext(client) {
  const { data, error } = await client.rpc('get_recruiter_context');
  if (error || !Array.isArray(data) || data.length > 1) throw new Error('Your company assignment could not be loaded. Contact SHPE OSU.');
  if (!data.length) return null;
  if (!data[0].company_id || !data[0].company_name) throw new Error('Your company assignment could not be loaded. Contact SHPE OSU.');
  return { id: data[0].company_id, name: data[0].company_name };
}

export async function loadRecruiterResumes(client, { companyId, signal } = {}) {
  const rows = await readAll(async (offset) => {
    const args = { p_offset: offset, p_limit: PAGE_SIZE };
    // Only the admin preview supplies a company. The actual recruiter endpoint
    // derives it from auth.uid(); callers cannot choose their own authority.
    if (companyId) args.p_company_id = companyId;
    let request = client.rpc('list_recruiter_resumes', args);
    if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal);
    const result = await request;
    return { ...result, count: result.data?.length ? result.data[0].total_count : 0 };
  }, (row) => row.id, { signal });
  return rows.map((row) => ({
    ...resumeProfile(row), interested: row.interested === true,
  }));
}

export function resumeProfile(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    major: row.major || 'Major not provided',
    graduationYear: row.graduation_year || 'Not provided',
    linkedinUrl: normalizeLinkedInUrl(row.linkedin_url) || '',
    uploadedAt: row.uploaded_at,
    resumePath: row.resume_path,
    status: row.approved ? 'approved' : 'pending',
  };
}

export function adminResumeProfiles(rows, interests, interestsAvailable = true) {
  const companyIdsByResume = new Map();
  for (const interest of interests) {
    const ids = companyIdsByResume.get(interest.resume_id) || [];
    ids.push(interest.company_id);
    companyIdsByResume.set(interest.resume_id, ids);
  }
  return rows.map((row) => ({
    ...resumeProfile(row), companyIds: companyIdsByResume.get(row.id) || [], interestsAvailable,
  }));
}

export async function addRecruitingCompany(client, name) {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 150) return { ok: false, error: 'Enter a company name of 1–150 characters.' };
  try {
    const { data, error } = await client.from('recruiting_companies').insert({ name: normalized, active: true }).select('id,name,active');
    if (error?.code === '23505') return { ok: false, error: 'That company is already in the list.' };
    if (error || !Array.isArray(data) || data.length !== 1) return { ok: false, error: 'Could not confirm the company was added. Reload the list before retrying.' };
    return { ok: true, company: data[0] };
  } catch { return { ok: false, error: 'Could not confirm the company was added. Reload the list before retrying.' }; }
}

export async function setRecruitingCompanyActive(client, id, active) {
  try {
    const { data, error } = await client.from('recruiting_companies').update({ active }).eq('id', id).select('id,name,active');
    if (error || !Array.isArray(data) || data.length !== 1) return { ok: false, error: 'Could not update that company. Reload the list and try again.' };
    return { ok: true, company: data[0] };
  } catch { return { ok: false, error: 'Could not update that company. Reload the list and try again.' }; }
}

export async function loadRecruitingMemberships(client) {
  return readAll(async (offset) => {
    const result = await client.rpc('list_recruiting_memberships', { p_offset: offset, p_limit: PAGE_SIZE });
    return { ...result, count: result.data?.length ? result.data[0].total_count : 0 };
  }, (row) => row.user_id);
}

export async function setRecruitingMembership(client, { email, companyId, active }) {
  try {
    const { data, error } = await client.rpc('set_recruiting_membership', {
      p_recruiter_email: email.trim().toLowerCase(), p_company_id: companyId, p_active: active,
    });
    if (error || !Array.isArray(data) || data.length !== 1) return { ok: false, error: 'Could not save this assignment. Confirm this is an existing recruiter account with the sponsor role.' };
    return { ok: true, membership: data[0] };
  } catch { return { ok: false, error: 'Could not confirm the assignment. Reload before retrying.' }; }
}

/** Open in the user's click stack; keep private signed URLs out of saved state. */
export async function openResumePdf(client, resumePath, browser = window) {
  const tab = browser.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { data, error } = await client.storage.from('resumes').createSignedUrl(resumePath, 60);
    if (error || !data?.signedUrl) throw new Error('unavailable');
    if (tab) tab.location = data.signedUrl;
    else browser.location.assign(data.signedUrl);
    return { ok: true };
  } catch {
    tab?.close();
    return { ok: false, error: 'Could not open this PDF. It may have been removed, or your access may have changed. Refresh the page and try again.' };
  }
}

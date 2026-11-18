import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addRecruitingCompany, adminResumeProfiles, getRecruiterContext,
  loadRecruiterResumes, loadRecruitingCompanies, loadRecruitingMemberships,
  loadResumeCompanyInterests, openResumePdf, setRecruitingCompanyActive,
  setRecruitingMembership,
} from './recruiting';

const COMPANY_A = '10000000-0000-4000-8000-000000000001';
const COMPANY_B = '10000000-0000-4000-8000-000000000002';
const company = (id = COMPANY_A) => ({ id, name: 'Example Engineering', active: true });
const resume = (id = 'resume-a', overrides = {}) => ({
  id, full_name: 'Example Student', email: 'example.student@osu.edu',
  major: 'Mechanical Engineering', graduation_year: '2028',
  linkedin_url: 'https://linkedin.com/in/example-student/?tracking=value',
  resume_path: `submissions/${id}.pdf`, uploaded_at: '2026-11-17T12:00:00Z',
  interested: true, total_count: 1, ...overrides,
});

function tableClient(responses) {
  const query = {};
  for (const method of ['select', 'eq', 'order', 'range', 'abortSignal', 'insert', 'update']) query[method] = vi.fn(() => query);
  let index = 0;
  query.then = (resolve, reject) => Promise.resolve(responses[index++]).then(resolve, reject);
  return { from: vi.fn(() => query), query };
}
function rpcClient(responses) {
  const abortSignal = vi.fn();
  const rpc = vi.fn(() => {
    const promise = Promise.resolve(responses[rpc.mock.calls.length - 1]);
    promise.abortSignal = (signal) => { abortSignal(signal); return promise; };
    return promise;
  });
  return { rpc, abortSignal };
}

afterEach(() => vi.unstubAllGlobals());

describe('complete recruiting catalog and private interest loading', () => {
  it('loads server-capped pages using actual row offsets and preserves an empty directory', async () => {
    const first = company(); const second = company(COMPANY_B);
    const client = tableClient([{ data: [first], count: 2 }, { data: [second], count: 2 }]);
    expect(await loadRecruitingCompanies(client, { activeOnly: true })).toEqual([first, second]);
    expect(client.from).toHaveBeenCalledWith('recruiting_companies');
    expect(client.query.select).toHaveBeenCalledWith('id,name,active', { count: 'exact' });
    expect(client.query.eq).toHaveBeenCalledWith('active', true);
    expect(client.query.range.mock.calls).toEqual([[0, 999], [1, 1000]]);
    expect(await loadRecruitingCompanies(tableClient([{ data: [], count: 0 }]))).toEqual([]);
  });

  it.each([
    ['missing backend', [{ data: null, error: { code: 'PGRST205' }, count: null }]],
    ['missing count', [{ data: [company()], count: null }]],
    ['fractional count', [{ data: [company()], count: 1.5 }]],
    ['changing count', [{ data: [company()], count: 2 }, { data: [company(COMPANY_B)], count: 3 }]],
    ['duplicate rows', [{ data: [company()], count: 2 }, { data: [company()], count: 2 }]],
    ['incomplete pages', [{ data: [company()], count: 2 }, { data: [], count: 2 }]],
    ['rows exceeding count', [{ data: [company(), company(COMPANY_B)], count: 1 }]],
    ['missing identity', [{ data: [{ name: 'Missing ID' }], count: 1 }]],
  ])('fails closed for %s without returning a partial or fictional roster', async (_name, responses) => {
    await expect(loadRecruitingCompanies(tableClient(responses))).rejects.toThrow();
  });

  it('aborts before fetching or publishing a result', async () => {
    const controller = new AbortController(); controller.abort();
    const client = tableClient([]);
    await expect(loadRecruitingCompanies(client, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(client.from).not.toHaveBeenCalled();
    const during = new AbortController();
    const pending = tableClient([{ data: [company()], count: 1 }]);
    pending.query.then = (resolve) => { during.abort(); return Promise.resolve({ data: [company()], count: 1 }).then(resolve); };
    await expect(loadRecruitingCompanies(pending, { signal: during.signal })).rejects.toThrow('cancelled');
    expect(pending.query.abortSignal).toHaveBeenCalledWith(during.signal);
  });

  it('treats the resume/company pair as identity and does not conflate choices sharing a resume', async () => {
    const first = { resume_id: 'resume-a', company_id: COMPANY_A };
    const second = { resume_id: 'resume-a', company_id: COMPANY_B };
    const client = tableClient([{ data: [first], count: 2 }, { data: [second], count: 2 }]);
    expect(await loadResumeCompanyInterests(client)).toEqual([first, second]);
    expect(client.from).toHaveBeenCalledWith('resume_company_interests');
    expect(client.query.range.mock.calls).toEqual([[0, 999], [1, 1000]]);
    await expect(loadResumeCompanyInterests(tableClient([{ data: [first, first], count: 2 }]))).rejects.toThrow();
  });
});

describe('company-scoped recruiter data', () => {
  it('uses only the server-assigned identity for the normal recruiter request', async () => {
    vi.stubGlobal('location', { search: `?companyId=${COMPANY_B}` });
    const client = rpcClient([{ data: [resume()] }]);
    const rows = await loadRecruiterResumes(client);
    expect(client.rpc).toHaveBeenCalledWith('list_recruiter_resumes', { p_offset: 0, p_limit: 1000 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'resume-a', fullName: 'Example Student', linkedinUrl: 'https://www.linkedin.com/in/example-student/', interested: true });
  });

  it('passes an explicit company only for the admin preview option and paginates counted RPC rows', async () => {
    const controller = new AbortController();
    const client = rpcClient([
      { data: [resume('resume-a', { total_count: '2' })] },
      { data: [resume('resume-b', { total_count: '2', interested: false })] },
    ]);
    expect((await loadRecruiterResumes(client, { companyId: COMPANY_B, signal: controller.signal })).map((row) => row.id)).toEqual(['resume-a', 'resume-b']);
    expect(client.rpc.mock.calls).toEqual([
      ['list_recruiter_resumes', { p_offset: 0, p_limit: 1000, p_company_id: COMPANY_B }],
      ['list_recruiter_resumes', { p_offset: 1, p_limit: 1000, p_company_id: COMPANY_B }],
    ]);
    expect(client.abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it('projects approved-directory metadata without leaking raw company preferences or query-only fields', async () => {
    const client = rpcClient([{ data: [resume('resume-a', { company_ids: [COMPANY_A, COMPANY_B], companyIds: [COMPANY_B], private_preferences: 'private fixture', interested: 'true' })] }]);
    const [row] = await loadRecruiterResumes(client);
    expect(row.interested).toBe(false);
    for (const key of ['company_ids', 'companyIds', 'private_preferences', 'total_count']) expect(row).not.toHaveProperty(key);
    expect(JSON.stringify(row)).not.toContain('private fixture');
    expect(await loadRecruiterResumes(rpcClient([{ data: [] }]))).toEqual([]);
  });

  it.each([
    [[{ data: null, error: { code: 'PGRST202' } }]],
    [[{ data: [resume('resume-a', { total_count: 2 })] }, { data: [] }]],
    [[{ data: [resume('resume-a', { total_count: 2 })] }, { data: [resume('resume-a', { total_count: 2 })] }]],
    [[{ data: [resume('resume-a', { total_count: 2 })] }, { data: [resume('resume-b', { total_count: 3 })] }]],
  ])('rejects unavailable, partial, or changed RPC data', async (responses) => {
    await expect(loadRecruiterResumes(rpcClient(responses))).rejects.toThrow();
  });

  it('distinguishes an unassigned recruiter from an unavailable context', async () => {
    expect(await getRecruiterContext(rpcClient([{ data: [] }]))).toBeNull();
    const client = rpcClient([{ data: [{ company_id: COMPANY_A, company_name: 'Example Engineering', raw_preferences: 'private fixture' }] }]);
    expect(await getRecruiterContext(client)).toEqual({ id: COMPANY_A, name: 'Example Engineering' });
    expect(client.rpc).toHaveBeenCalledWith('get_recruiter_context');
    await expect(getRecruiterContext(rpcClient([{ data: null, error: { code: 'PGRST202' } }]))).rejects.toThrow();
    await expect(getRecruiterContext(rpcClient([{ data: [{ company_id: COMPANY_A }] }]))).rejects.toThrow();
  });

  it('keeps private interests only in the explicit admin projection and never writes browser storage', async () => {
    const storage = { getItem: vi.fn(() => { throw new Error('No browser storage'); }), setItem: vi.fn(() => { throw new Error('No browser storage'); }) };
    vi.stubGlobal('localStorage', storage); vi.stubGlobal('sessionStorage', storage);
    const rows = adminResumeProfiles([resume('resume-a', { approved: true }), resume('resume-b')], [{ resume_id: 'resume-a', company_id: COMPANY_A }], false);
    expect(rows[0]).toMatchObject({ status: 'approved', companyIds: [COMPANY_A], interestsAvailable: false });
    expect(rows[1]).toMatchObject({ status: 'pending', companyIds: [], interestsAvailable: false });
    await loadRecruiterResumes(rpcClient([{ data: [resume()] }]));
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('admin recruiting management', () => {
  it('normalizes a catalog name and confirms a returned row', async () => {
    const client = tableClient([{ data: [company()] }]);
    expect(await addRecruitingCompany(client, '  Example   Engineering  ')).toEqual({ ok: true, company: company() });
    expect(client.query.insert).toHaveBeenCalledWith({ name: 'Example Engineering', active: true });
    const invalid = tableClient([]);
    expect((await addRecruitingCompany(invalid, ' ')).ok).toBe(false);
    expect(invalid.from).not.toHaveBeenCalled();
  });

  it.each([{ data: [] }, { data: null }, { data: [company(), company(COMPANY_B)] }, { data: null, error: { code: '42501', message: 'private detail' } }])('does not report zero/ambiguous/denied catalog writes as success', async (response) => {
    const create = await addRecruitingCompany(tableClient([response]), 'Example Engineering');
    const change = await setRecruitingCompanyActive(tableClient([response]), COMPANY_A, false);
    expect(create.ok).toBe(false); expect(change.ok).toBe(false);
    expect(create.error).not.toContain('private detail'); expect(change.error).not.toContain('private detail');
  });

  it('handles a duplicate company without retrying an insert and scopes availability updates to its ID', async () => {
    const duplicate = tableClient([{ data: null, error: { code: '23505' } }]);
    expect((await addRecruitingCompany(duplicate, 'Example Engineering')).error).toContain('already in the list');
    expect(duplicate.query.insert).toHaveBeenCalledTimes(1);
    const client = tableClient([{ data: [company()] }]);
    expect((await setRecruitingCompanyActive(client, COMPANY_A, false)).ok).toBe(true);
    expect(client.query.update).toHaveBeenCalledWith({ active: false }); expect(client.query.eq).toHaveBeenCalledWith('id', COMPANY_A);
  });

  it('loads every counted membership page instead of returning a server-capped list', async () => {
    const first = { user_id: 'recruiter-a', email: 'a@example.invalid', company_id: COMPANY_A, active: true, total_count: '2' };
    const second = { user_id: 'recruiter-b', email: 'b@example.invalid', company_id: COMPANY_A, active: true, total_count: '2' };
    const client = rpcClient([{ data: [first] }, { data: [second] }]);
    const result = await loadRecruitingMemberships(client);
    expect(result.map((row) => row.user_id)).toEqual(['recruiter-a', 'recruiter-b']);
    expect(client.rpc.mock.calls).toEqual([
      ['list_recruiting_memberships', { p_offset: 0, p_limit: 1000 }],
      ['list_recruiting_memberships', { p_offset: 1, p_limit: 1000 }],
    ]);
  });

  it('does not return partially loaded or duplicate memberships', async () => {
    const row = { user_id: 'recruiter-a', company_id: COMPANY_A, total_count: 2 };
    await expect(loadRecruitingMemberships(rpcClient([{ data: [row] }, { data: [] }]))).rejects.toThrow();
    await expect(loadRecruitingMemberships(rpcClient([{ data: [row] }, { data: [row] }]))).rejects.toThrow();
  });

  it('normalizes assignment lookup email and requires a confirmed membership', async () => {
    const membership = { user_id: 'recruiter-a', company_id: COMPANY_A, active: true };
    const client = rpcClient([{ data: [membership] }]);
    expect(await setRecruitingMembership(client, { email: '  RECRUITER@example.invalid ', companyId: COMPANY_A, active: true })).toEqual({ ok: true, membership });
    expect(client.rpc).toHaveBeenCalledWith('set_recruiting_membership', { p_recruiter_email: 'recruiter@example.invalid', p_company_id: COMPANY_A, p_active: true });
    expect((await setRecruitingMembership(rpcClient([{ data: [] }]), { email: 'missing@example.invalid', companyId: COMPANY_A, active: true })).ok).toBe(false);
  });
});

describe('private resume PDF opening', () => {
  function signedClient(result) {
    const createSignedUrl = vi.fn(() => result);
    return { storage: { from: vi.fn(() => ({ createSignedUrl })) }, createSignedUrl };
  }

  it('opens synchronously before signing, severs the opener, and keeps the signed URL out of persisted storage', async () => {
    let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    const order = [];
    const tab = { opener: {}, location: '', close: vi.fn() };
    const browser = { open: vi.fn(() => { order.push('open'); return tab; }), location: { assign: vi.fn() } };
    const client = signedClient(pending);
    client.createSignedUrl.mockImplementation(() => { order.push('sign'); expect(tab.opener).toBeNull(); return pending; });
    const storage = { setItem: vi.fn(() => { throw new Error('No private URL persistence'); }) };
    vi.stubGlobal('localStorage', storage); vi.stubGlobal('sessionStorage', storage);
    const result = openResumePdf(client, 'submissions/example.pdf', browser);
    expect(order).toEqual(['open', 'sign']); expect(browser.open).toHaveBeenCalledTimes(1);
    expect(tab.location).toBe(''); expect(client.storage.from).toHaveBeenCalledWith('resumes');
    expect(client.createSignedUrl).toHaveBeenCalledWith('submissions/example.pdf', 60);
    finish({ data: { signedUrl: 'https://private.example.invalid/signed-pdf' }, error: null });
    expect(await result).toEqual({ ok: true });
    expect(tab.location).toBe('https://private.example.invalid/signed-pdf');
    expect(tab.close).not.toHaveBeenCalled(); expect(browser.location.assign).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('uses one same-tab fallback if a popup is blocked without opening a duplicate', async () => {
    const browser = { open: vi.fn(() => null), location: { assign: vi.fn() } };
    const client = signedClient(Promise.resolve({ data: { signedUrl: 'https://private.example.invalid/signed-pdf' } }));
    expect(await openResumePdf(client, 'submissions/example.pdf', browser)).toEqual({ ok: true });
    expect(browser.open).toHaveBeenCalledTimes(1); expect(browser.location.assign).toHaveBeenCalledWith('https://private.example.invalid/signed-pdf');
  });

  it.each([
    ['denied signing', () => Promise.resolve({ data: null, error: { code: '42501', message: 'private detail' } })],
    ['missing URL', () => Promise.resolve({ data: {} })],
    ['rejected request', () => Promise.reject(new Error('private detail'))],
  ])('closes the blank tab after %s without navigating or leaking service diagnostics', async (_name, response) => {
    const tab = { opener: {}, location: '', close: vi.fn() };
    const browser = { open: vi.fn(() => tab), location: { assign: vi.fn() } };
    const client = signedClient(null); client.createSignedUrl.mockImplementation(response);
    const result = await openResumePdf(client, 'submissions/example.pdf', browser);
    expect(result.ok).toBe(false); expect(result.error).not.toContain('private detail');
    expect(tab.close).toHaveBeenCalledTimes(1); expect(tab.location).toBe(''); expect(browser.location.assign).not.toHaveBeenCalled();
  });
});

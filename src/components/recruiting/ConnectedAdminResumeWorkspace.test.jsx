// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ConnectedAdminResumeWorkspace from './ConnectedAdminResumeWorkspace';
import { supabase } from '../../lib/supabase';
import { addRecruitingCompany, loadRecruitingCompanies, loadResumeCompanyInterests, setRecruitingCompanyActive } from '../../lib/recruiting';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/recruiting', async (original) => ({
  ...await original(),
  loadRecruitingCompanies: vi.fn(), loadResumeCompanyInterests: vi.fn(), addRecruitingCompany: vi.fn(), setRecruitingCompanyActive: vi.fn(),
  loadRecruitingMemberships: vi.fn(async () => []), setRecruitingMembership: vi.fn(),
  getRecruiterContext: vi.fn(), loadRecruiterResumes: vi.fn(), openResumePdf: vi.fn(),
}));
const COMPANY = { id: '10000000-0000-4000-8000-000000000001', name: 'Example Engineering', active: true };
const PENDING = { id: '20000000-0000-4000-8000-000000000001', full_name: 'Pending Student', email: 'pending.student@osu.edu', major: 'Mechanical Engineering', graduation_year: '2028', linkedin_url: 'https://linkedin.com/in/pending-student/?tracking=value', resume_path: 'submissions/pending-fixture.pdf', approved: false };
const APPROVED = { id: '20000000-0000-4000-8000-000000000002', full_name: 'Approved Student', email: 'approved.student@osu.edu', major: 'Computer Science & Engineering', graduation_year: '2027', resume_path: 'submissions/approved-fixture.pdf', approved: true };
const callbacks = () => ({
  onReloadResumes: vi.fn(), onApprove: vi.fn(async () => ({ ok: true })), onRevoke: vi.fn(async () => ({ ok: true })), onDelete: vi.fn(async () => ({ ok: true })), onViewPdf: vi.fn(), onRetryCleanup: vi.fn(),
});
function mount(extra = {}) {
  const actions = callbacks();
  const props = { section: 'submissions', resumes: [PENDING, APPROVED], resumeLoadState: { status: 'ready' }, ...actions, ...extra };
  return { ...render(<ConnectedAdminResumeWorkspace {...props} />), actions, props };
}
beforeEach(() => {
  vi.clearAllMocks();
  loadRecruitingCompanies.mockResolvedValue([COMPANY]);
  loadResumeCompanyInterests.mockResolvedValue([{ resume_id: PENDING.id, company_id: COMPANY.id }]);
  addRecruitingCompany.mockResolvedValue({ ok: true, company: { ...COMPANY, id: '10000000-0000-4000-8000-000000000002', name: 'Example Robotics' } });
  setRecruitingCompanyActive.mockResolvedValue({ ok: true, company: { ...COMPANY, active: false } });
});
afterEach(cleanup);

describe('connected admin resume workspace', () => {
  it('maps actual metadata/private interests into review and dispatches PDF, lifecycle, and reload callbacks', async () => {
    const { actions } = mount();
    const statusButtons = within(screen.getByRole('group', { name: 'Submission status' })).getAllByRole('button');
    expect(statusButtons[0].textContent).toMatch(/^Approved & public/); expect(statusButtons[1].textContent).toMatch(/^Pending review/);
    expect(statusButtons[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Approved Student')).toBeTruthy();
    fireEvent.click(statusButtons[1]);
    await screen.findByText('Example Engineering');
    expect(loadRecruitingCompanies).toHaveBeenCalledWith(supabase, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(loadResumeCompanyInterests).toHaveBeenCalledWith(supabase, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByRole('link', { name: /LinkedIn.*Pending Student/ }).getAttribute('href')).toBe('https://www.linkedin.com/in/pending-student/');
    fireEvent.click(screen.getByRole('button', { name: /View PDF for Pending Student/ }));
    expect(actions.onViewPdf).toHaveBeenCalledWith(expect.objectContaining({ id: PENDING.id, resumePath: PENDING.resume_path, linkedinUrl: 'https://www.linkedin.com/in/pending-student/', companyIds: [COMPANY.id] }));
    fireEvent.click(statusButtons[0]);
    expect(screen.getByText('LinkedIn not provided')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke approval for Approved Student' }));
    await waitFor(() => expect(actions.onRevoke).toHaveBeenCalledWith(APPROVED.id));
    await screen.findByText('Approved Student: approval revoked.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete resume for Approved Student' }));
    await waitFor(() => expect(actions.onDelete).toHaveBeenCalledWith(APPROVED.id));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh submissions' }));
    expect(actions.onReloadResumes).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Reset sample data' })).toBeNull();
    expect(document.querySelector('a[href*="sample-resume.pdf"]')).toBeNull();
    expect(screen.queryByText(/Fictional preview data/)).toBeNull();
  });

  it('does not claim an approval succeeded when the protected callback reports failure', async () => {
    const onApprove = vi.fn(async () => ({ ok: false }));
    mount({ onApprove });
    fireEvent.click(screen.getByRole('button', { name: /^Pending review/ }));
    await screen.findByText('Example Engineering');
    fireEvent.click(screen.getByRole('button', { name: 'Approve resume for Pending Student' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('Could not approve this resume');
    expect(onApprove).toHaveBeenCalledWith(PENDING.id);
    expect(screen.queryByText('Pending Student: approved.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve resume for Pending Student' }).disabled).toBe(false);
  });

  it('keeps private PDF review available when interests fail, without labeling missing data as no preferences', async () => {
    loadResumeCompanyInterests.mockRejectedValue(new Error('missing migration'));
    const { actions } = mount();
    fireEvent.click(screen.getByRole('button', { name: /^Pending review/ }));
    await screen.findByRole('button', { name: 'Retry recruiting data' });
    expect(screen.getByText('Company interests unavailable')).toBeTruthy();
    expect(screen.queryByText('No preferences provided')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /View PDF for Pending Student/ }));
    expect(actions.onViewPdf).toHaveBeenCalledWith(expect.objectContaining({ resumePath: PENDING.resume_path, interestsAvailable: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry recruiting data' }));
    expect(actions.onReloadResumes).toHaveBeenCalledTimes(1);
  });

  it('waits for catalog saves, reflects confirmed results, and preserves inputs/availability on a rejected change', async () => {
    let finishAdd;
    addRecruitingCompany.mockImplementationOnce(() => new Promise((resolve) => { finishAdd = resolve; }));
    mount({ section: 'companies' });
    const name = await screen.findByRole('textbox', { name: 'Company name' });
    fireEvent.change(name, { target: { value: 'Example Robotics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add company' }));
    expect(screen.getByRole('button', { name: 'Saving…', exact: true }).disabled).toBe(true);
    expect(screen.queryByText('Company added to student choices. Recruiter access is managed separately.')).toBeNull();
    finishAdd({ ok: true, company: { ...COMPANY, id: '10000000-0000-4000-8000-000000000002', name: 'Example Robotics' } });
    await screen.findByText('Company added to student choices. Recruiter access is managed separately.');
    expect(screen.getByRole('checkbox', { name: 'Include Example Robotics in student choices' })).toBeTruthy();
    expect(addRecruitingCompany).toHaveBeenCalledWith(supabase, 'Example Robotics');
    addRecruitingCompany.mockResolvedValueOnce({ ok: false, error: 'Could not confirm the company was added.' });
    fireEvent.change(name, { target: { value: 'Unconfirmed Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add company' }));
    await screen.findByText('Could not confirm the company was added.');
    expect(name.value).toBe('Unconfirmed Company');
    expect(screen.queryByRole('checkbox', { name: 'Include Unconfirmed Company in student choices' })).toBeNull();
    setRecruitingCompanyActive.mockResolvedValueOnce({ ok: false, error: 'Could not update this company.' });
    const availability = screen.getByRole('checkbox', { name: `Include ${COMPANY.name} in student choices` });
    fireEvent.click(availability);
    await screen.findByText('Could not update this company.');
    expect(availability.checked).toBe(true);
    expect(setRecruitingCompanyActive).toHaveBeenCalledWith(supabase, COMPANY.id, false);
  });

  it('keeps confirmed cleanup work in compact, collapsed admin maintenance details with a real retry', async () => {
    const { actions } = mount({ cleanupStatus: 'pending', cleanupPending: true });
    const summary = screen.getByText('File maintenance');
    const details = summary.closest('details');
    expect(details.open).toBe(false);
    expect(screen.queryByText('Some retired resume files still need removal. They remain private.')).toBeNull();
    fireEvent.click(summary);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry maintenance' }));
    expect(actions.onRetryCleanup).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Older resume files are queued for removal/)).toBeTruthy();
  });

  it('does not call an unavailable check pending removal or show maintenance after confirmed completion', () => {
    const view = mount({ cleanupStatus: 'unavailable', cleanupPending: false });
    expect(screen.getByText('File maintenance status is unavailable. Please try again.')).toBeTruthy();
    expect(screen.queryByText(/Older resume files are queued for removal/)).toBeNull();
    view.rerender(<ConnectedAdminResumeWorkspace {...view.props} cleanupStatus="complete" cleanupPending={false} />);
    expect(screen.queryByText('File maintenance')).toBeNull();
  });
});

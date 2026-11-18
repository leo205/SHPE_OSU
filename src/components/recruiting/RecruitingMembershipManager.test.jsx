// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecruitingMembershipManager from './RecruitingMembershipManager';
import { loadRecruitingMemberships, setRecruitingMembership } from '../../lib/recruiting';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/recruiting', async (original) => ({
  ...await original(), loadRecruitingMemberships: vi.fn(), setRecruitingMembership: vi.fn(),
}));
const COMPANY = { id: '10000000-0000-4000-8000-000000000001', name: 'Example Engineering', active: true };
const assignment = (label) => ({ user_id: `fixture-recruiter-${label}`, recruiter_email: `recruiter.${label}@example.invalid`, company_id: COMPANY.id, company_name: COMPANY.name, active: true });
const deferred = () => { let resolve; const promise = new Promise((finish) => { resolve = finish; }); return { promise, resolve }; };
const mount = () => render(<RecruitingMembershipManager companies={[COMPANY]} />);
const submit = () => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Recruiter email' }), { target: { value: 'recruiter.new@example.invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save assignment' }));
};
beforeEach(() => {
  vi.clearAllMocks(); loadRecruitingMemberships.mockResolvedValue([]); setRecruitingMembership.mockResolvedValue({ ok: true, membership: assignment('new') });
});
afterEach(cleanup);

describe('membership refresh lifetime and ordering', () => {
  it('prevents saving while the initial assignment inventory is still loading', async () => {
    const pending = deferred(); loadRecruitingMemberships.mockReturnValueOnce(pending.promise);
    mount();
    const save = screen.getByRole('button', { name: 'Save assignment' });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Recruiter email' }), { target: { value: 'recruiter.new@example.invalid' } });
    fireEvent.click(save); expect(setRecruitingMembership).not.toHaveBeenCalled();
    await act(async () => { pending.resolve([]); });
    expect(save.disabled).toBe(false);
  });

  it('does not let a pre-save StrictMode refresh overwrite the confirmed post-save inventory', async () => {
    const staleInitial = deferred();
    loadRecruitingMemberships.mockReturnValueOnce(staleInitial.promise).mockResolvedValueOnce([]).mockResolvedValueOnce([assignment('new')]);
    render(<StrictMode><RecruitingMembershipManager companies={[COMPANY]} /></StrictMode>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save assignment' }).disabled).toBe(false));
    submit();
    await screen.findByText('Company assignment saved.');
    expect(screen.getByText('recruiter.new@example.invalid')).toBeTruthy();
    await act(async () => { staleInitial.resolve([assignment('stale')]); });
    expect(screen.queryByText('recruiter.stale@example.invalid')).toBeNull();
    expect(screen.getByText('recruiter.new@example.invalid')).toBeTruthy();
    expect(loadRecruitingMemberships).toHaveBeenCalledTimes(3);
  });

  it('does not start a refresh or affect a new manager when an unmounted save resolves late', async () => {
    const oldSave = deferred(); setRecruitingMembership.mockReturnValueOnce(oldSave.promise);
    const oldView = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save assignment' }).disabled).toBe(false));
    submit();
    await waitFor(() => expect(setRecruitingMembership).toHaveBeenCalledTimes(1));
    oldView.unmount();
    loadRecruitingMemberships.mockResolvedValueOnce([assignment('current')]);
    mount(); await screen.findByText('recruiter.current@example.invalid');
    await act(async () => { oldSave.resolve({ ok: true, membership: assignment('old') }); });
    expect(loadRecruitingMemberships).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Company assignment saved.')).toBeNull();
    expect(screen.getByText('recruiter.current@example.invalid')).toBeTruthy();
  });

  it('retries a failed inventory without displaying a successful empty result', async () => {
    loadRecruitingMemberships.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([assignment('recovered')]);
    mount();
    const retry = await screen.findByRole('button', { name: 'Retry loading assignments' });
    expect(screen.queryByText('No recruiter company assignments yet.')).toBeNull();
    fireEvent.click(retry);
    await screen.findByText('recruiter.recovered@example.invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

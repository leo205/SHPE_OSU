// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import ConnectedRecruiterDirectory from './recruiting/ConnectedRecruiterDirectory';
import { getRecruiterContext, loadRecruiterResumes } from '../lib/recruiting';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn(), listener: null }));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: {
    getSession: auth.getSession, signOut: auth.signOut,
    onAuthStateChange(listener) {
      auth.listener = listener;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    },
  } },
}));
vi.mock('../lib/recruiting', async (original) => ({
  ...await original(), getRecruiterContext: vi.fn(), loadRecruiterResumes: vi.fn(), openResumePdf: vi.fn(),
}));
const SESSION_A = { user: { id: 'fixture-account-a', app_metadata: { role: 'sponsor' } } };
const SESSION_B = { user: { id: 'fixture-account-b', app_metadata: { role: 'sponsor' } } };
const COMPANY_A = { id: '10000000-0000-4000-8000-000000000001', name: 'Example Company A' };
const COMPANY_B = { id: '10000000-0000-4000-8000-000000000002', name: 'Example Company B' };
const student = (label) => ({ id: `fixture-student-${label}`, fullName: `Private Student ${label}`, email: `fixture.${label.toLowerCase()}@osu.edu`, major: 'Engineering', graduationYear: '2028', interested: true, resumePath: `submissions/fixture-${label}.pdf` });
const deferred = () => { let resolve; const promise = new Promise((finish) => { resolve = finish; }); return { promise, resolve }; };
const mount = (requireAdmin = false) => render(<MemoryRouter initialEntries={['/private']}><Routes>
  <Route path="/private" element={<ProtectedRoute requireAdmin={requireAdmin}><ConnectedRecruiterDirectory /></ProtectedRoute>} />
  <Route path="/company" element={<h1>Recruiter sign in</h1>} />
  <Route path="/admin/login" element={<h1>Admin sign in</h1>} />
</Routes></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks(); auth.listener = null;
  auth.getSession.mockResolvedValue({ data: { session: SESSION_A } }); auth.signOut.mockResolvedValue({ error: null });
  getRecruiterContext.mockResolvedValue(COMPANY_A); loadRecruiterResumes.mockResolvedValue([student('A')]);
});
afterEach(cleanup);

describe('private route identity changes', () => {
  it('immediately clears an already visible account A directory when signed-in account B takes over', async () => {
    const nextRows = deferred();
    getRecruiterContext.mockResolvedValueOnce(COMPANY_A).mockResolvedValueOnce(COMPANY_B);
    loadRecruiterResumes.mockResolvedValueOnce([student('A')]).mockReturnValueOnce(nextRows.promise);
    mount();
    await screen.findByText('Private Student A');
    const firstSignal = loadRecruiterResumes.mock.calls[0][1].signal;
    await act(async () => { auth.listener('SIGNED_IN', SESSION_B); });
    expect(screen.queryByText('Private Student A')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Welcome, Example Company A' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading the resume book');
    expect(firstSignal.aborted).toBe(true);
    await act(async () => { nextRows.resolve([student('B')]); });
    await screen.findByText('Private Student B');
    expect(screen.getByRole('heading', { name: 'Welcome, Example Company B' })).toBeTruthy();
  });

  it('ignores an account A request completing after account B has loaded', async () => {
    const oldRows = deferred();
    getRecruiterContext.mockResolvedValueOnce(COMPANY_A).mockResolvedValueOnce(COMPANY_B);
    loadRecruiterResumes.mockReturnValueOnce(oldRows.promise).mockResolvedValueOnce([student('B')]);
    mount();
    await waitFor(() => expect(loadRecruiterResumes).toHaveBeenCalledTimes(1));
    const oldSignal = loadRecruiterResumes.mock.calls[0][1].signal;
    await act(async () => { auth.listener('SIGNED_IN', SESSION_B); });
    await screen.findByText('Private Student B');
    await act(async () => { oldRows.resolve([student('A')]); });
    expect(oldSignal.aborted).toBe(true);
    expect(screen.queryByText('Private Student A')).toBeNull();
    expect(screen.getByText('Private Student B')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Welcome, Example Company B' })).toBeTruthy();
  });

  it('does not allow an older getSession result to replace a newer auth event', async () => {
    const initial = deferred();
    auth.getSession.mockReturnValueOnce(initial.promise);
    getRecruiterContext.mockResolvedValue(COMPANY_B); loadRecruiterResumes.mockResolvedValue([student('B')]);
    mount();
    await act(async () => { auth.listener('SIGNED_IN', SESSION_B); });
    await screen.findByText('Private Student B');
    await act(async () => { initial.resolve({ data: { session: SESSION_A } }); });
    expect(getRecruiterContext).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Private Student B')).toBeTruthy();
    expect(screen.queryByText('Private Student A')).toBeNull();
  });

  it('also remounts private children if the current account role changes', async () => {
    const changedRows = deferred();
    getRecruiterContext.mockResolvedValueOnce(COMPANY_A).mockResolvedValueOnce(COMPANY_B);
    loadRecruiterResumes.mockResolvedValueOnce([student('A')]).mockReturnValueOnce(changedRows.promise);
    mount(); await screen.findByText('Private Student A');
    await act(async () => { auth.listener('TOKEN_REFRESHED', { user: { ...SESSION_A.user, app_metadata: { role: 'admin' } } }); });
    expect(screen.queryByText('Private Student A')).toBeNull();
    await act(async () => { changedRows.resolve([student('B')]); });
    await screen.findByText('Private Student B');
    expect(getRecruiterContext).toHaveBeenCalledTimes(2);
  });

  it('removes private rows on sign-out, redirects, and unsubscribes on unmount', async () => {
    const view = mount(); await screen.findByText('Private Student A');
    await act(async () => { auth.listener('SIGNED_OUT', null); });
    await screen.findByRole('heading', { name: 'Recruiter sign in' });
    expect(screen.queryByText('Private Student A')).toBeNull();
    view.unmount(); expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

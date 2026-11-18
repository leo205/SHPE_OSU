// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectedRecruiterDirectory from './ConnectedRecruiterDirectory';
import { supabase } from '../../lib/supabase';
import { getRecruiterContext, loadRecruiterResumes, openResumePdf } from '../../lib/recruiting';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/recruiting', async (original) => ({
  ...await original(), getRecruiterContext: vi.fn(), loadRecruiterResumes: vi.fn(), openResumePdf: vi.fn(),
}));
const COMPANY = { id: '10000000-0000-4000-8000-000000000001', name: 'Example Engineering' };
const STUDENT = {
  id: '20000000-0000-4000-8000-000000000001', fullName: 'Example Student', email: 'example.student@osu.edu',
  major: 'Mechanical Engineering', graduationYear: '2028', linkedinUrl: 'https://www.linkedin.com/in/example-student/',
  resumePath: 'submissions/fixture-student.pdf', interested: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  getRecruiterContext.mockResolvedValue(COMPANY); loadRecruiterResumes.mockResolvedValue([STUDENT]); openResumePdf.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('connected recruiter directory', () => {
  it('shows the complete admin book without requiring a company catalog or recruiter assignment', async () => {
    getRecruiterContext.mockResolvedValue(null);
    render(<ConnectedRecruiterDirectory adminAll />);
    await screen.findByRole('heading', { name: 'Approved resume book' });
    expect(getRecruiterContext).not.toHaveBeenCalled();
    expect(loadRecruiterResumes).toHaveBeenCalledWith(supabase, expect.objectContaining({ companyId: undefined }));
    expect(screen.getByText('Example Student')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Interested in us/ })).toBeNull();
    const all = screen.getByRole('tab', { name: /All students/ });
    fireEvent.keyDown(all, { key: 'End' });
    expect(all.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /View PDF for Example Student/ })).toBeTruthy();
  });
  it('derives company identity from the service, exposes real PDF actions, and keeps demo/admin controls out', async () => {
    render(<ConnectedRecruiterDirectory />);
    await screen.findByRole('heading', { name: 'Welcome, Example Engineering' });
    expect(getRecruiterContext).toHaveBeenCalledWith(supabase);
    expect(loadRecruiterResumes).toHaveBeenCalledWith(supabase, expect.objectContaining({ companyId: undefined, signal: expect.any(AbortSignal) }));
    expect(screen.queryByRole('combobox', { name: 'Preview company' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Recruiting companies|Resume submissions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset sample data' })).toBeNull();
    expect(document.querySelector('a[href*="sample-resume.pdf"]')).toBeNull();
    expect(screen.queryByText(/Fictional students|Local preview/)).toBeNull();
    expect(screen.getByRole('link', { name: /Open LinkedIn profile for Example Student/ }).getAttribute('href')).toBe(STUDENT.linkedinUrl);
    fireEvent.click(screen.getByRole('button', { name: /View PDF for Example Student/ }));
    await waitFor(() => expect(openResumePdf).toHaveBeenCalledWith(supabase, STUDENT.resumePath));
    openResumePdf.mockResolvedValueOnce({ ok: false, error: 'Could not open this PDF. Refresh and try again.' });
    fireEvent.click(screen.getByRole('button', { name: /View PDF for Example Student/ }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('Could not open this PDF');
  });

  it('shows an unmapped-account explanation without inventing a company or empty directory', async () => {
    getRecruiterContext.mockResolvedValue(null);
    render(<ConnectedRecruiterDirectory />);
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('needs a company assignment');
    expect(loadRecruiterResumes).not.toHaveBeenCalled();
    expect(screen.queryByText('Available students')).toBeNull();
    expect(screen.queryByRole('heading', { name: /Welcome/ })).toBeNull();
  });

  it('offers retry for a backend failure and shows data after recovery instead of reporting an empty book', async () => {
    loadRecruiterResumes.mockRejectedValueOnce(new Error('The records could not be loaded.')).mockResolvedValueOnce([STUDENT]);
    render(<ConnectedRecruiterDirectory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' }));
    await screen.findByRole('heading', { name: 'Welcome, Example Engineering' });
    expect(loadRecruiterResumes).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Example Student')).toBeTruthy();
    expect(screen.queryByText('The resume book is getting started.')).toBeNull();
  });

  it('supplies a company override only when the admin preview explicitly provides one', async () => {
    const adminCompany = { id: '10000000-0000-4000-8000-000000000002', name: 'Example Robotics' };
    render(<ConnectedRecruiterDirectory adminCompany={adminCompany} />);
    await screen.findByRole('heading', { name: 'Welcome, Example Robotics' });
    expect(getRecruiterContext).not.toHaveBeenCalled();
    expect(loadRecruiterResumes).toHaveBeenCalledWith(supabase, expect.objectContaining({ companyId: adminCompany.id }));
  });
});

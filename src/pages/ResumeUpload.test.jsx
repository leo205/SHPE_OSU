// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResumeUpload from './ResumeUpload';
import { isValidPDF, submitResume } from '../lib/resume';

const backend = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      if (table !== 'recruiting_companies') throw new Error('Unexpected table');
      const query = {
        select: () => query, eq: () => query, order: () => query, range: () => query,
        abortSignal: () => backend.load(),
      };
      return query;
    },
  },
}));
vi.mock('../lib/resume', async (original) => ({ ...await original(), isValidPDF: vi.fn(), submitResume: vi.fn() }));
vi.mock('../components/TurnstileWidget', () => ({
  default: ({ onToken }) => <button type="button" onClick={() => onToken('test-challenge')}>Complete verification</button>,
}));

const COMPANY_A = { id: '00000000-0000-4000-8000-000000000001', name: 'Example Engineering', active: true };
const COMPANY_B = { id: '00000000-0000-4000-8000-000000000002', name: 'Example Robotics', active: true };
const catalogResult = (companies = [COMPANY_A, COMPANY_B]) => ({ data: companies, error: null, count: companies.length });
const chooseFile = () => {
  const file = new File([new Uint8Array(12 * 1024)], 'student-resume.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Attach resume'), { target: { files: [file] } });
  return file;
};
const fillForm = () => {
  fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Example Student' } });
  fireEvent.change(screen.getByLabelText(/OSU email/), { target: { value: 'EXAMPLE.STUDENT@osu.edu' } });
  fireEvent.change(screen.getByLabelText(/^Major/), { target: { value: 'Mechanical Engineering' } });
  const year = screen.getByLabelText(/Graduation year/);
  fireEvent.change(year, { target: { value: year.options[1].value } });
  chooseFile();
  fireEvent.click(screen.getByRole('button', { name: 'Complete verification' }));
};
const submitForm = () => fireEvent.submit(screen.getByRole('button', { name: 'Submit for review' }).closest('form'));

beforeEach(() => {
  vi.clearAllMocks();
  backend.load.mockResolvedValue(catalogResult());
  isValidPDF.mockResolvedValue(true);
  submitResume.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('connected student resume submission', () => {
  it('sends real file and revision-bound normalized profile/choices through the protected helper', async () => {
    render(<ResumeUpload />);
    const choice = await screen.findByRole('checkbox', { name: COMPANY_B.name });
    expect(choice.checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: COMPANY_A.name }).checked).toBe(false);
    fillForm();
    fireEvent.change(screen.getByLabelText(/LinkedIn profile/), { target: { value: 'https://linkedin.com/in/example-student/?tracking=value' } });
    fireEvent.click(choice);
    fireEvent.click(screen.getByRole('checkbox', { name: COMPANY_A.name }));
    submitForm();
    await screen.findByRole('heading', { name: 'Ready for a second look.' });
    expect(submitResume).toHaveBeenCalledTimes(1);
    expect(submitResume.mock.calls[0][1]).toMatchObject({
      fields: { full_name: 'Example Student', email: 'example.student@osu.edu', major: 'Mechanical Engineering', linkedin_url: 'https://www.linkedin.com/in/example-student/', company_ids: [COMPANY_A.id, COMPANY_B.id] },
      file: expect.any(File), turnstileToken: 'test-challenge', submissionId: expect.any(String), submissionStartedAt: expect.any(Number),
    });
    expect(screen.queryByText('Use sample details')).toBeNull();
    expect(screen.queryByText('Use demo resume instead')).toBeNull();
  });

  it('blocks catalog failures and retries without erasing the student draft', async () => {
    backend.load.mockResolvedValueOnce({ data: null, error: { code: 'unavailable' }, count: null }).mockResolvedValueOnce(catalogResult());
    render(<ResumeUpload />);
    await screen.findByRole('button', { name: 'Retry loading companies' });
    fillForm();
    expect(screen.getByRole('button', { name: 'Submit for review' }).disabled).toBe(true);
    submitForm();
    expect(submitResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading companies' }));
    await screen.findByRole('checkbox', { name: COMPANY_A.name });
    expect(screen.getByLabelText(/Full name/).value).toBe('Example Student');
    expect(screen.getByRole('button', { name: 'Submit for review' }).disabled).toBe(false);
  });

  it('allows an empty catalog and sends explicit empty choices/LinkedIn', async () => {
    backend.load.mockResolvedValue(catalogResult([]));
    render(<ResumeUpload />);
    await screen.findByText('No companies are listed yet. You can still submit without preferences.');
    fillForm(); submitForm();
    await screen.findByRole('heading', { name: 'Ready for a second look.' });
    expect(submitResume.mock.calls[0][1].fields).toMatchObject({ linkedin_url: '', company_ids: [] });
  });

  it('rejects a foreign LinkedIn URL before attempting an upload', async () => {
    render(<ResumeUpload />);
    await screen.findByRole('checkbox', { name: COMPANY_A.name });
    fillForm();
    fireEvent.change(screen.getByLabelText(/LinkedIn profile/), { target: { value: 'https://example.com/in/student/' } });
    submitForm();
    expect(screen.getByRole('alert').textContent).toContain('Enter a LinkedIn profile URL');
    expect(submitResume).not.toHaveBeenCalled();
  });

  it('retains an uncertain retry identity and rotates it when company choices change', async () => {
    submitResume.mockResolvedValue({ ok: false, reason: 'service_unavailable' });
    render(<ResumeUpload />);
    await screen.findByRole('checkbox', { name: COMPANY_A.name });
    fillForm(); submitForm();
    await waitFor(() => expect(submitResume).toHaveBeenCalledTimes(1));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' })); submitForm();
    await waitFor(() => expect(submitResume).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit for review' }).disabled).toBe(true));
    expect(submitResume.mock.calls[1][1].submissionId).toBe(submitResume.mock.calls[0][1].submissionId);
    fireEvent.click(screen.getByRole('checkbox', { name: COMPANY_A.name }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' })); submitForm();
    await waitFor(() => expect(submitResume).toHaveBeenCalledTimes(3));
    expect(submitResume.mock.calls[2][1].submissionId).not.toBe(submitResume.mock.calls[1][1].submissionId);
  });

  it('preserves a company removed during upload for deliberate review/removal', async () => {
    submitResume.mockResolvedValueOnce({ ok: false, reason: 'company_choices_changed' }).mockResolvedValueOnce({ ok: true });
    backend.load.mockResolvedValueOnce(catalogResult()).mockResolvedValueOnce(catalogResult([COMPANY_B]));
    render(<ResumeUpload />);
    const choice = await screen.findByRole('checkbox', { name: COMPANY_A.name });
    fillForm(); fireEvent.click(choice); submitForm();
    await screen.findByRole('button', { name: `Remove ${COMPANY_A.name} from your selections` });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: COMPANY_A.name })).toBeNull());
    expect(screen.getByText(`${COMPANY_A.name} (unavailable)`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' })); submitForm();
    expect(screen.getByRole('alert').textContent).toContain('A selected company is no longer available');
    expect(submitResume).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: `Remove ${COMPANY_A.name} from your selections` }));
    submitForm();
    await screen.findByRole('heading', { name: 'Ready for a second look.' });
    expect(submitResume.mock.calls[1][1].fields.company_ids).toEqual([]);
  });
});

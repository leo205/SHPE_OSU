// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SponsorsManager, { SponsorEditor } from './SponsorsManager';
import { EMPTY_SPONSOR } from '../../lib/sponsorValidation';
import { loadSponsors, saveSponsor, uploadSponsorLogo } from '../../lib/sponsors';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/sponsors', async (importOriginal) => ({
  ...await importOriginal(),
  loadSponsors: vi.fn(),
  saveSponsor: vi.fn(),
  uploadSponsorLogo: vi.fn(),
}));

const id = 'cadc46b1-2d96-4f81-a705-b5ff908db581';
const logo = 'logos/cadc46b1-2d96-4f81-a705-b5ff908db582.png';
const client = { storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://assets.example.test/${path}` } }) }) } };
const savedSponsor = (extra = {}) => ({ ...EMPTY_SPONSOR, id, version: 3, name: 'Original sponsor', status: 'published', ...extra });
const editor = (sponsor) => render(<SponsorEditor sponsor={sponsor} client={client} onSaved={vi.fn()} onCancel={vi.fn()} />);

beforeEach(() => {
  vi.resetAllMocks();
  const NativeURL = globalThis.URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(() => 'blob:local-sponsor-preview');
    static revokeObjectURL = vi.fn();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sponsor editor interactions', () => {
  it('preserves stored website and academic year when editing the visible sponsor fields', async () => {
    const sponsor = savedSponsor({ website_url: 'https://example.test/sponsor', academic_year: '2025-2026' });
    saveSponsor.mockImplementation(async (_client, fields) => ({ ok: true, data: { ...sponsor, ...fields, version: 4 } }));
    const view = editor(sponsor);
    expect(screen.queryByLabelText(/Company website/)).toBeNull();
    expect(screen.queryByLabelText(/Academic year/)).toBeNull();
    expect(view.container.querySelector('[name="website_url"], [name="academic_year"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Updated sponsor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    await screen.findByText('Sponsor published. Visitors will see it on their next page load.');
    expect(saveSponsor.mock.calls[0][1]).toMatchObject({ name: 'Updated sponsor', website_url: sponsor.website_url, academic_year: sponsor.academic_year, status: 'published' });
  });

  it('keeps status and tier filters without exposing academic year in the manager list', async () => {
    loadSponsors.mockResolvedValue({ status: 'ready', data: [savedSponsor({ academic_year: '2025-2026' })] });
    render(<SponsorsManager client={client} />);
    await screen.findByRole('button', { name: 'Edit Original sponsor' });
    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getByLabelText('Tier')).toBeTruthy();
    expect(screen.queryByLabelText(/Academic year/)).toBeNull();
    expect(screen.queryByText(/2025-2026/)).toBeNull();
  });

  it('retries a committed but unacknowledged creation with the same ID, then gives a new editor a fresh ID', async () => {
    const stored = new Map();
    let loseFirstResponse = true;
    saveSponsor.mockImplementation(async (_client, fields, options) => {
      if (!stored.has(options.creationId)) stored.set(options.creationId, { ...fields, id: options.creationId, version: 1 });
      if (loseFirstResponse) {
        loseFirstResponse = false;
        return { ok: false, error: 'The save response was interrupted. Please retry.' };
      }
      return { ok: true, data: stored.get(options.creationId) };
    });
    const firstEditor = editor();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'New company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain('interrupted');
    const firstId = saveSponsor.mock.calls[0][2].creationId;
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved. It is not listed on the public page.');
    expect(saveSponsor.mock.calls[1][2]).toEqual({ creationId: firstId });
    expect(stored.size).toBe(1);
    expect(screen.getByLabelText('Company name').value).toBe('New company');
    firstEditor.unmount();

    editor();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Another company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved. It is not listed on the public page.');
    expect(saveSponsor.mock.calls[2][2].creationId).not.toBe(firstId);
    expect(stored.size).toBe(2);
  });

  it('keeps visible edits and latest hidden metadata after an archive conflict, then requires explicit publication', async () => {
    const original = savedSponsor({ website_url: 'https://example.test/original', academic_year: '2025-2026' });
    const archived = savedSponsor({ status: 'archived', version: 4, website_url: 'https://example.test/current', academic_year: '2026-2027' });
    loadSponsors.mockResolvedValue({ status: 'ready', data: [archived] });
    saveSponsor.mockResolvedValueOnce({ ok: false, conflict: true, error: 'Another admin changed this sponsor.' })
      .mockImplementation(async (_client, fields, options) => ({ ok: true, data: { ...fields, id: options.id, version: options.version + 1 } }));
    editor(original);
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'My revised company' } });
    fireEvent.change(screen.getByLabelText('Sponsorship tier'), { target: { value: 'platinum' } });
    fireEvent.change(screen.getByLabelText(/Display order within tier/), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    await screen.findByText('Another admin changed this sponsor.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest version' }));
    const keepEdits = await screen.findByRole('button', { name: 'Keep my edits' });
    expect(screen.queryByText(/2026-2027/)).toBeNull();
    expect(screen.queryByText(/website https:\/\/example.test\/current/)).toBeNull();
    fireEvent.click(keepEdits);
    expect(screen.getByLabelText('Company name').value).toBe('My revised company');
    expect(screen.queryByRole('button', { name: 'Publish sponsor' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Restore as draft' }));
    await screen.findByText('Draft saved. It is not listed on the public page.');
    expect(saveSponsor.mock.calls[1][1]).toMatchObject({ name: 'My revised company', tier_key: 'platinum', website_url: archived.website_url, academic_year: archived.academic_year, display_order: 17, status: 'draft' });
    expect(saveSponsor.mock.calls[1][2]).toEqual({ id, version: 4 });
    expect(screen.getByLabelText('Company name').value).toBe('My revised company');
    expect(saveSponsor).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Publish sponsor' }));
    await screen.findByText('Sponsor published. Visitors will see it on their next page load.');
    expect(saveSponsor.mock.calls[2][1].status).toBe('published');
    expect(saveSponsor.mock.calls[2][1]).toMatchObject({ website_url: archived.website_url, academic_year: archived.academic_year });
    expect(saveSponsor.mock.calls[2][2]).toEqual({ id, version: 5 });
  });

  it('compares an interrupted creation with edited retry fields, then updates the existing record explicitly', async () => {
    let committed;
    saveSponsor.mockImplementationOnce(async (_client, fields, options) => {
      committed = { ...fields, id: options.creationId, version: 1 };
      return { ok: false, error: 'Save response interrupted.' };
    }).mockImplementationOnce(async () => ({ ok: false, conflict: true, existing: committed, error: 'A saved version already exists. Compare before saving.' }))
      .mockImplementation(async (_client, fields, options) => ({ ok: true, data: { ...fields, id: options.id, version: options.version + 1 } }));
    editor();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'First name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Save response interrupted.');
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Revised name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my edits' }));
    expect(loadSponsors).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Company name').value).toBe('Revised name');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved. It is not listed on the public page.');
    expect(saveSponsor.mock.calls[1][2]).toEqual({ creationId: committed.id });
    expect(saveSponsor.mock.calls[2][2]).toEqual({ id: committed.id, version: 1 });
    expect(saveSponsor.mock.calls[2][1].name).toBe('Revised name');
  });

  it('retains an uploaded logo across a failed row save and does not upload it again on retry', async () => {
    const sponsor = savedSponsor({ logo_path: '/photos/sponsors/honda.webp' });
    uploadSponsorLogo.mockResolvedValue({ ok: true, path: logo });
    saveSponsor.mockResolvedValueOnce({ ok: false, error: 'Could not save the listing. Please retry.' })
      .mockImplementation(async (_client, fields) => ({ ok: true, data: { ...sponsor, ...fields, version: 4 } }));
    editor(sponsor);
    const file = new File(['a logo'], 'replacement.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Company logo (optional)'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByAltText('Original sponsor corporate sponsor logo').getAttribute('src')).toBe('blob:local-sponsor-preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    await screen.findByText('Could not save the listing. Please retry.');
    expect(uploadSponsorLogo).toHaveBeenCalledExactlyOnceWith(client, file);
    expect(saveSponsor.mock.calls[0][1].logo_path).toBe(logo);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-sponsor-preview'));

    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    await screen.findByText('Sponsor published. Visitors will see it on their next page load.');
    expect(uploadSponsorLogo).toHaveBeenCalledTimes(1);
    expect(saveSponsor.mock.calls[1][1].logo_path).toBe(logo);
    expect(saveSponsor.mock.calls[1][2]).toEqual({ id, version: 3 });
  });

  it('prevents duplicate submits while an upload is pending', async () => {
    let finishUpload;
    uploadSponsorLogo.mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));
    saveSponsor.mockImplementation(async (_client, fields) => ({ ok: true, data: { ...savedSponsor(), ...fields, version: 4 } }));
    const view = editor(savedSponsor());
    fireEvent.change(screen.getByLabelText('Company logo (optional)'), { target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    expect(screen.getByRole('button', { name: 'Save and publish' }).disabled).toBe(true);
    fireEvent.submit(view.container.querySelector('form'));
    expect(uploadSponsorLogo).toHaveBeenCalledTimes(1);
    finishUpload({ ok: true, path: logo });
    await screen.findByText('Sponsor published. Visitors will see it on their next page load.');
    expect(saveSponsor).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-sponsor-preview');
  });

  it('releases each local logo preview when replaced and when the editor unmounts', async () => {
    URL.createObjectURL.mockReturnValueOnce('blob:first-logo').mockReturnValueOnce('blob:second-logo');
    const view = editor(savedSponsor());
    const input = screen.getByLabelText('Company logo (optional)');
    fireEvent.change(input, { target: { files: [new File(['first'], 'first.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByAltText('Original sponsor corporate sponsor logo').getAttribute('src')).toBe('blob:first-logo'));
    fireEvent.change(input, { target: { files: [new File(['second'], 'second.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByAltText('Original sponsor corporate sponsor logo').getAttribute('src')).toBe('blob:second-logo'));
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:first-logo');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:second-logo');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(uploadSponsorLogo).not.toHaveBeenCalled();
  });
});

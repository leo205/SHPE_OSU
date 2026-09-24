import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SponsorsManager, { SponsorEditor } from './SponsorsManager';
import { EMPTY_SPONSOR } from '../../lib/sponsorValidation';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const renderEditor = (status, extra = {}) => renderToStaticMarkup(<SponsorEditor sponsor={{ ...EMPTY_SPONSOR, id: 'test-id', name: 'Example sponsor', status, ...extra }} onSaved={() => {}} onCancel={() => {}} />);

describe('sponsor management workflow controls', () => {
  it('uses the existing SHPE logo beside the title and omits the manual refresh action', () => {
    const markup = renderToStaticMarkup(<SponsorsManager />);
    expect(markup).toContain('src="/photos/shpeLogo.png"');
    expect(markup).toContain('alt="SHPE OSU Logo"');
    expect(markup).toContain('Website sponsors');
    expect(markup).toContain('Add sponsor');
    expect(markup).not.toContain('Refresh listings');
  });

  it('offers explicit draft save and publication for a new sponsor', () => {
    const markup = renderToStaticMarkup(<SponsorEditor onSaved={() => {}} onCancel={() => {}} />);
    expect(markup).toContain('Add a sponsor');
    expect(markup).toContain('Save draft');
    expect(markup).toContain('Publish sponsor');
    expect(markup).not.toContain('Archive sponsor');
    expect(markup).toContain('Public card preview');
    expect(markup).toContain('Buckeye Sponsors');
  });

  it('makes published edits explicit and does not offer persistent draft revisions', () => {
    const markup = renderEditor('published');
    expect(markup).toContain('Save and publish');
    expect(markup).toContain('Closing the editor leaves the published listing unchanged.');
    expect(markup).toContain('aria-label="Close sponsor editor"');
    expect(markup.indexOf('aria-label="Close sponsor editor"')).toBeLessThan(markup.indexOf('<form'));
    expect(markup).not.toContain('Cancel / close editor');
    expect(markup).toContain('Archive sponsor');
    expect(markup).not.toContain('Save draft');
    expect(markup).not.toContain('Publish sponsor');
  });

  it('restores archived listings only as drafts, with publishing as a subsequent action', () => {
    const markup = renderEditor('archived');
    expect(markup).toContain('Restore as draft');
    expect(markup).not.toContain('<fieldset disabled=""');
    expect(markup).not.toContain('Publish sponsor');
    expect(markup).not.toContain('Save and publish');
    expect(markup).not.toContain('Archive sponsor');
  });

  it('previews the shared public card in the selected tier and labels bounded form controls', () => {
    const markup = renderEditor('draft', { tier_key: 'carmen', logo_path: '/photos/sponsors/honda.webp' });
    expect(markup).toContain('Carmen Sponsors');
    expect(markup).toContain('object-contain');
    expect(markup).toContain('w-[200px]');
    expect(markup).toContain('for="sponsor-name"');
    expect(markup).toContain('for="sponsor-logo"');
    expect(markup).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(markup).toContain('up to 2 MiB');
    expect(markup).toContain('name="display_order" type="number"');
    expect(markup).toContain('min="0" max="9999"');
    expect(markup).not.toContain('name="logo_path"');
  });

  it('omits website and academic-year controls and their helper text, including for existing values', () => {
    const markup = renderEditor('published', { website_url: 'https://example.test/sponsor', academic_year: '2026-2027' });
    expect(markup).not.toContain('Company website (optional)');
    expect(markup).not.toContain('Academic year (optional)');
    expect(markup).not.toContain('Use an HTTPS address.');
    expect(markup).not.toContain('A label for your records.');
    expect(markup).not.toContain('Listings do not expire automatically.');
    expect(markup).not.toContain('name="website_url"');
    expect(markup).not.toContain('name="academic_year"');
  });

  it('keeps initial loading distinct from an empty list and provides a path-free cleanup action', () => {
    const markup = renderToStaticMarkup(<SponsorsManager />);
    expect(markup).toContain('Loading website sponsors');
    expect(markup).not.toContain('No website sponsors yet.');
    expect(markup).toContain('Clean up unused logos');
    expect(markup).not.toContain('name="path"');
    expect(markup).toContain('Publishing a listing does not grant recruiter access.');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SponsorCard from './SponsorCard';
import { SponsorDirectoryContent, SponsorGroups } from './SponsorDirectory';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const row = (name, tier_key = 'carmen', extra = {}) => ({ id: name, name, tier_key, status: 'published', logo_path: null, website_url: null, display_order: 0, ...extra });
const renderState = (state) => renderToStaticMarkup(<SponsorDirectoryContent state={state} onRetry={() => {}} />);

describe('public sponsor directory', () => {
  it('treats an empty successful result as empty without restoring the former hardcoded sponsors', () => {
    const markup = renderState({ status: 'ready', data: [] });
    expect(markup).toContain('Sponsor listings will be available here soon.');
    expect(markup).not.toMatch(/Honda|Lincoln Electric|Carmen Sponsors/);
  });

  it('does not expose drafts or archived companies even when the caller has an admin session', () => {
    const markup = renderState({ status: 'ready', data: [row('Visible company'), row('Private draft', 'carmen', { status: 'draft' }), row('Archived company', 'buckeye', { status: 'archived' })] });
    expect(markup).toContain('Visible company');
    expect(markup).not.toContain('Private draft');
    expect(markup).not.toContain('Archived company');
    expect(markup).not.toContain('Buckeye Sponsors');
  });

  it('distinguishes loading and errors, and gives an error a retry action', () => {
    expect(renderState({ status: 'loading' })).toContain('role="status"');
    const markup = renderState({ status: 'error', error: 'Could not load sponsor listings.' });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Could not load sponsor listings.');
    expect(markup).toContain('Retry loading sponsors');
    expect(markup).not.toContain('available here soon');
  });

  it('uses the tier hierarchy and numeric order, then company name for a tie', () => {
    const rows = [row('Lowest tier', 'buckeye'), row('Later display', 'carmen', { display_order: 8 }), row('Z tie'), row('A tie'), row('Top tier', 'platinum')];
    const markup = renderToStaticMarkup(<SponsorGroups sponsors={rows} />);
    expect(markup.indexOf('Top tier')).toBeLessThan(markup.indexOf('A tie'));
    expect(markup.indexOf('A tie')).toBeLessThan(markup.indexOf('Z tie'));
    expect(markup.indexOf('Z tie')).toBeLessThan(markup.indexOf('Later display'));
    expect(markup.indexOf('Later display')).toBeLessThan(markup.indexOf('Lowest tier'));
    expect(markup).not.toContain('Scarlet &amp; Gray Sponsors');
  });
});

describe('shared sponsor card', () => {
  it('uses compact dimensions only when explicitly requested for the editor preview', () => {
    const sponsors = [row('Honda', 'carmen', { logo_path: '/photos/sponsors/honda.webp' })];
    const compact = renderToStaticMarkup(<SponsorGroups sponsors={sponsors} compact />);
    const standard = renderToStaticMarkup(<SponsorGroups sponsors={sponsors} />);
    expect(compact).toContain('w-[200px]');
    expect(compact).toContain('h-16 max-w-full object-contain');
    expect(compact).toContain('Carmen Sponsors');
    expect(compact).not.toContain('hover:scale');
    expect(standard).toContain('w-[280px]');
    expect(standard).toContain('h-24 max-w-full object-contain');
    expect(standard).toContain('p-6 md:p-8');
    expect(standard).not.toContain('w-[200px]');
  });

  it('renders company identity cleanly when a logo is absent or unsafe', () => {
    const markup = renderToStaticMarkup(<SponsorCard sponsor={row('Company without a logo', 'carmen', { logo_path: 'https://unapproved.example/logo.svg' })} />);
    expect(markup).toContain('Company without a logo');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('unapproved.example');
  });

  it('keeps migrated logos uncropped and gives links a safe new tab and accessible name', () => {
    const markup = renderToStaticMarkup(<SponsorCard sponsor={row('Honda', 'carmen', { logo_path: '/photos/sponsors/honda.webp', website_url: 'https://example.com' })} size="md" />);
    expect(markup).toContain('alt="Honda corporate sponsor logo"');
    expect(markup).toContain('object-contain');
    expect(markup).toContain('w-[280px]');
    expect(markup).toContain('href="https://example.com/"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('opens in a new tab');
  });

  it.each(['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com'])('does not turn an unsafe destination into a link: %s', (website_url) => {
    const markup = renderToStaticMarkup(<SponsorCard sponsor={row('Company', 'carmen', { website_url })} />);
    expect(markup).not.toContain('<a ');
  });
});

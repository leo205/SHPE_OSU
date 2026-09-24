import { describe, expect, it } from 'vitest';
import { SPONSOR_DIRECTORY_TIERS } from './sponsorTiers';
import { SPONSOR_TIERS } from './sponsorInquiry';
import { EMPTY_SPONSOR, isSponsorLogoPath, normalizeSponsor, validateSponsorLogo } from './sponsorValidation';

const draft = { ...EMPTY_SPONSOR, name: 'Example Company' };

describe('sponsor directory fields', () => {
  it('uses existing package names without changing their inquiry labels', () => {
    expect(SPONSOR_DIRECTORY_TIERS.map((tier) => tier.name).sort()).toEqual(SPONSOR_TIERS.map((tier) => tier.name).sort());
    expect(SPONSOR_DIRECTORY_TIERS[0]).toMatchObject({ key: 'platinum', size: 'lg' });
  });
  it('normalizes only editable fields and keeps years/dates unknown', () => {
    expect(normalizeSponsor({ ...draft, name: ' Company ', display_order: '3', version: 900, id: 'injected', created_at: 'yesterday' }))
      .toEqual({ ok: true, value: { ...draft, name: 'Company', display_order: 3, academic_year: null, website_url: null } });
  });
  it.each(['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://example.com\\evil', 'https://example.com/a b', 'https://example.com\n'])('rejects unsafe website %s', (website_url) => {
    expect(normalizeSponsor({ ...draft, website_url }).ok).toBe(false);
  });
  it('accepts a normal HTTPS link and canonicalizes it', () => {
    expect(normalizeSponsor({ ...draft, website_url: 'https://example.com' }).value.website_url).toBe('https://example.com/');
  });
  it.each(['https://[::1]', 'https://example.com:0', 'https://example.com.', 'https://bad_host.com', 'https://-example.com'])('matches the database website subset for %s', (website_url) => {
    expect(normalizeSponsor({ ...draft, website_url }).ok).toBe(false);
  });
  it('accepts canonicalized international domains and valid HTTPS ports', () => {
    expect(normalizeSponsor({ ...draft, website_url: 'https://bücher.example:8443/about' }).value.website_url)
      .toBe('https://xn--bcher-kva.example:8443/about');
  });
  it.each(['2026-2028', '1800-1801', '2201-2202', 'Fall 2026', '2026/2027'])('rejects invalid academic year %s', (academic_year) => {
    expect(normalizeSponsor({ ...draft, academic_year }).ok).toBe(false);
  });
  it('accepts a consecutive optional academic year', () => {
    expect(normalizeSponsor({ ...draft, academic_year: '2026-2027' }).ok).toBe(true);
  });
  it.each([{ name: '' }, { name: 'x'.repeat(151) }, { name: 'ACME\tCorp' }, { tier_key: 'gold' }, { status: 'active' }, { display_order: -1 }, { display_order: '1.5' }, { display_order: 10000 }, { display_order: null }])('rejects invalid fields %j', (fields) => {
    expect(normalizeSponsor({ ...draft, ...fields }).ok).toBe(false);
  });
  it('allows only migrated or managed asset paths', () => {
    expect(isSponsorLogoPath('/photos/sponsors/honda.webp')).toBe(true);
    expect(isSponsorLogoPath('logos/11111111-1111-4111-8111-111111111111.png')).toBe(true);
    for (const path of ['/photos/secret.jpg', 'https://example.com/a.png', 'logos/../a.png', 'logos/a.svg']) {
      expect(isSponsorLogoPath(path)).toBe(false);
      expect(normalizeSponsor({ ...draft, logo_path: path }).ok).toBe(false);
    }
  });
});

describe('logo selection feedback', () => {
  it('accepts supported files within the UI size bound', () => {
    expect(validateSponsorLogo({ size: 2097152, type: 'image/webp' })).toBeNull();
  });
  it.each([null, { size: 0, type: 'image/png' }, { size: 2097153, type: 'image/png' }, { size: 300, type: 'image/svg+xml' }])('rejects invalid selection %j', (file) => {
    expect(validateSponsorLogo(file)).toEqual(expect.any(String));
  });
});

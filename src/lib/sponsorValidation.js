import { SPONSOR_DIRECTORY_TIERS } from './sponsorTiers';

export const MAX_SPONSOR_LOGO_BYTES = 2 * 1024 * 1024;
export const MIGRATED_SPONSOR_LOGOS = Object.freeze([
  '/photos/sponsors/lincolnElectric.webp',
  '/photos/sponsors/honda.webp',
  '/photos/sponsors/burnsMcDonnell.webp',
  '/photos/sponsors/wtLogo.jpg',
  '/photos/sponsors/greshamSmith.webp',
]);
export const EMPTY_SPONSOR = Object.freeze({
  name: '', tier_key: 'buckeye', logo_path: null, website_url: '',
  academic_year: '', status: 'draft', display_order: 0,
});

const TIERS = new Set(SPONSOR_DIRECTORY_TIERS.map(({ key }) => key));
const STATUSES = new Set(['draft', 'published', 'archived']);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const UPLOADED_LOGO = /^logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
// Match the database's hostname/port subset after URL canonicalization.
const WEBSITE_HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function isSponsorLogoPath(path) {
  return typeof path === 'string'
    && (MIGRATED_SPONSOR_LOGOS.includes(path) || UPLOADED_LOGO.test(path));
}

/** UX validation only. Database constraints and the asset endpoint enforce it. */
export function normalizeSponsor(input) {
  const fail = (error) => ({ ok: false, error });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Enter the sponsor details.');
  if (typeof input.name !== 'string' || CONTROL.test(input.name)
    || !input.name.trim() || input.name.trim().length > 150) {
    return fail('Enter a company name between 1 and 150 characters.');
  }
  if (!TIERS.has(input.tier_key)) return fail('Choose one of the available sponsorship tiers.');
  if (!STATUSES.has(input.status)) return fail('Choose a valid publication status.');

  let website = input.website_url ?? '';
  if (typeof website !== 'string' || CONTROL.test(website)) return fail('Enter a valid HTTPS website address.');
  website = website.trim();
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== 'https:' || !WEBSITE_HOST.test(url.hostname) || url.username || url.password
        || (url.port && Number(url.port) < 1)
        || /\s/.test(website) || website.includes('\\') || website.length > 2048) throw new Error();
      website = url.href;
      if (website.length > 2048) throw new Error();
    } catch { return fail('Use a full HTTPS website address without a username or password.'); }
  }

  const year = input.academic_year ?? '';
  if (typeof year !== 'string') return fail('Use an academic year such as 2026-2027, or leave it blank.');
  const cleanYear = year.trim();
  if (cleanYear) {
    const match = /^(\d{4})-(\d{4})$/.exec(cleanYear);
    if (!match || Number(match[1]) < 1900 || Number(match[1]) > 2200
      || Number(match[2]) !== Number(match[1]) + 1) {
      return fail('Use consecutive years such as 2026-2027, or leave the year blank.');
    }
  }

  const order = typeof input.display_order === 'string' && /^\d+$/.test(input.display_order)
    ? Number(input.display_order) : input.display_order;
  if (!Number.isInteger(order) || order < 0 || order > 9999) return fail('Display order must be a whole number from 0 to 9999.');
  const path = input.logo_path || null;
  if (path !== null && !isSponsorLogoPath(path)) return fail('Upload a valid logo before saving.');

  return { ok: true, value: {
    name: input.name.trim(), tier_key: input.tier_key, logo_path: path,
    website_url: website || null, academic_year: cleanYear || null,
    status: input.status, display_order: order,
  } };
}

export function validateSponsorLogo(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) return 'Choose a nonempty logo file.';
  if (file.size > MAX_SPONSOR_LOGO_BYTES) return 'Choose a logo no larger than 2 MiB.';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Choose a PNG, JPG, or WebP logo. SVG files are not supported.';
  return null;
}

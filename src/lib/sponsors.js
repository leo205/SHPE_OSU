import { SPONSOR_DIRECTORY_TIERS } from './sponsorTiers';
import { isSponsorLogoPath, normalizeSponsor, validateSponsorLogo } from './sponsorValidation';

const COLUMNS = 'id,name,tier_key,logo_path,website_url,academic_year,status,display_order,version,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIER_ORDER = new Map(SPONSOR_DIRECTORY_TIERS.map(({ key }, index) => [key, index]));

function sortSponsors(rows) {
  return [...rows].sort((a, b) => (TIER_ORDER.get(a.tier_key) ?? 99) - (TIER_ORDER.get(b.tier_key) ?? 99)
    || a.display_order - b.display_order || a.id.localeCompare(b.id));
}

/** No static fallback: an empty published directory is an intentional result. */
export async function loadSponsors(client, { admin = false, signal } = {}) {
  try {
    const rows = [];
    const ids = new Set();
    let total;
    for (let page = 0; page < 100; page += 1) {
      if (signal?.aborted) return { status: 'cancelled' };
      let query = client.from('sponsors').select(COLUMNS, { count: 'exact' });
      // Explicit even for logged-in admins viewing the public page.
      if (!admin) query = query.eq('status', 'published');
      query = query.order('display_order', { ascending: true }).order('id', { ascending: true })
        .range(rows.length, rows.length + 999);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      if (signal?.aborted) return { status: 'cancelled' };
      if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count < 0
        || (total !== undefined && total !== count) || rows.length + data.length > count
        || (!data.length && rows.length < count)) throw new Error();
      total = count;
      for (const row of data) {
        if (!row || typeof row.id !== 'string' || ids.has(row.id)
          || (!admin && row.status !== 'published')) throw new Error();
        ids.add(row.id);
        rows.push(row);
      }
      if (rows.length === total) return { status: 'ready', data: sortSponsors(rows) };
    }
    throw new Error();
  } catch {
    if (signal?.aborted) return { status: 'cancelled' };
    return { status: 'error', error: 'Could not load the sponsor listings. Please retry.' };
  }
}

/** Only editable fields cross this boundary; the database owns audit/version. */
export async function saveSponsor(client, input, { id, version, creationId } = {}) {
  const normalized = normalizeSponsor(input);
  if (!normalized.ok) return normalized;
  if (id !== undefined && (!UUID.test(id) || !Number.isSafeInteger(version) || version < 1)) {
    return { ok: false, error: 'Reload this sponsor before saving.', conflict: true };
  }
  if (id === undefined && !UUID.test(creationId || '')) {
    return { ok: false, error: 'Start a new sponsor draft before saving.' };
  }
  try {
    const query = id === undefined
      ? client.from('sponsors').insert({ id: creationId, ...normalized.value })
      : client.from('sponsors').update(normalized.value).eq('id', id).eq('version', version);
    const { data, error } = await query.select(COLUMNS).maybeSingle();
    if (!error && data?.id && Number.isSafeInteger(data.version) && data.version > 0) return { ok: true, data };
    if (id === undefined && error?.code === '23505') {
      // The first INSERT may have committed before its response was lost. A
      // fixed editor identity makes retry converge without an unsafe upsert.
      const existing = await client.from('sponsors').select(COLUMNS).eq('id', creationId).maybeSingle();
      if (!existing.error && existing.data?.id === creationId) {
        const same = Object.entries(normalized.value).every(([key, value]) => existing.data[key] === value);
        if (same) return { ok: true, data: existing.data };
        return {
          ok: false, conflict: true, existing: existing.data,
          error: 'This draft was already created, but its saved values differ. Compare the saved listing before applying your edits.',
        };
      }
    }
    if (!error && !data && id !== undefined) {
      return { ok: false, conflict: true, error: 'This sponsor changed or your access changed. Your edits have not been saved. Reload the listing before trying again.' };
    }
    if (error?.code === '42501') return { ok: false, error: 'Your session cannot edit sponsors. Sign in again with an admin account.' };
    if (error?.code === '23514' || error?.code === '23503') return { ok: false, error: 'The sponsor details or logo could not be validated. Check the fields and retry.' };
    return { ok: false, error: 'Could not confirm the save. Refresh the listings before retrying to avoid a duplicate.' };
  } catch {
    return { ok: false, error: 'Could not confirm the save. Refresh the listings before retrying to avoid a duplicate.' };
  }
}

export function sponsorLogoUrl(client, path) {
  if (!isSponsorLogoPath(path)) return null;
  if (path.startsWith('/photos/sponsors/')) return path;
  return client.storage.from('sponsor-assets').getPublicUrl(path).data.publicUrl;
}

async function assetFailure(error) {
  let reason;
  try { reason = (await error?.context?.clone().json())?.error; } catch { /* Use bounded fallback text. */ }
  if (reason === 'unauthorized' || reason === 'forbidden') return 'Sign in again with an admin account to manage sponsor logos.';
  if (reason === 'invalid_image' || reason === 'invalid_submission' || reason === 'payload_too_large') {
    return 'Choose a valid PNG, JPG, or WebP logo no larger than 2 MiB. Try exporting a smaller static image.';
  }
  return 'The logo service is unavailable. Your existing logo has not been removed. Please retry.';
}

export async function uploadSponsorLogo(client, file) {
  const error = validateSponsorLogo(file);
  if (error) return { ok: false, error };
  try {
    const body = new FormData();
    body.append('file', file);
    const result = await client.functions.invoke('manage-sponsor-assets', { body, timeout: 30_000 });
    if (result.error) return { ok: false, error: await assetFailure(result.error) };
    if (result.data?.status !== 'uploaded' || !isSponsorLogoPath(result.data.path)
      || !result.data.path.startsWith('logos/')) throw new Error();
    return { ok: true, path: result.data.path };
  } catch { return { ok: false, error: await assetFailure(null) }; }
}

export async function cleanupSponsorAssets(client) {
  try {
    const { data, error } = await client.functions.invoke('manage-sponsor-assets', {
      body: { action: 'cleanup' }, timeout: 30_000,
    });
    if (error) return { ok: false, error: await assetFailure(error) };
    if (!['complete', 'pending'].includes(data?.status) || !Number.isSafeInteger(data.removed)
      || data.removed < 0 || data.removed > 5) throw new Error();
    return { ok: true, pending: data.status === 'pending', removed: data.removed };
  } catch { return { ok: false, error: 'Could not confirm unused-logo cleanup. It is safe to retry.' }; }
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { cleanupSponsorAssets, loadSponsors, saveSponsor, uploadSponsorLogo } from '../../lib/sponsors';
import { EMPTY_SPONSOR, normalizeSponsor, validateSponsorLogo } from '../../lib/sponsorValidation';
import { SPONSOR_DIRECTORY_TIERS } from '../../lib/sponsorTiers';
import { createInquiryId as createSponsorId } from '../../lib/sponsorInquiry';
import { SponsorGroups } from '../sponsors/SponsorDirectory';

const INPUT = 'min-w-0 w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50';
const BUTTON = 'rounded-lg border border-outline-variant/40 px-4 py-2.5 text-sm font-bold hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON = `${BUTTON} bg-primary text-on-primary hover:bg-primary-fixed-dim`;

export function SponsorEditor({ sponsor = EMPTY_SPONSOR, client = supabase, onSaved, onCancel }) {
  const [base, setBase] = useState(sponsor);
  const [creationId] = useState(() => sponsor.id ? null : createSponsorId());
  const [form, setForm] = useState({ ...EMPTY_SPONSOR, ...sponsor });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState(null);
  const active = useRef(true);
  const busy = useRef(false);
  const latestController = useRef(null);
  const title = useRef(null);

  useEffect(() => {
    active.current = true;
    title.current?.focus();
    return () => {
      active.current = false;
      latestController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setNotice('');
  };

  const save = async (status, lifecycleOnly = false) => {
    if (busy.current || conflict) return;
    const normalized = normalizeSponsor({ ...(lifecycleOnly ? base : form), status });
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      let payload = normalized.value;
      if (file && !lifecycleOnly) {
        const uploaded = await uploadSponsorLogo(client, file);
        if (!active.current) return;
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        payload = { ...payload, logo_path: uploaded.path };
        // Keep the verified path even if the row save fails. A manual retry
        // reuses this upload and never removes the currently published logo.
        setForm((current) => ({ ...current, logo_path: uploaded.path }));
        setFile(null);
      }
      const result = await saveSponsor(client, payload, base.id
        ? { id: base.id, version: base.version }
        : { creationId });
      if (!active.current) return;
      if (!result.ok) {
        setError(result.error);
        setConflict(Boolean(result.conflict));
        setLatest(result.existing || null);
        return;
      }
      setBase(result.data);
      setForm({ ...EMPTY_SPONSOR, ...result.data });
      setFile(null);
      setLatest(null);
      setNotice(status === 'published' ? 'Sponsor published. Visitors will see it on their next page load.' : status === 'archived' ? 'Sponsor archived. It is no longer listed on the public page.' : 'Draft saved. It is not listed on the public page.');
      onSaved(result.data);
    } catch {
      if (active.current) setError('Could not save the sponsor. Your edits are still here. Please retry.');
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  };

  const reloadLatest = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setLatest(null);
    latestController.current?.abort();
    const controller = new AbortController();
    latestController.current = controller;
    try {
      const result = await loadSponsors(client, { admin: true, signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      const row = result.status === 'ready' && result.data.find((item) => item.id === (base.id || creationId));
      if (!row) {
        setError(result.error || 'This sponsor could not be found. Your edits are still here; retry loading the latest version.');
        return;
      }
      setLatest(row);
    } catch {
      if (active.current) setError('Could not load the latest version. Your edits are still here. Please retry.');
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  };

  const resolveConflict = (keepEdits) => {
    setBase(latest);
    onSaved(latest);
    if (!keepEdits) {
      setForm({ ...EMPTY_SPONSOR, ...latest });
      setFile(null);
    } else {
      // These retained database fields are no longer editable here. Preserve
      // their latest saved values when resolving a concurrent edit.
      setForm((current) => ({ ...current, website_url: latest.website_url, academic_year: latest.academic_year }));
    }
    setLatest(null);
    setConflict(false);
    setError('');
    setNotice(keepEdits ? 'Your edits are preserved against the latest version. Review them before saving.' : 'Latest values loaded.');
  };

  const archived = base.status === 'archived';
  return (
    <section aria-labelledby="sponsor-editor-title" className="min-w-0 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm sm:p-6">
      <h2 id="sponsor-editor-title" tabIndex={-1} ref={title} className="font-headline text-xl font-bold">{base.id ? 'Edit sponsor' : 'Add a sponsor'}</h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        {archived ? 'Archived listings stay off the public page. Restore as a draft, then publish when ready.' : base.status === 'published' ? 'Your edits stay in this editor until you select Save and publish. Cancel leaves the published listing unchanged.' : 'Save a draft to prepare a listing, or publish when it is ready.'}
      </p>
      <form className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); void save(base.status === 'published' ? 'published' : 'draft'); }}>
        <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-70">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-bold" htmlFor="sponsor-name">Company name
              <input id="sponsor-name" name="name" value={form.name} onChange={update} required maxLength={150} className={`${INPUT} mt-1`} />
            </label>
            <label className="min-w-0 text-sm font-bold" htmlFor="sponsor-tier">Sponsorship tier
              <select id="sponsor-tier" name="tier_key" value={form.tier_key} onChange={update} className={`${INPUT} mt-1`}>
                {SPONSOR_DIRECTORY_TIERS.map((tier) => <option key={tier.key} value={tier.key}>{tier.name}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-sm font-bold" htmlFor="sponsor-order">Display order within tier
              <input id="sponsor-order" name="display_order" type="number" inputMode="numeric" min="0" max="9999" step="1" value={form.display_order} onChange={update} required className={`${INPUT} mt-1`} />
              <span className="mt-1 block text-xs font-normal text-on-surface-variant">Lower numbers appear first; equal numbers sort by company name.</span>
            </label>
            <div className="min-w-0">
              <label className="text-sm font-bold" htmlFor="sponsor-logo">Company logo (optional)</label>
              <input id="sponsor-logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full min-w-0 max-w-full text-sm" aria-describedby="sponsor-logo-help" onChange={(event) => {
                const selected = event.target.files?.[0];
                if (!selected) return;
                const validationError = validateSponsorLogo(selected);
                if (validationError) {
                  setError(validationError);
                  event.target.value = '';
                  return;
                }
                setFile(selected);
                setError('');
                setNotice('');
                event.target.value = '';
              }} />
              <p id="sponsor-logo-help" className="mt-2 text-xs text-on-surface-variant">PNG, JPEG, or WebP, up to 2 MiB. Upload public branding only: draft and archived logo URLs remain public.</p>
              {file && <p className="mt-2 break-words text-sm">Selected: {file.name}</p>}
              {(file || form.logo_path) && <button type="button" className={`${BUTTON} mt-2`} onClick={() => { setFile(null); setForm((current) => ({ ...current, logo_path: null })); setNotice(''); }}>Remove logo from listing</button>}
            </div>
          </div>
        </fieldset>

        <div className="min-w-0 rounded-lg bg-surface-container-low p-4 sm:p-6">
          <p className="mb-5 text-sm font-bold">Public card preview</p>
          <SponsorGroups sponsors={[{ ...form, id: base.id || 'preview' }]} client={client} logoPreview={previewUrl} />
        </div>

        {error && <p role="alert" className="break-words text-sm text-error">{error}</p>}
        {notice && <p role="status" className="text-sm text-on-surface-variant">{notice}</p>}
        {saving && <p role="status" className="text-sm">Saving or loading sponsor…</p>}
        {conflict && <div className="space-y-3 rounded-lg border border-outline-variant p-4 text-sm">
          <p>A saved version of this listing differs from your edits. Compare versions before saving.</p>
          <button type="button" disabled={saving} className={BUTTON} onClick={() => { void reloadLatest(); }}>Reload latest version</button>
          {latest && <div className="space-y-3">
            <p className="break-words">Latest saved values: {latest.name}; {SPONSOR_DIRECTORY_TIERS.find((tier) => tier.key === latest.tier_key)?.name}; {latest.status}; order {latest.display_order}.</p>
            <SponsorGroups sponsors={[latest]} client={client} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BUTTON} onClick={() => resolveConflict(true)}>Keep my edits</button>
              <button type="button" className={BUTTON} onClick={() => resolveConflict(false)}>Use latest values</button>
            </div>
          </div>}
        </div>}
        <div className="flex flex-wrap gap-3">
          {archived ? <button type="button" disabled={saving || conflict} className={PRIMARY_BUTTON} onClick={() => { void save('draft'); }}>Restore as draft</button> : <>
            {base.status === 'published' ? <button type="submit" disabled={saving || conflict} className={PRIMARY_BUTTON}>Save and publish</button> : <>
              <button type="submit" disabled={saving || conflict} className={BUTTON}>Save draft</button>
              <button type="button" disabled={saving || conflict} className={PRIMARY_BUTTON} onClick={() => { void save('published'); }}>Publish sponsor</button>
            </>}
            {base.id && <button type="button" disabled={saving || conflict} className={BUTTON} onClick={() => { void save('archived', true); }}>Archive sponsor</button>}
          </>}
          <button type="button" disabled={saving} className={BUTTON} onClick={onCancel}>Cancel / close editor</button>
        </div>
      </form>
    </section>
  );
}

export default function SponsorsManager({ client = supabase }) {
  const [state, setState] = useState({ status: 'loading', data: [] });
  const [editor, setEditor] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [cleanup, setCleanup] = useState({ running: false, message: '', error: '' });
  const active = useRef(false);
  const controllerRef = useRef(null);
  const cleanupBusy = useRef(false);
  const addButton = useRef(null);
  const restoreFocus = useRef(false);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const result = await loadSponsors(client, { admin: true, signal: controller.signal });
      if (active.current && !controller.signal.aborted && result.status !== 'cancelled') {
        setState((current) => ({ ...result, data: result.data || current.data }));
      }
    } catch {
      if (active.current && !controller.signal.aborted) setState((current) => ({ ...current, status: 'error', error: 'Could not load website sponsors. Please retry.' }));
    }
  }, [client]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      controllerRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!editor && restoreFocus.current) {
      restoreFocus.current = false;
      addButton.current?.focus();
    }
  }, [editor]);

  const runCleanup = async () => {
    if (cleanupBusy.current) return;
    cleanupBusy.current = true;
    setCleanup({ running: true, message: '', error: '' });
    try {
      const result = await cleanupSponsorAssets(client);
      if (!active.current) return;
      setCleanup({ running: false, error: result.ok ? '' : result.error, message: result.ok ? `${result.removed} unused logo file${result.removed === 1 ? '' : 's'} removed.${result.pending ? ' Some files are waiting for a later cleanup; try again later.' : ' Cleanup is complete.'}` : '' });
    } catch {
      if (active.current) setCleanup({ running: false, message: '', error: 'Logo cleanup could not finish. Please retry.' });
    } finally {
      cleanupBusy.current = false;
    }
  };

  const rows = state.status === 'ready' ? state.data : [];
  const visibleRows = rows.filter((row) => (statusFilter === 'all' || row.status === statusFilter) && (tierFilter === 'all' || row.tier_key === tierFilter))
    .sort((a, b) => SPONSOR_DIRECTORY_TIERS.findIndex((tier) => tier.key === a.tier_key) - SPONSOR_DIRECTORY_TIERS.findIndex((tier) => tier.key === b.tier_key) || a.display_order - b.display_order || a.name.localeCompare(b.name));

  return (
    <section aria-labelledby="website-sponsors-title" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="website-sponsors-title" className="font-headline text-xl font-bold">Website sponsors</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Manage the public sponsor directory. Publishing a listing does not grant recruiter access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={state.status === 'loading'} onClick={() => { void load(); }} className={BUTTON}>Refresh listings</button>
          <button ref={addButton} type="button" disabled={Boolean(editor) || state.status !== 'ready'} onClick={() => setEditor({ ...EMPTY_SPONSOR })} className={PRIMARY_BUTTON}>Add sponsor</button>
        </div>
      </div>

      {editor && <SponsorEditor key={editor.id || 'new'} sponsor={editor} client={client} onSaved={(row) => {
        // A save supersedes an in-flight refresh that may contain older rows.
        controllerRef.current?.abort();
        setState((current) => ({ status: 'ready', data: [...(current.data || []).filter((item) => item.id !== row.id), row] }));
        // Keep a new editor mounted after its first save, including its saved
        // notice. The editor retains the returned ID/version for later saves.
      }} onCancel={() => { restoreFocus.current = true; setEditor(null); }} />}

      {state.status === 'loading' && <p role="status" className="text-sm">Loading website sponsors…</p>}
      {state.status === 'error' && <div role="alert" className="rounded-lg border border-outline-variant p-4 text-sm"><p>{state.error}</p><button type="button" className={`${BUTTON} mt-3`} onClick={() => { void load(); }}>Retry loading website sponsors</button></div>}
      {state.status === 'ready' && <>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor="sponsor-status-filter" className="text-sm font-bold">Status
            <select id="sponsor-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${INPUT} mt-1`}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
          </label>
          <label htmlFor="sponsor-tier-filter" className="text-sm font-bold">Tier
            <select id="sponsor-tier-filter" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)} className={`${INPUT} mt-1`}><option value="all">All tiers</option>{SPONSOR_DIRECTORY_TIERS.map((tier) => <option key={tier.key} value={tier.key}>{tier.name}</option>)}</select>
          </label>
        </div>
        {!visibleRows.length ? <p className="rounded-lg border border-dashed border-outline-variant p-6 text-sm text-on-surface-variant">{rows.length ? 'No sponsors match these filters.' : 'No website sponsors yet. Add a sponsor to begin.'}</p> : <ul className="space-y-3">
          {visibleRows.map((row) => <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-4">
            <div className="min-w-0 flex-1"><h3 className="break-words font-bold">{row.name}</h3><p className="mt-1 break-words text-sm text-on-surface-variant">{SPONSOR_DIRECTORY_TIERS.find((tier) => tier.key === row.tier_key)?.name} · {row.status} · Order {row.display_order}</p></div>
            <button type="button" disabled={Boolean(editor)} className={BUTTON} onClick={() => setEditor(row)} aria-label={`Edit ${row.name}`}>{row.status === 'archived' ? 'View / restore' : 'Edit'}</button>
          </li>)}
        </ul>}
      </>}
      <div className="border-t border-outline-variant/30 pt-5">
        <button type="button" className={BUTTON} disabled={cleanup.running} onClick={() => { void runCleanup(); }}>{cleanup.running ? 'Cleaning unused logos…' : 'Clean up unused logos'}</button>
        <p className="mt-2 text-xs text-on-surface-variant">Removes eligible unused uploads. Logos needed by saved listings or retained history are preserved.</p>
        {cleanup.error && <p role="alert" className="mt-2 text-sm text-error">{cleanup.error}</p>}
        {cleanup.message && <p role="status" className="mt-2 text-sm">{cleanup.message}</p>}
      </div>
    </section>
  );
}

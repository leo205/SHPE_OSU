import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadSponsors } from '../../lib/sponsors';
import { SPONSOR_DIRECTORY_TIERS } from '../../lib/sponsorTiers';
import SponsorCard from './SponsorCard';

export function SponsorGroups({ sponsors, client = supabase, logoPreview = null, compact = false }) {
  return (
    <div className={compact ? 'space-y-4' : 'space-y-16'}>
      {SPONSOR_DIRECTORY_TIERS.map((tier) => {
        const companies = sponsors.filter((sponsor) => sponsor.tier_key === tier.key)
          .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
        if (!companies.length) return null;
        return (
          <div key={tier.key} className="flex min-w-0 flex-col items-center">
            <h3 className={`font-headline text-xs font-black text-on-surface-variant uppercase tracking-[0.3em] ${compact ? 'mb-3' : 'mb-8'}`}>
              {tier.name} Sponsors
            </h3>
            <div className="flex flex-wrap justify-center gap-6 w-full max-w-5xl">
              {companies.map((sponsor) => (
                <SponsorCard key={sponsor.id || 'preview'} sponsor={sponsor} size={tier.size} client={client} logoPreview={logoPreview} compact={compact} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SponsorDirectoryContent({ state, onRetry, client = supabase }) {
  if (state.status === 'loading') return <p role="status" className="text-center text-sm text-on-surface-variant">Loading sponsors…</p>;
  if (state.status === 'error') return (
    <div role="alert" className="text-center text-sm text-on-surface-variant">
      <p>{state.error || 'Sponsor listings are temporarily unavailable.'}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-outline-variant px-5 py-2 font-bold text-primary hover:bg-surface-container">Retry loading sponsors</button>
    </div>
  );
  // Always keep the public view published-only, including an admin's session.
  const sponsors = state.data.filter((sponsor) => sponsor.status === 'published');
  if (!sponsors.length) return <p className="text-center text-sm text-on-surface-variant">Sponsor listings will be available here soon.</p>;
  return <SponsorGroups sponsors={sponsors} client={client} />;
}

export default function SponsorDirectory({ client = supabase }) {
  const [state, setState] = useState({ status: 'loading', data: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: [] });
    void loadSponsors(client, { admin: false, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && result.status !== 'cancelled') setState(result);
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'error', error: 'Sponsor listings are temporarily unavailable. Please retry.' });
    });
    return () => controller.abort();
  }, [client, attempt]);
  return <SponsorDirectoryContent state={state} onRetry={() => setAttempt((value) => value + 1)} client={client} />;
}

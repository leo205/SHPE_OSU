import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sponsorLogoUrl } from '../../lib/sponsors';

function websiteLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export default function SponsorCard({ sponsor, size = 'lg', client = supabase, logoPreview = null, compact = false }) {
  const [failedLogo, setFailedLogo] = useState(null);
  const logo = logoPreview || sponsorLogoUrl(client, sponsor.logo_path);
  const href = websiteLink(sponsor.website_url);
  const height = compact ? 'h-16' : size === 'lg' ? 'h-28' : size === 'md' ? 'h-24' : 'h-20';
  const fallbackHeight = compact ? 'min-h-16' : size === 'lg' ? 'min-h-28' : size === 'md' ? 'min-h-24' : 'min-h-20';
  const width = compact ? 'w-[200px]' : size === 'lg' ? 'w-[320px]' : size === 'md' ? 'w-[280px]' : 'w-[240px]';
  const presentation = compact ? 'p-4' : 'p-6 md:p-8 hover:scale-[1.02] transition-all duration-300';
  const className = `bg-surface-container-lowest ${presentation} rounded-lg flex items-center justify-center platinum-glow border border-outline-variant/20 max-w-full min-w-0 ${width}`;
  const content = logo && logo !== failedLogo ? (
    <img
      src={logo}
      alt={`${sponsor.name} corporate sponsor logo`}
      className={`${height} max-w-full object-contain`}
      loading="lazy"
      width="600"
      onError={() => setFailedLogo(logo)}
    />
  ) : (
    <span className={`${fallbackHeight} flex w-full items-center justify-center break-words text-center font-headline ${compact ? 'text-sm' : 'text-xl'} font-bold text-on-surface`}>
      {sponsor.name || 'Company name'}
    </span>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={`Visit ${sponsor.name} website (opens in a new tab)`}>
      {content}
    </a>
  ) : <div className={className}>{content}</div>;
}

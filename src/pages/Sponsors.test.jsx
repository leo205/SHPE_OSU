import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Sponsors from './Sponsors';

// Rendering this page must not initialize an Auth client or contact a backend.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

afterEach(() => vi.unstubAllGlobals());

describe('sponsor page draft recovery', () => {
  it('still renders the inquiry form when browser storage is blocked', () => {
    const blocked = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    vi.stubGlobal('sessionStorage', { getItem: blocked, removeItem: blocked });
    const markup = renderToStaticMarkup(<Sponsors />);
    expect(markup).toContain('Become a Sponsor');
    expect(markup).toContain('name="company_name"');
    expect(markup).toContain('Submit Inquiry');
    expect(markup).toContain('Loading sponsors');
    expect(markup).toContain('SponsorSHPE Tiers');
    expect(markup).toContain('/Sponsorship_Packet.pdf');
    expect(markup).not.toContain('Lincoln Electric');
  });

  it('recovers malformed field values while retaining usable draft text', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => JSON.stringify({ company_name: 'Example Company', reply_to: null, message: {} }),
      removeItem: vi.fn(),
    });
    const markup = renderToStaticMarkup(<Sponsors />);
    expect(markup).toContain('value="Example Company"');
    expect(markup).not.toContain('[object Object]');
  });
});

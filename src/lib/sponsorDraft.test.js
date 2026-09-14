import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSponsorDraft,
  EMPTY_SPONSOR_FORM,
  loadSponsorDraft,
  saveSponsorDraft,
} from './sponsorDraft.js';

const draft = {
  company_name: 'Example Company',
  contact_name: 'Test Contact',
  reply_to: 'contact@example.test',
  tier: 'Carmen ($1,000)',
  message: 'A synthetic draft.',
};

describe('optional sponsor draft storage', () => {
  let storage;

  beforeEach(() => {
    storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('sessionStorage', storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('restores valid drafts and fills missing fields from the empty form', () => {
    storage.getItem.mockReturnValueOnce(JSON.stringify(draft));
    expect(loadSponsorDraft()).toEqual(draft);

    storage.getItem.mockReturnValueOnce(JSON.stringify({ company_name: draft.company_name }));
    expect(loadSponsorDraft()).toEqual({ ...EMPTY_SPONSOR_FORM, company_name: draft.company_name });
  });

  it('recovers when both reading and clearing storage are blocked', () => {
    const blocked = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    storage.getItem.mockImplementation(blocked);
    storage.removeItem.mockImplementation(blocked);
    expect(loadSponsorDraft()).toEqual(EMPTY_SPONSOR_FORM);
  });

  it('also tolerates a blocked sessionStorage property getter', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked', 'SecurityError'); },
    });
    expect(loadSponsorDraft()).toEqual(EMPTY_SPONSOR_FORM);
    expect(() => saveSponsorDraft(draft)).not.toThrow();
    expect(() => clearSponsorDraft()).not.toThrow();
  });

  it.each(['{broken', 'null', 'true', '42', '"draft"', '[]'])(
    'discards unusable saved JSON (%s)', (saved) => {
      storage.getItem.mockReturnValue(saved);
      expect(loadSponsorDraft()).toEqual(EMPTY_SPONSOR_FORM);
      expect(storage.removeItem).toHaveBeenCalledWith('sponsorFormDraft');
    },
  );

  it('restores only bounded strings and an allowed tier from malformed objects', () => {
    storage.getItem.mockReturnValue(JSON.stringify({
      company_name: null,
      contact_name: 12,
      reply_to: { address: 'contact@example.test' },
      message: 'a'.repeat(2500),
      tier: 'Unknown tier',
      extra: 'ignored',
    }));
    expect(loadSponsorDraft()).toEqual({ ...EMPTY_SPONSOR_FORM, message: 'a'.repeat(2000) });
  });

  it('keeps draft persistence and accepted-submit cleanup non-throwing', () => {
    storage.setItem.mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    storage.removeItem.mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(() => saveSponsorDraft(draft)).not.toThrow();
    expect(() => clearSponsorDraft()).not.toThrow();
  });

  it('uses the existing session-only draft key', () => {
    saveSponsorDraft(draft);
    expect(storage.setItem).toHaveBeenCalledWith('sponsorFormDraft', JSON.stringify(draft));
    clearSponsorDraft();
    expect(storage.removeItem).toHaveBeenCalledWith('sponsorFormDraft');
  });
});

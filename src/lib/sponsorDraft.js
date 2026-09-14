import { SPONSOR_TIERS, SPONSOR_TIER_LABELS } from './sponsorInquiry.js';

// Drafts contain contact details, so they belong to the tab's session only.
const DRAFT_KEY = 'sponsorFormDraft';
export const EMPTY_SPONSOR_FORM = Object.freeze({
  company_name: '',
  contact_name: '',
  reply_to: '',
  tier: SPONSOR_TIERS[0].label,
  message: '',
});

// These mirror the server caps for immediate feedback and restored drafts.
export const SPONSOR_FIELD_LIMITS = Object.freeze({
  company_name: 150,
  contact_name: 120,
  reply_to: 254,
  message: 2000,
});

export function clearSponsorDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage is optional. Its failure must never change a submission result.
  }
}

export function loadSponsorDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { ...EMPTY_SPONSOR_FORM };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      clearSponsorDraft();
      return { ...EMPTY_SPONSOR_FORM };
    }

    // Only restore known strings. Valid JSON can still contain nulls, objects,
    // or oversized fields that would break controlled inputs or .trim().
    const form = { ...EMPTY_SPONSOR_FORM };
    for (const [field, limit] of Object.entries(SPONSOR_FIELD_LIMITS)) {
      if (typeof saved[field] === 'string') form[field] = saved[field].slice(0, limit);
    }
    if (SPONSOR_TIER_LABELS.includes(saved.tier)) form.tier = saved.tier;
    return form;
  } catch {
    // Reading the storage property itself can throw, as can deleting a corrupt
    // draft. clearSponsorDraft has its own guard for that second failure.
    clearSponsorDraft();
    return { ...EMPTY_SPONSOR_FORM };
  }
}

export function saveSponsorDraft(form) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    // Private-browsing and quota errors must not interrupt typing.
  }
}

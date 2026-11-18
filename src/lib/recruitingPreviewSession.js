import { useSyncExternalStore } from 'react';
import { createPreviewState } from './recruitingPreview.js';
import { normalizeLinkedInUrl } from './linkedin.js';
import { isOSUEmail } from './resume.js';

// Local demonstration metadata only. Never store a File/Blob, production record,
// credential, or access decision here. Browser storage is not an authorization
// boundary; separate preview pages deliberately share fictional data.
const STORAGE_KEY = 'shpe-recruiting-preview:v1';
const VERSION = 1;
const LIFETIME = 2 * 60 * 60 * 1000;
const MAX_SAVED_CHARACTERS = 2 * 1024 * 1024;
const ID = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const listeners = new Set();
let snapshot;
let expiresAt = 0;
let lastSaved = null;
let memoryOnly = false;
let expiryTimer;

function text(value, maximum, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > maximum || CONTROL.test(value)) return null;
  const clean = value.trim();
  return optional || clean ? clean : null;
}

/** Reconstruct only known bounded fields; reject malformed saved demo state. */
function validatedState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Array.isArray(value.companies) || !value.companies.length || value.companies.length > 100
    || !Array.isArray(value.submissions) || value.submissions.length > 1000) return null;
  const companyIds = new Set();
  const companies = [];
  for (const company of value.companies) {
    if (!company || typeof company !== 'object' || typeof company.id !== 'string' || !ID.test(company.id)
      || companyIds.has(company.id) || typeof company.active !== 'boolean') return null;
    const name = text(company.name, 150);
    if (!name) return null;
    companyIds.add(company.id);
    companies.push({ id: company.id, name, active: company.active });
  }

  const submissionIds = new Set();
  const approvedEmails = new Set();
  const submissions = [];
  for (const submission of value.submissions) {
    if (!submission || typeof submission !== 'object' || typeof submission.id !== 'string' || !ID.test(submission.id)
      || submissionIds.has(submission.id)
      || !['approved', 'pending'].includes(submission.status)) return null;
    const fullName = text(submission.fullName, 200);
    const rawEmail = text(submission.email, 254);
    const email = rawEmail?.toLowerCase();
    const major = text(submission.major, 158);
    const graduationYear = text(submission.graduationYear, 6);
    const fileName = text(submission.fileName, 255);
    const linkedinUrl = normalizeLinkedInUrl(submission.linkedinUrl);
    const uploadedAt = text(submission.uploadedAt, 40);
    if (!fullName || !email || !isOSUEmail(email) || /\s/.test(email)
      || !major || !fileName || linkedinUrl === null
      || !graduationYear || !/^(?:\d{4}|Alumni)$/.test(graduationYear)
      || !uploadedAt || !Number.isFinite(Date.parse(uploadedAt))) return null;
    if (submission.status === 'approved') {
      if (approvedEmails.has(email)) return null;
      approvedEmails.add(email);
    }
    if (!Array.isArray(submission.companyIds) || submission.companyIds.length > 100
      || new Set(submission.companyIds).size !== submission.companyIds.length
      || submission.companyIds.some((id) => typeof id !== 'string' || !companyIds.has(id))) return null;
    submissionIds.add(submission.id);
    submissions.push({
      id: submission.id, fullName, email, major, graduationYear, linkedinUrl,
      companyIds: [...submission.companyIds].sort(), status: submission.status,
      uploadedAt, fileName,
    });
  }
  return { companies, submissions };
}

function readSaved() {
  if (memoryOnly || typeof window === 'undefined') return { status: 'unavailable' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { status: 'missing' };
    if (raw.length > MAX_SAVED_CHARACTERS) return { status: 'invalid', raw };
    let saved;
    try { saved = JSON.parse(raw); } catch { return { status: 'invalid', raw }; }
    const now = Date.now();
    if (saved?.version !== VERSION || !Number.isSafeInteger(saved.expiresAt)
      || saved.expiresAt <= now || saved.expiresAt > now + LIFETIME + 60_000) {
      return { status: 'invalid', raw };
    }
    const state = validatedState(saved.state);
    return state ? { status: 'ready', raw, state, expiresAt: saved.expiresAt } : { status: 'invalid', raw };
  } catch {
    // Once storage fails, retain local changes in memory instead of repeatedly
    // replacing them with an older successfully saved snapshot.
    memoryOnly = true;
    return { status: 'unavailable' };
  }
}

function discardInvalidSaved(raw) {
  if (memoryOnly || typeof window === 'undefined') return;
  try {
    // Another page may have written a valid replacement after our read.
    if (window.localStorage.getItem(STORAGE_KEY) === raw) window.localStorage.removeItem(STORAGE_KEY);
  } catch { memoryOnly = true; }
}

function freshSnapshot() {
  snapshot = createPreviewState();
  expiresAt = Date.now() + LIFETIME;
  lastSaved = null;
}

function ensureInitialized() {
  if (snapshot) return;
  const saved = readSaved();
  if (saved.status === 'ready') {
    snapshot = saved.state;
    expiresAt = saved.expiresAt;
    lastSaved = saved.raw;
  } else {
    if (saved.status === 'invalid') discardInvalidSaved(saved.raw);
    freshSnapshot();
  }
}

function publish() {
  listeners.forEach((listener) => listener());
}

function scheduleExpiry() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(expiryTimer);
  if (listeners.size) expiryTimer = window.setTimeout(synchronize, Math.max(1, expiresAt - Date.now()));
}

function synchronize(notify = true) {
  ensureInitialized();
  const previous = snapshot;
  const saved = readSaved();
  if (saved.status === 'ready' && saved.raw !== lastSaved) {
    snapshot = saved.state;
    expiresAt = saved.expiresAt;
    lastSaved = saved.raw;
  } else if (saved.status === 'invalid' || (saved.status === 'missing' && lastSaved !== null)
    || Date.now() >= expiresAt) {
    if (saved.status === 'invalid') discardInvalidSaved(saved.raw);
    freshSnapshot();
  }
  scheduleExpiry();
  if (notify && previous !== snapshot) publish();
}

function onStorage(event) {
  if (event.key === STORAGE_KEY || event.key === null) synchronize();
}

function onFocus() { synchronize(); }

function onVisibilityChange() {
  if (document.visibilityState === 'visible') synchronize();
}

function subscribe(listener) {
  ensureInitialized();
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  synchronize();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(expiryTimer);
    }
  };
}

function getSnapshot() {
  ensureInitialized();
  return snapshot;
}

/**
 * Synchronous like an external store: functional updaters see the freshest
 * readable snapshot and run before this returns. Local tabs use last-write-wins
 * metadata, not database transactions or production concurrency guarantees.
 */
function setState(update) {
  ensureInitialized();
  const previous = snapshot;
  synchronize(false);
  const candidate = typeof update === 'function' ? update(snapshot) : update;
  if (candidate !== snapshot) {
    const next = validatedState(candidate);
    if (!next) throw new Error('Invalid recruiting preview state.');
    snapshot = next;
    expiresAt = Date.now() + LIFETIME;
    if (!memoryOnly && typeof window !== 'undefined') {
      try {
        const raw = JSON.stringify({ version: VERSION, expiresAt, state: snapshot });
        if (raw.length > MAX_SAVED_CHARACTERS) throw new Error('Preview metadata is too large.');
        window.localStorage.setItem(STORAGE_KEY, raw);
        lastSaved = raw;
      } catch { memoryOnly = true; }
    }
  }
  scheduleExpiry();
  if (previous !== snapshot) publish();
}

export function useRecruitingPreviewState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [state, setState];
}

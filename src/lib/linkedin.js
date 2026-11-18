/**
 * Optional public-profile URL normalization. This is local validation only:
 * accepting a URL does not prove the profile exists or belongs to the student.
 */
export function normalizeLinkedInUrl(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  if (!value.trim()) return '';
  if (value.length > 2048 || /[\s\\]/u.test(value)
    || [...value].some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || (code >= 127 && code <= 159);
    })) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:'
      || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;

    const match = /^\/in\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    const profile = decodeURIComponent(match[1]);
    if (/[\s/\\?#]/u.test(profile) || [...profile].some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || (code >= 127 && code <= 159);
    })) return null;

    // Keep the profile path, drop tracking/fragment data, and use one host.
    return `https://www.linkedin.com/in/${match[1]}/`;
  } catch {
    return null;
  }
}

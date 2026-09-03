// Cloudflare's documented always-pass key is used only by Vite's development
// mode. Production fails closed unless Vercel provides the real public site key.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
  || (import.meta.env.DEV ? '1x00000000000000000000AA' : '');

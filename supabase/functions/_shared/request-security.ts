const DEFAULT_ORIGINS = new Set([
  'https://shpeosu.com',
  'https://www.shpeosu.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

const TURNSTILE_TEST_SECRETS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

function configuredOrigins(): Set<string> {
  const configured = (typeof Deno === 'undefined' ? undefined : Deno.env.get('PUBLIC_SITE_ORIGINS'))
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? new Set(configured) : DEFAULT_ORIGINS;
}

export function isAllowedOrigin(origin: string | null): boolean {
  // Non-browser clients do not need CORS response headers. Origin checks are a
  // browser containment measure, not the anti-spam boundary; Turnstile and the
  // database limits still run for requests that omit/spoof this header.
  if (!origin) return true;
  return configuredOrigins().has(origin);
}

/** Cloudflare dummy secrets are useful locally but must fail closed on Edge. */
export function isTurnstileSecretAllowed(secret: string, supabaseUrl: string): boolean {
  if (!TURNSTILE_TEST_SECRETS.has(secret)) return true;

  try {
    const url = new URL(supabaseUrl);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'http:' && (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === 'kong'
      || hostname.startsWith('supabase_kong_')
    );
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function requestIp(request: Request): string {
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return cloudflareIp.slice(0, 64);

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 64);

  // Supabase's gateway normally supplies cf-connecting-ip. The final XFF hop
  // is a safer local/self-hosted fallback than the first value, which a caller
  // can prepend before a proxy appends the actual peer.
  const forwarded = request.headers.get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded?.at(-1)?.slice(0, 64) || 'unknown';
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

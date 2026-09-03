type FetchLike = typeof fetch;

function authorizationHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: secretKey };
  if (secretKey.startsWith('eyJ')) headers.Authorization = `Bearer ${secretKey}`;
  return headers;
}

function encodedObjectPath(bucket: string, path = ''): string {
  return [bucket, ...path.split('/').filter(Boolean)]
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function responseBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Minimal server-only PostgREST RPC client.
 *
 * Supabase's current `sb_secret_` keys must be sent in `apikey` only; putting
 * them in `Authorization: Bearer` makes the gateway parse them as JWTs and
 * reject them. Legacy JWT service-role keys still need the bearer header during
 * the documented transition period.
 */
export function createRestAdmin(
  supabaseUrl: string,
  secretKey: string,
  fetchImpl: FetchLike = fetch,
) {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      const headers: Record<string, string> = {
        ...authorizationHeaders(secretKey),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      try {
        const response = await fetchImpl(
          `${supabaseUrl}/rest/v1/rpc/${encodeURIComponent(name)}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(args),
            signal: AbortSignal.timeout(5000),
          },
        );
        const text = await response.text();
        const body = text ? JSON.parse(text) : null;

        if (!response.ok) {
          return {
            data: null,
            error: { code: typeof body?.code === 'string' ? body.code : `http_${response.status}` },
          };
        }
        return { data: body, error: null };
      } catch {
        return { data: null, error: { code: 'rpc_unavailable' } };
      }
    },
    storage: {
      async upload(bucket: string, path: string, file: Blob) {
        try {
          const response = await fetchImpl(
            `${supabaseUrl}/storage/v1/object/${encodedObjectPath(bucket, path)}`,
            {
              method: 'POST',
              headers: {
                ...authorizationHeaders(secretKey),
                'Content-Type': 'application/pdf',
                'Cache-Control': 'no-store, max-age=0',
                'x-upsert': 'false',
              },
              body: file,
              signal: AbortSignal.timeout(10_000),
            },
          );
          const body = await responseBody(response);
          if (response.ok) return { status: 'uploaded' as const, error: null };

          const duplicate = response.status === 409
            || body?.statusCode === '409'
            || body?.error === 'Duplicate'
            || (typeof body?.message === 'string' && /already exists/i.test(body.message));
          if (duplicate) return { status: 'exists' as const, error: null };

          return {
            status: null,
            error: {
              code: typeof body?.error === 'string'
                ? body.error
                : `http_${response.status}`,
            },
          };
        } catch {
          return { status: null, error: { code: 'storage_unavailable' } };
        }
      },

      async remove(bucket: string, paths: string[]) {
        try {
          const response = await fetchImpl(
            `${supabaseUrl}/storage/v1/object/${encodedObjectPath(bucket)}`,
            {
              method: 'DELETE',
              headers: {
                ...authorizationHeaders(secretKey),
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ prefixes: paths }),
              signal: AbortSignal.timeout(5000),
            },
          );
          const body = await responseBody(response);
          if (response.ok) return { error: null };
          return {
            error: {
              code: typeof body?.error === 'string'
                ? body.error
                : `http_${response.status}`,
            },
          };
        } catch {
          return { error: { code: 'storage_unavailable' } };
        }
      },
    },
  };
}

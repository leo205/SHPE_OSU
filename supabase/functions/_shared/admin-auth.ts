export type AdminAuthorization = 'admin' | 'unauthorized' | 'forbidden' | 'unavailable';

/** Verify the caller with Auth; never trust locally decoded JWT/user metadata. */
export async function authorizeAdmin(
  url: string,
  secretKey: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminAuthorization> {
  try {
    const response = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: secretKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) return 'unauthorized';
    if (!response.ok) return 'unavailable';
    const user = await response.json();
    if (!user || typeof user.id !== 'string' || !user.id) return 'unauthorized';
    return user.app_metadata?.role === 'admin' ? 'admin' : 'forbidden';
  } catch {
    return 'unavailable';
  }
}

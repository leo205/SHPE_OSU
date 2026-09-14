import { describe, expect, it, vi } from 'vitest';
import { authorizeAdmin } from './admin-auth.ts';

describe('cleanup admin authentication', () => {
  it('sends the user bearer to Auth and checks server-owned role metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'user', app_metadata: { role: 'admin' } }));
    expect(await authorizeAdmin('https://project.supabase.co', 'sb_secret_test', 'user-jwt', fetchMock)).toBe('admin');
    expect(fetchMock).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', expect.objectContaining({
      headers: { apikey: 'sb_secret_test', Authorization: 'Bearer user-jwt' },
    }));
  });
  it('does not accept a self-assigned user_metadata admin role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'user', user_metadata: { role: 'admin' } }));
    expect(await authorizeAdmin('https://project.supabase.co', 'secret', 'jwt', fetchMock)).toBe('forbidden');
  });
  it.each([401, 403, 500])('fails closed when Auth returns %s', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
    expect(await authorizeAdmin('https://project.supabase.co', 'secret', 'jwt', fetchMock))
      .toBe(status === 500 ? 'unavailable' : 'unauthorized');
  });
  it('fails closed on Auth network failure', async () => {
    expect(await authorizeAdmin('https://project.supabase.co', 'secret', 'jwt', vi.fn().mockRejectedValue(new Error())))
      .toBe('unavailable');
  });
});

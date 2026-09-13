import { describe, expect, it, vi } from 'vitest';
import { createRestAdmin } from './supabase-admin.ts';

describe('server-only Supabase RPC client', () => {
  it('sends a current secret key only as apikey', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify('accepted')));
    const client = createRestAdmin('https://project.supabase.co', 'sb_secret_current', fetchMock);

    expect(await client.rpc('submit_attendance', { p_year: '2nd Year' }))
      .toEqual({ data: 'accepted', error: null });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.apikey).toBe('sb_secret_current');
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('keeps the bearer header only for a legacy JWT service-role key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('true'));
    const legacyKey = 'eyJlegacy-service-role';
    const client = createRestAdmin('https://project.supabase.co', legacyKey, fetchMock);

    await client.rpc('consume_public_submission_rate_limit', {});
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toMatchObject({
      apikey: legacyKey,
      Authorization: `Bearer ${legacyKey}`,
    });
  });

  it('returns a narrow error without leaking the response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: '42501', message: 'sensitive database detail' }),
      { status: 403 }
    ));
    const client = createRestAdmin('https://project.supabase.co', 'sb_secret_current', fetchMock);

    expect(await client.rpc('submit_attendance', {}))
      .toEqual({ data: null, error: { code: '42501' } });
  });

  it('uploads a private PDF without upserting an existing idempotency path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ Key: 'resumes/submissions/1_id.pdf' }),
      { status: 200 },
    ));
    const client = createRestAdmin('https://project.supabase.co', 'sb_secret_current', fetchMock);
    const pdf = new File(['%PDF-test'], 'ignored.pdf', { type: 'application/pdf' });

    expect(await client.storage.upload('resumes', 'submissions/1_id.pdf', pdf))
      .toEqual({ status: 'uploaded', error: null });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/storage/v1/object/resumes/submissions/1_id.pdf');
    expect(options).toMatchObject({
      method: 'POST',
      body: pdf,
      headers: expect.objectContaining({
        apikey: 'sb_secret_current',
        'Content-Type': 'application/pdf',
        'x-upsert': 'false',
      }),
    });
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('distinguishes an existing upload path from an ordinary Storage error', async () => {
    const duplicateFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: '409',
      error: 'Duplicate',
      message: 'The resource already exists',
    }), { status: 400 }));
    const duplicateClient = createRestAdmin(
      'https://project.supabase.co',
      'sb_secret_current',
      duplicateFetch,
    );
    expect(await duplicateClient.storage.upload(
      'resumes',
      'submissions/1_id.pdf',
      new Blob(['%PDF-test'], { type: 'application/pdf' }),
    )).toEqual({ status: 'exists', error: null });

    const failedFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ statusCode: '403', message: 'private detail' }),
      { status: 403 },
    ));
    const failedClient = createRestAdmin(
      'https://project.supabase.co',
      'sb_secret_current',
      failedFetch,
    );
    expect(await failedClient.storage.upload(
      'resumes',
      'submissions/1_id.pdf',
      new Blob(['%PDF-test'], { type: 'application/pdf' }),
    )).toEqual({ status: null, error: { code: 'http_403' } });
  });

  it('removes only the explicit orphan path after a definite database rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    const client = createRestAdmin('https://project.supabase.co', 'eyJlegacy', fetchMock);

    expect(await client.storage.remove('resumes', ['submissions/1_id.pdf']))
      .toEqual({ error: null });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/storage/v1/object/resumes');
    expect(options).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ prefixes: ['submissions/1_id.pdf'] }),
      headers: expect.objectContaining({
        apikey: 'eyJlegacy',
        Authorization: 'Bearer eyJlegacy',
        'Content-Type': 'application/json',
      }),
    });
  });
});

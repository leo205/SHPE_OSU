/** One bounded pass; an unavailable check does not prove files need removal. */
export async function cleanupRetiredResumeFiles(client) {
  try {
    const { data, error } = await client.functions.invoke('cleanup-resume-files', {
      body: {},
      timeout: 65_000,
    });
    if (error || !['complete', 'pending'].includes(data?.status)
      || (data.remaining !== undefined && (!Number.isSafeInteger(data.remaining) || data.remaining < 0))
      || (data.status === 'complete' && data.remaining > 0)) {
      return { status: 'unavailable', pending: false };
    }
    return { status: data.status, pending: data.status === 'pending' };
  } catch {
    return { status: 'unavailable', pending: false };
  }
}

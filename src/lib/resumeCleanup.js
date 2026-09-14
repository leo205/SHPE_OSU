/** One bounded pass; failed work stays on the server for the next admin visit. */
export async function cleanupRetiredResumeFiles(client) {
  try {
    const { data, error } = await client.functions.invoke('cleanup-resume-files', {
      body: {},
      timeout: 65_000,
    });
    if (error || !['complete', 'pending'].includes(data?.status)) return { pending: true };
    return { pending: data.status === 'pending' };
  } catch {
    return { pending: true };
  }
}

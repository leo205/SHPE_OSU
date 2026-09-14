const DATASETS = {
  attendance: { order: 'created_at', label: 'attendance records' },
  resumes: { order: 'uploaded_at', label: 'resume submissions' },
  company_access: { order: 'created_at', label: 'historical recruiter codes' },
  events: { order: 'date', label: 'calendar events' },
};

export const ADMIN_DATASET_NAMES = Object.keys(DATASETS);
const MAX_PAGES = 10_000;

/**
 * Publish a dataset only after every counted row has arrived. A short response
 * can reflect the server's row cap, not the end of the table, so advance by the
 * actual response length and stop at the exact count instead of the page size.
 *
 * The unique secondary order keeps equal timestamps stable. Counts and IDs also
 * detect changes between requests; this is not a database snapshot, but detected
 * changes must never produce a plausible-looking partial report or CSV export.
 */
export async function loadAdminDataset(client, name, { signal } = {}) {
  const dataset = DATASETS[name];
  if (!dataset) throw new Error('Unknown admin dataset');

  try {
    const rows = [];
    const seenIds = new Set();
    let expectedCount;
    let pageCount = 0;

    do {
      if (++pageCount > MAX_PAGES) throw new Error('The record set could not be loaded completely.');
      if (signal?.aborted) throw new Error('The request was cancelled.');
      let query = client
        .from(name)
        .select('*', { count: 'exact' })
        .order(dataset.order, { ascending: false })
        .order('id', { ascending: false })
        .range(rows.length, rows.length + 999);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query;

      if (signal?.aborted) throw new Error('The request was cancelled.');
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('The server did not confirm the complete record count.');
      }
      if (expectedCount !== undefined && count !== expectedCount) {
        throw new Error('The records changed while loading.');
      }
      expectedCount = count;
      if ((data.length === 0 && rows.length < count) || rows.length + data.length > count) {
        throw new Error('The server returned an incomplete record set.');
      }
      for (const row of data) {
        if (!row?.id || seenIds.has(row.id)) {
          throw new Error('The records changed while loading.');
        }
        seenIds.add(row.id);
        rows.push(row);
      }
    } while (rows.length < expectedCount);

    return { status: 'ready', data: rows, error: null };
  } catch {
    return {
      status: 'error',
      data: null,
      error: `Could not load all ${dataset.label}. Please retry.`,
    };
  }
}

import { describe, expect, it } from 'vitest';
import { ADMIN_DATASET_NAMES, loadAdminDataset } from './adminData';

const makeRows = (count) => Array.from({ length: count }, (_, index) => ({
  id: String(index + 1).padStart(6, '0'),
  created_at: '2026-09-14T18:00:00Z',
  uploaded_at: '2026-09-14T18:00:00Z',
  date: '2026-09-14',
}));

function mockClient(rows, { caps = [1000], respond } = {}) {
  const requests = [];
  return {
    requests,
    from(table) {
      const request = { table, order: [] };
      const query = {
        select(columns, options) {
          request.select = { columns, options };
          return query;
        },
        order(column, options) {
          request.order.push({ column, options });
          return query;
        },
        range(from, to) {
          request.range = [from, to];
          return query;
        },
        abortSignal(signal) {
          request.signal = signal;
          return query;
        },
        then(resolve, reject) {
          const index = requests.length;
          requests.push(request);
          return Promise.resolve().then(() => {
            if (respond) return respond(request, index);
            const sorted = [...rows].sort((a, b) => {
              for (const { column, options } of request.order) {
                const comparison = String(a[column]).localeCompare(String(b[column]));
                if (comparison) return options.ascending ? comparison : -comparison;
              }
              return 0;
            });
            const [from, to] = request.range;
            const length = Math.min(to - from + 1, caps[index % caps.length]);
            return { data: sorted.slice(from, from + length), error: null, count: rows.length };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

describe('complete admin datasets', () => {
  it('loads history beyond one server page with a stable order for equal timestamps', async () => {
    const rows = makeRows(2507);
    const client = mockClient(rows);
    const result = await loadAdminDataset(client, 'attendance');
    expect(result).toEqual({ status: 'ready', data: [...rows].reverse(), error: null });
    expect(client.requests.map((request) => request.range)).toEqual([
      [0, 999], [1000, 1999], [2000, 2999],
    ]);
    for (const request of client.requests) {
      expect(request.select).toEqual({ columns: '*', options: { count: 'exact' } });
      expect(request.order).toEqual([
        { column: 'created_at', options: { ascending: false } },
        { column: 'id', options: { ascending: false } },
      ]);
    }
  });

  it('continues after short pages even when the server cap changes between requests', async () => {
    const rows = makeRows(18);
    const client = mockClient(rows, { caps: [3, 1, 5] });
    const result = await loadAdminDataset(client, 'attendance');
    expect(result.data).toEqual([...rows].reverse());
    expect(client.requests.map((request) => request.range[0])).toEqual([0, 3, 4, 9, 12, 13]);
  });

  it.each(ADMIN_DATASET_NAMES)('distinguishes an empty successful %s load from failure', async (name) => {
    expect(await loadAdminDataset(mockClient([]), name)).toEqual({ status: 'ready', data: [], error: null });
    const client = mockClient([], { respond: () => ({ data: null, count: null, error: { message: 'Network error' } }) });
    expect(await loadAdminDataset(client, name)).toMatchObject({ status: 'error', data: null, error: expect.stringContaining('Please retry') });
    expect(client.requests).toHaveLength(1);
  });

  it.each([
    ['later-page failure', () => ({ data: null, count: null, error: { message: 'Request failed' } })],
    ['thrown network failure', () => { throw new Error('Network unavailable'); }],
    ['premature empty page', () => ({ data: [], count: 3, error: null })],
    ['changed count', () => ({ data: [{ id: '2' }], count: 4, error: null })],
    ['missing count', () => ({ data: [{ id: '2' }], count: null, error: null })],
    ['duplicate row', () => ({ data: [{ id: '1' }], count: 3, error: null })],
    ['invalid row', () => ({ data: [{}], count: 3, error: null })],
    ['too many rows', () => ({ data: [{ id: '2' }, { id: '3' }, { id: '4' }], count: 3, error: null })],
  ])('discards partial results on %s', async (_label, badResponse) => {
    const client = mockClient([], {
      respond: (_request, index) => index === 0
        ? { data: [{ id: '1' }], count: 3, error: null }
        : badResponse(),
    });
    expect(await loadAdminDataset(client, 'attendance')).toMatchObject({ status: 'error', data: null });
    expect(client.requests).toHaveLength(2);
  });

  it('can recover with a complete retry after a failed load', async () => {
    let failing = true;
    const rows = makeRows(2);
    const client = mockClient([], {
      respond: () => failing
        ? { data: null, error: { message: 'Temporary error' }, count: null }
        : { data: rows, error: null, count: rows.length },
    });
    expect(await loadAdminDataset(client, 'events')).toMatchObject({ status: 'error', data: null });
    failing = false;
    expect(await loadAdminDataset(client, 'events')).toEqual({ status: 'ready', data: rows, error: null });
    expect(client.requests.every((request) => request.table === 'events')).toBe(true);
  });

  it('does not publish an aborted response or request another page', async () => {
    const controller = new AbortController();
    const client = mockClient([], {
      respond: () => {
        controller.abort();
        return { data: [{ id: '1' }], count: 2, error: null };
      },
    });
    expect(await loadAdminDataset(client, 'attendance', { signal: controller.signal }))
      .toMatchObject({ status: 'error', data: null });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0].signal).toBe(controller.signal);
  });

  it('bounds the number of requests when the reported total is implausibly large', async () => {
    const client = mockClient([], {
      respond: (_request, index) => ({ data: [{ id: String(index + 1) }], count: Number.MAX_SAFE_INTEGER, error: null }),
    });
    expect(await loadAdminDataset(client, 'attendance')).toMatchObject({ status: 'error', data: null });
    expect(client.requests).toHaveLength(10_000);
  });
});

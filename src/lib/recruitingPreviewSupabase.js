// This client exists only in the isolated recruiting-preview Vite build. It
// cannot make requests or read credentials, even when the shared admin shell
// imports services that normally use Supabase.
const READABLE_TABLES = new Set(['attendance', 'resumes', 'company_access', 'events', 'sponsors']);
const PREVIEW_ERROR = {
  message: 'This action is unavailable in the local recruiting preview.',
  code: 'LOCAL_PREVIEW_ONLY',
};
const denied = () => ({ data: null, error: { ...PREVIEW_ERROR }, count: null });

function emptyQuery(table) {
  let mutation = false;
  let signal;
  let single = false;
  const result = () => {
    if (mutation || !READABLE_TABLES.has(table) || signal?.aborted) return denied();
    return { data: single ? null : [], error: null, count: 0 };
  };
  const query = {
    select() { return query; },
    order() { return query; },
    range() { return query; },
    eq() { return query; },
    limit() { return query; },
    abortSignal(value) { signal = value; return query; },
    single() { single = true; return query; },
    maybeSingle() { single = true; return query; },
    insert() { mutation = true; return query; },
    update() { mutation = true; return query; },
    upsert() { mutation = true; return query; },
    delete() { mutation = true; return query; },
    then(onFulfilled, onRejected) { return Promise.resolve(result()).then(onFulfilled, onRejected); },
  };
  return query;
}

const previewUser = {
  id: 'local-preview-admin',
  email: 'preview.admin@example.invalid',
  app_metadata: { role: 'admin' },
};

export const supabase = {
  from: emptyQuery,
  rpc: async () => denied(),
  auth: {
    getSession: async () => ({ data: { session: { user: previewUser } }, error: null }),
    getUser: async () => ({ data: { user: previewUser }, error: null }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => denied(),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  functions: {
    invoke: async (name, options) => {
      // The shared shell performs this maintenance pass on mount. Simulate an
      // empty queue rather than displaying an unrelated service-failure alert.
      if (name === 'cleanup-resume-files'
        || (name === 'manage-sponsor-assets' && options?.body?.action === 'cleanup')) {
        return { data: { status: 'complete', removed: 0 }, error: null };
      }
      return denied();
    },
  },
  storage: {
    from: () => ({
      createSignedUrl: async () => denied(),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      upload: async () => denied(),
      remove: async () => denied(),
    }),
  },
};

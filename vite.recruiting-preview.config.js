import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PAGE_PATHS = new Set(['/resume-upload', '/company/dashboard', '/admin', '/admin/resumes', '/admin/recruiting-companies']);

function isolatedPreviewClient() {
  const realClient = fileURLToPath(new URL('./src/lib/supabase.js', import.meta.url));
  const previewClient = fileURLToPath(new URL('./src/lib/recruitingPreviewSupabase.js', import.meta.url));
  return {
    name: 'isolated-recruiting-preview-client',
    enforce: 'pre',
    resolveId(source, importer) {
      // Covers ../lib/supabase, ../../lib/supabase and the event service's
      // dynamic ./supabase import. No credential-bearing client enters this
      // experiment's module graph, including transitive admin dependencies.
      const candidate = source.startsWith('.') && importer
        ? resolve(dirname(importer.split('?')[0]), source)
        : source;
      if (candidate === realClient || `${candidate}.js` === realClient
        || source === '/src/lib/supabase' || source === '/src/lib/supabase.js') {
        return previewClient;
      }
      return null;
    },
  };
}

// Only this isolated local server maps the role-specific URLs to the preview.
// The main site's Vite/Vercel configuration and protected routes are untouched.
function rolePreviewPages() {
  const install = (server) => {
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname.replace(/\/$/, '') || '/';
      if (pathname === '/' || PAGE_PATHS.has(pathname)) {
        request.url = `/recruiting-preview.html${url.search}`;
      }
      next();
    });
  };
  return { name: 'local-role-preview-pages', configureServer: install, configurePreviewServer: install };
}

// Separate entry/output: the local experiment never mounts the live app or
// imports its Supabase client. The normal production build stays unchanged.
export default defineConfig({
  plugins: [isolatedPreviewClient(), react(), rolePreviewPages()],
  appType: 'mpa',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: {
    target: 'safari14',
    outDir: 'dist-recruiting-preview',
    rollupOptions: {
      input: fileURLToPath(new URL('./recruiting-preview.html', import.meta.url)),
    },
  },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

/*
 * Mirror the production security headers from vercel.json onto `vite preview`.
 *
 * These headers only exist on Vercel, so a bad Content-Security-Policy used to
 * be invisible until it hit production — that is how the sponsor contact form
 * silently broke (api.emailjs.com was missing from connect-src). Reading the
 * same file the deploy reads keeps one source of truth and makes CSP
 * violations reproducible locally via `npm run preview`.
 */
function productionHeaders() {
  const config = JSON.parse(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')
  )
  const catchAll = config.headers?.find((rule) => rule.source === '/(.*)')
  return Object.fromEntries(
    (catchAll?.headers ?? []).map(({ key, value }) => [key, value])
  )
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    headers: productionHeaders(),
  },
})

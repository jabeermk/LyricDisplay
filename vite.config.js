import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { handle, memoryStore } from './netlify/lib/library-core.mjs'

// Emits sw.js with a precache list of every built asset (hashed names => new cache per release).
function serviceWorkerPlugin() {
  return {
    name: 'stagelyrics-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.woff') && !f.endsWith('.map'))
      const extra = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon.svg']
      const files = ['./', ...built, ...extra]
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10)
      const source = `/* generated */
const CACHE = 'stagelyrics-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(new Request(new URL(f, self.registration.scope), { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('stagelyrics-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return; // never cache the shared-library API
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match(new URL('./', self.registration.scope)) : Response.error()));
    })
  );
});
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Dev only: /api/library backed by memory so sync can be tried with "npm run dev" (edit key: dev).
function devApiPlugin() {
  const store = memoryStore()
  return {
    name: 'stagelyrics-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/library', async (req, res) => {
        const chunks = []
        for await (const c of req) chunks.push(c)
        const body = Buffer.concat(chunks)
        const url = new URL(req.url || '/', 'http://localhost')
        const request = new Request('http://localhost/api/library' + url.search, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
        })
        const r = await handle(request, store, process.env.EDIT_KEY || '555')
        res.statusCode = r.status
        r.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await r.text())
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerPlugin(), devApiPlugin()],
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.js', 'netlify/**/*.test.mjs'] },
})

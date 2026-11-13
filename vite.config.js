import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handle, memoryStore } from './netlify/lib/library-core.mjs'

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
  plugins: [react(), devApiPlugin()],
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.js', 'netlify/**/*.test.mjs'] },
})

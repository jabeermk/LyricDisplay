// Shared-library API logic. Storage is injected (Netlify Blobs in production, memory in dev/tests).
// GET  /api/library?since=N  -> {rev, lib} | {rev, unchanged:true}   (anyone can read)
// PUT  /api/library          -> body {baseRev, lib}, header x-edit-key (must equal EDIT_KEY env)
export const KEY = 'library'
const MAX_BYTES = 4_500_000

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const validLib = (l) => !!l && Array.isArray(l.songs) && Array.isArray(l.playlists) && (l.types === undefined || Array.isArray(l.types))

export async function handle(req, store, editKey) {
  if (req.method === 'GET') {
    const doc = await store.get(KEY, { type: 'json' })
    if (!doc) return json({ rev: 0, lib: null })
    const since = Number(new URL(req.url).searchParams.get('since'))
    if (since === doc.rev) return json({ rev: doc.rev, unchanged: true })
    return json({ rev: doc.rev, lib: doc.lib, updatedAt: doc.updatedAt })
  }

  if (req.method === 'PUT') {
    if (!editKey) return json({ error: 'EDIT_KEY is not set on the server.' }, 503)
    if (req.headers.get('x-edit-key') !== editKey) return json({ error: 'Wrong edit key.' }, 401)
    const text = await req.text()
    if (text.length > MAX_BYTES) return json({ error: 'Library too large.' }, 413)
    let body
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: 'Bad JSON.' }, 400)
    }
    if (!validLib(body.lib)) return json({ error: 'Bad library.' }, 400)
    const doc = await store.get(KEY, { type: 'json' })
    const rev = doc ? doc.rev : 0
    if (body.baseRev !== rev) return json({ error: 'Conflict', rev, lib: doc ? doc.lib : null }, 409)
    const next = {
      rev: rev + 1,
      lib: { songs: body.lib.songs, playlists: body.lib.playlists, types: body.lib.types || [] },
      updatedAt: new Date().toISOString(),
    }
    await store.setJSON(KEY, next)
    return json({ rev: next.rev })
  }

  return json({ error: 'Method not allowed.' }, 405)
}

export function memoryStore() {
  const m = new Map()
  return {
    async get(k) {
      return m.has(k) ? JSON.parse(m.get(k)) : null
    },
    async setJSON(k, v) {
      m.set(k, JSON.stringify(v))
    },
  }
}

import { describe, expect, it } from 'vitest'
import { handle, memoryStore } from './library-core.mjs'

const req = (method, body, key, qs = '') =>
  new Request('http://x/api/library' + qs, { method, headers: key ? { 'x-edit-key': key } : {}, body: body ? JSON.stringify(body) : undefined })
const lib = (n) => ({ songs: Array.from({ length: n }, (_, i) => ({ id: 's' + i, title: 'T' + i, lyrics: 'x' })), playlists: [], types: [] })

describe('library api', () => {
  it('empty read, key checks, write, read, conflict, unchanged', async () => {
    const store = memoryStore()
    let r = await handle(req('GET'), store, 'k')
    expect(await r.json()).toEqual({ rev: 0, lib: null })

    expect((await handle(req('PUT', { baseRev: 0, lib: lib(1) }, 'bad'), store, 'k')).status).toBe(401)
    expect((await handle(req('PUT', { baseRev: 0, lib: lib(1) }, 'k'), store, '')).status).toBe(503)
    expect((await handle(req('PUT', { baseRev: 0, lib: { songs: 1 } }, 'k'), store, 'k')).status).toBe(400)

    r = await handle(req('PUT', { baseRev: 0, lib: lib(2) }, 'k'), store, 'k')
    expect(await r.json()).toEqual({ rev: 1 })

    r = await handle(req('GET'), store, 'k')
    const d = await r.json()
    expect(d.rev).toBe(1)
    expect(d.lib.songs).toHaveLength(2)

    r = await handle(req('PUT', { baseRev: 0, lib: lib(3) }, 'k'), store, 'k')
    expect(r.status).toBe(409)
    expect((await r.json()).lib.songs).toHaveLength(2)

    r = await handle(req('GET', null, null, '?since=1'), store, 'k')
    expect(await r.json()).toEqual({ rev: 1, unchanged: true })
    expect((await handle(req('DELETE'), store, 'k')).status).toBe(405)
  })
})

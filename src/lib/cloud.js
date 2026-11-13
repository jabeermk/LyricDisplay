// Client for the shared-library API (Netlify Function). If the API is missing (plain static host,
// local dev without it) fetchLib returns {unavailable:true} and the app stays purely local.
export async function fetchLib(since) {
  const r = await fetch('api/library?since=' + since, { cache: 'no-store' })
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return { unavailable: true }
  return r.json()
}

export async function putLib(baseRev, key, lib) {
  const r = await fetch('api/library', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-edit-key': key },
    body: JSON.stringify({ baseRev, lib }),
  })
  let body = {}
  try {
    body = await r.json()
  } catch {
    /* ignore */
  }
  return { status: r.status, ...body }
}

export const libOf = (s) => ({ songs: s.songs, playlists: s.playlists, types: s.types })
export const libHash = (s) => JSON.stringify([s.songs, s.playlists, s.types])

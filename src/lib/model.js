// Data model helpers shared by reducer, storage, backup.
import { makeId } from './ids.js'
import { normalizeLyrics } from './text.js'

export const SCHEMA_VERSION = 1

export const emptyLive = (nonce = 0) => ({ songId: null, playlistId: null, index: -1, nonce })

export const emptyState = () => ({
  songs: [],
  playlists: [],
  activePlaylistId: null,
  live: emptyLive(0),
  types: [],
  rev: 0,
})

/** Managed type list: explicit types plus any type already used by a song, de-duplicated. */
export function allTypes(state) {
  const seen = new Set()
  const out = []
  for (const t of [...(state.types || []), ...state.songs.map((s) => s.language)]) {
    const k = String(t || '').trim()
    if (k && !seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase())
      out.push(k)
    }
  }
  return out
}

export function cleanTypes(list) {
  return allTypes({ types: Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [], songs: [] })
}

export function newSong(fields, now = Date.now()) {
  return {
    id: fields.id || makeId('s_'),
    title: String(fields.title || 'Untitled').trim() || 'Untitled',
    language: String(fields.language || '').trim(),
    tag: String(fields.tag || '').trim(),
    pitch: String(fields.pitch || '').trim(),
    lyrics: normalizeLyrics(fields.lyrics),
    createdAt: fields.createdAt || now,
    updatedAt: fields.updatedAt || now,
    ...(fields.sample ? { sample: true } : {}),
  }
}

export const newEntry = (songId) => ({ id: makeId('e_'), songId })

export function newPlaylist(name, items = [], id) {
  return { id: id || makeId('p_'), name: String(name || 'Setlist').trim() || 'Setlist', items }
}

const str = (v) => (typeof v === 'string' ? v : '')

/** Coerce arbitrary data into a valid song or null. */
export function sanitizeSong(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.lyrics !== 'string' && typeof raw.title !== 'string') return null
  const title = str(raw.title).trim()
  if (!title && !str(raw.lyrics).trim()) return null
  return newSong(
    {
      id: typeof raw.id === 'string' && raw.id ? raw.id : undefined,
      title,
      language: str(raw.language),
      tag: str(raw.tag),
      pitch: str(raw.pitch),
      lyrics: str(raw.lyrics),
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
      sample: raw.sample === true,
    },
    now,
  )
}

/** Coerce arbitrary data into a valid playlist (items referencing unknown songs are dropped). */
export function sanitizePlaylist(raw, songIds) {
  if (!raw || typeof raw !== 'object') return null
  const name = str(raw.name).trim()
  if (!name) return null
  const list = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.songIds)
      ? raw.songIds.map((songId) => ({ songId }))
      : []
  const used = new Set()
  const items = []
  let dropped = 0
  for (const it of list) {
    const songId = typeof it === 'string' ? it : it && it.songId
    if (typeof songId !== 'string' || !songIds.has(songId)) {
      dropped++
      continue
    }
    let id = it && typeof it.id === 'string' && it.id ? it.id : makeId('e_')
    if (used.has(id)) id = makeId('e_')
    used.add(id)
    items.push({ id, songId })
  }
  return { playlist: { id: typeof raw.id === 'string' && raw.id ? raw.id : makeId('p_'), name, items }, dropped }
}

/** Light structural check for persisted/remote state. */
export function isValidState(s) {
  return (
    !!s && Array.isArray(s.songs) && Array.isArray(s.playlists) && !!s.live && typeof s.live === 'object' && Number.isFinite(s.rev)
  )
}

/** Repair a loaded state so every invariant holds. */
export function repairState(s) {
  const songs = s.songs.map((x) => sanitizeSong(x)).filter(Boolean)
  const ids = new Set()
  const uniq = songs.filter((x) => (ids.has(x.id) ? false : (ids.add(x.id), true)))
  const pids = new Set()
  const playlists = []
  for (const p of s.playlists) {
    const r = sanitizePlaylist(p, ids)
    if (r && !pids.has(r.playlist.id)) {
      pids.add(r.playlist.id)
      playlists.push(r.playlist)
    }
  }
  const live = { ...emptyLive(0), ...s.live }
  const nonce = Number.isFinite(live.nonce) ? live.nonce : 0
  const pl = playlists.find((p) => p.id === live.playlistId)
  const inChain = !!pl && pl.items[live.index]?.songId === live.songId
  return {
    songs: uniq,
    playlists,
    activePlaylistId: pids.has(s.activePlaylistId) ? s.activePlaylistId : playlists[0]?.id || null,
    live: ids.has(live.songId)
      ? { songId: live.songId, playlistId: inChain ? pl.id : null, index: inChain ? live.index : -1, nonce }
      : emptyLive(nonce),
    types: cleanTypes(s.types),
    rev: Math.max(0, Math.floor(s.rev)),
  }
}

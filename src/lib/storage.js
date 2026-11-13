// localStorage persistence: versioned key, migration hook, quota handling, backup validation.
import { SCHEMA_VERSION, allTypes, cleanTypes, emptyState, isValidState, repairState, sanitizePlaylist, sanitizeSong } from './model.js'

import seedBackup from '../data/songs.json'

export const DATA_KEY = 'stagelyrics:v1'
export const PREFS_KEY = 'stagelyrics:prefs'

function ls() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Upgrade older payloads step by step. Each key is the version it upgrades FROM. */
const MIGRATIONS = {
  0: (p) => ({ ...p, schema: 1 }),
}
export function migrate(payload) {
  if (!payload || typeof payload !== 'object') return null
  let p = { ...payload, schema: Number.isFinite(payload.schema) ? payload.schema : 0 }
  if (p.schema > SCHEMA_VERSION) return null
  while (p.schema < SCHEMA_VERSION) p = MIGRATIONS[p.schema](p)
  return p
}

/** First launch: songs shipped in src/data/songs.json (a backup file), or empty. */
export function seedState() {
  const v = validateBackup(seedBackup)
  if (!v.ok || !v.data.songs.length) return emptyState()
  const { songs, playlists, types } = v.data
  return { ...emptyState(), songs, playlists, types, activePlaylistId: playlists[0]?.id || null }
}

export function loadData() {
  const store = ls()
  if (!store) return { state: emptyState(), error: 'unavailable' }
  const raw = store.getItem(DATA_KEY)
  if (raw == null) return { state: seedState(), fresh: true }
  try {
    const p = migrate(JSON.parse(raw))
    if (p && isValidState(p.state)) return { state: repairState(p.state) }
  } catch {
    /* fall through */
  }
  try {
    store.setItem(`${DATA_KEY}:corrupt-${Date.now()}`, raw)
  } catch {
    /* ignore */
  }
  return { state: emptyState(), error: 'corrupt' }
}

export function saveData(state) {
  const store = ls()
  if (!store) return { ok: false, error: 'unavailable' }
  try {
    store.setItem(DATA_KEY, JSON.stringify({ schema: SCHEMA_VERSION, state }))
    return { ok: true }
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
    return { ok: false, error: quota ? 'quota' : 'unknown' }
  }
}

export function loadPrefs(defaults) {
  try {
    return { ...defaults, ...JSON.parse(ls()?.getItem(PREFS_KEY) || '{}') }
  } catch {
    return { ...defaults }
  }
}
export function savePrefs(p) {
  try {
    ls()?.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function storageUsage() {
  const store = ls()
  let bytes = 0
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k && k.startsWith('stagelyrics:')) bytes += (k.length + (store.getItem(k) || '').length) * 2
    }
  }
  return { bytes, limit: 5 * 1024 * 1024 }
}

/* ---------- backup ---------- */
export function exportBackup(state) {
  return {
    app: 'stagelyrics',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    songs: state.songs,
    playlists: state.playlists,
    types: allTypes(state),
  }
}

/** Validate + sanitize a parsed backup. Returns {ok, error} or {ok, data:{songs,playlists}, dropped}. */
export function validateBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Not a StageLyrics backup file.' }
  if (raw.app !== 'stagelyrics') return { ok: false, error: 'Not a StageLyrics backup (app field missing).' }
  if (!Number.isFinite(raw.schema) || raw.schema > SCHEMA_VERSION) return { ok: false, error: 'Backup is from a newer app version.' }
  if (!Array.isArray(raw.songs) || !Array.isArray(raw.playlists)) return { ok: false, error: 'Backup has no songs/playlists lists.' }
  const ids = new Set()
  let dropped = 0
  const songs = []
  for (const r of raw.songs) {
    const s = sanitizeSong(r)
    if (!s) dropped++
    else if (ids.has(s.id)) dropped++
    else {
      ids.add(s.id)
      songs.push(s)
    }
  }
  const playlists = []
  for (const r of raw.playlists) {
    const x = sanitizePlaylist(r, ids)
    if (x) playlists.push(x.playlist)
    else dropped++
  }
  return { ok: true, data: { songs, playlists, types: cleanTypes(raw.types) }, dropped }
}

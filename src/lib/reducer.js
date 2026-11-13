// Single app reducer. Pure except id generation inside action creators.
import { allTypes, cleanTypes, emptyLive, emptyState, newEntry, newPlaylist, newSong } from './model.js'
import { arrayMove, indexAfterMove, indexAfterRemoval, stepTarget } from './playlist.js'
import { makeId } from './ids.js'
import { dupKey } from './text.js'
import { sampleSongs, samplePlaylist } from './samples.js'

export const A = {
  addSongs: (songs) => ({ type: 'ADD_SONGS', songs: songs.map((s) => newSong(s)) }),
  updateSong: (id, patch) => ({ type: 'UPDATE_SONG', id, patch, now: Date.now() }),
  deleteSong: (id) => ({ type: 'DELETE_SONG', id }),
  createPlaylist: (name) => ({ type: 'CREATE_PLAYLIST', playlist: newPlaylist(name) }),
  renamePlaylist: (id, name) => ({ type: 'RENAME_PLAYLIST', id, name }),
  deletePlaylist: (id) => ({ type: 'DELETE_PLAYLIST', id }),
  setActive: (id) => ({ type: 'SET_ACTIVE', id }),
  playlistAdd: (playlistId, songIds) => ({
    type: 'PLAYLIST_ADD', playlistId, entries: songIds.map(newEntry),
  }),
  playlistRemove: (playlistId, index) => ({ type: 'PLAYLIST_REMOVE', playlistId, index }),
  playlistMove: (playlistId, from, to) => ({ type: 'PLAYLIST_MOVE', playlistId, from, to }),
  pushLive: (songId, playlistId = null, index = -1) => ({ type: 'PUSH_LIVE', songId, playlistId, index }),
  step: (dir) => ({ type: 'LIVE_STEP', dir }),
  clearLive: () => ({ type: 'CLEAR_LIVE' }),
  loadSamples: () => ({ type: 'LOAD_SAMPLES' }),
  replaceAll: (data) => ({ type: 'REPLACE_ALL', data }),
  mergeAll: (data) => ({ type: 'MERGE_ALL', data }),
  clearAll: () => ({ type: 'CLEAR_ALL' }),
  typeAdd: (name) => ({ type: 'TYPE_ADD', name }),
  typeRename: (from, to) => ({ type: 'TYPE_RENAME', from, to }),
  typeDelete: (name) => ({ type: 'TYPE_DELETE', name }),
}

function clearedLive(state) {
  return emptyLive(state.live.nonce + 1)
}

/** Remove one song everywhere, keeping live.index correct. */
export function removeSong(state, id) {
  let live = state.live
  const playlists = state.playlists.map((pl) => {
    if (!pl.items.some((it) => it.songId === id)) return pl
    const items = pl.items.filter((it) => it.songId !== id)
    if (live.playlistId === pl.id && live.index >= 0) {
      const kept = pl.items[live.index]
      const idx = kept && kept.songId !== id ? items.indexOf(kept) : -1
      live = idx >= 0 ? { ...live, index: idx } : { ...live, playlistId: null, index: -1 }
    }
    return { ...pl, items }
  })
  if (live.songId === id) live = clearedLive(state)
  return { ...state, songs: state.songs.filter((s) => s.id !== id), playlists, live }
}

function inner(state, a) {
  switch (a.type) {
    case 'ADD_SONGS': {
      const ids = new Set(state.songs.map((s) => s.id))
      const songs = a.songs.filter((s) => !ids.has(s.id))
      return songs.length ? { ...state, songs: [...state.songs, ...songs] } : state
    }
    case 'UPDATE_SONG':
      return {
        ...state,
        songs: state.songs.map((s) => {
          if (s.id !== a.id) return s
          const { sample: _drop, ...rest } = s
          return { ...rest, ...a.patch, id: s.id, updatedAt: a.now }
        }),
      }
    case 'DELETE_SONG':
      return state.songs.some((s) => s.id === a.id) ? removeSong(state, a.id) : state
    case 'CREATE_PLAYLIST':
      return { ...state, playlists: [...state.playlists, a.playlist], activePlaylistId: a.playlist.id }
    case 'RENAME_PLAYLIST': {
      const name = String(a.name || '').trim()
      if (!name) return state
      return { ...state, playlists: state.playlists.map((p) => (p.id === a.id ? { ...p, name } : p)) }
    }
    case 'DELETE_PLAYLIST': {
      const playlists = state.playlists.filter((p) => p.id !== a.id)
      const live = state.live.playlistId === a.id ? { ...state.live, playlistId: null, index: -1 } : state.live
      const activePlaylistId = state.activePlaylistId === a.id ? playlists[0]?.id || null : state.activePlaylistId
      return { ...state, playlists, live, activePlaylistId }
    }
    case 'SET_ACTIVE':
      return state.playlists.some((p) => p.id === a.id) ? { ...state, activePlaylistId: a.id } : state
    case 'PLAYLIST_ADD': {
      const ids = new Set(state.songs.map((s) => s.id))
      const entries = a.entries.filter((e) => ids.has(e.songId))
      if (!entries.length) return state
      return {
        ...state,
        playlists: state.playlists.map((p) => (p.id === a.playlistId ? { ...p, items: [...p.items, ...entries] } : p)),
      }
    }
    case 'PLAYLIST_REMOVE': {
      const pl = state.playlists.find((p) => p.id === a.playlistId)
      if (!pl || !pl.items[a.index]) return state
      const items = pl.items.filter((_, i) => i !== a.index)
      let live = state.live
      if (live.playlistId === pl.id) {
        const idx = indexAfterRemoval(live.index, a.index)
        live = idx < 0 ? { ...live, playlistId: null, index: -1 } : { ...live, index: idx }
      }
      return { ...state, live, playlists: state.playlists.map((p) => (p.id === pl.id ? { ...p, items } : p)) }
    }
    case 'PLAYLIST_MOVE': {
      const pl = state.playlists.find((p) => p.id === a.playlistId)
      if (!pl) return state
      const items = arrayMove(pl.items, a.from, a.to)
      if (items === pl.items) return state
      const live =
        state.live.playlistId === pl.id ? { ...state.live, index: indexAfterMove(state.live.index, a.from, a.to) } : state.live
      return { ...state, live, playlists: state.playlists.map((p) => (p.id === pl.id ? { ...p, items } : p)) }
    }
    case 'PUSH_LIVE': {
      if (!state.songs.some((s) => s.id === a.songId)) return state
      const pl = state.playlists.find((p) => p.id === a.playlistId)
      const ok = pl && pl.items[a.index]?.songId === a.songId
      return {
        ...state,
        live: { songId: a.songId, playlistId: ok ? pl.id : null, index: ok ? a.index : -1, nonce: state.live.nonce + 1 },
      }
    }
    case 'LIVE_STEP': {
      const t = stepTarget(state, a.dir)
      return t ? { ...state, live: { ...t, nonce: state.live.nonce + 1 } } : state
    }
    case 'CLEAR_LIVE':
      return state.live.songId ? { ...state, live: clearedLive(state) } : state
    case 'LOAD_SAMPLES': {
      const songs = sampleSongs()
      const ids = new Set(songs.map((s) => s.id))
      const pl = samplePlaylist()
      return {
        ...state,
        songs: [...state.songs.filter((s) => !ids.has(s.id)), ...songs],
        playlists: [...state.playlists.filter((p) => p.id !== pl.id), pl],
        activePlaylistId: state.activePlaylistId || pl.id,
      }
    }
    case 'REPLACE_ALL':
      return {
        songs: a.data.songs,
        playlists: a.data.playlists,
        activePlaylistId: a.data.playlists[0]?.id || null,
        types: cleanTypes(a.data.types),
        live: clearedLive(state),
        rev: state.rev,
      }
    case 'MERGE_ALL': {
      const keys = new Map(state.songs.map((s) => [dupKey(s), s.id]))
      const idMap = new Map()
      const songs = [...state.songs]
      const byId = new Set(songs.map((s) => s.id))
      for (const s of a.data.songs) {
        const k = dupKey(s)
        if (byId.has(s.id) || keys.has(k)) {
          idMap.set(s.id, byId.has(s.id) ? s.id : keys.get(k))
          continue
        }
        songs.push(s)
        byId.add(s.id)
        keys.set(k, s.id)
        idMap.set(s.id, s.id)
      }
      const known = new Set(state.playlists.map((p) => p.id))
      const playlists = [...state.playlists]
      for (const p of a.data.playlists) {
        const id = known.has(p.id) ? makeId('p_') : p.id
        playlists.push({
          ...p,
          id,
          items: p.items.filter((it) => idMap.has(it.songId)).map((it) => ({ id: makeId('e_'), songId: idMap.get(it.songId) })),
        })
      }
      const types = cleanTypes([...allTypes(state), ...(a.data.types || [])])
      return { ...state, songs, playlists, types, activePlaylistId: state.activePlaylistId || playlists[0]?.id || null }
    }
    case 'TYPE_ADD': {
      const name = String(a.name || '').trim()
      if (!name || allTypes(state).some((t) => t.toLowerCase() === name.toLowerCase())) return state
      return { ...state, types: [...allTypes(state), name] }
    }
    case 'TYPE_RENAME': {
      const to = String(a.to || '').trim()
      const clash = allTypes(state).some((t) => t.toLowerCase() === to.toLowerCase() && t !== a.from)
      if (!to || to === a.from || clash) return state
      const types = allTypes(state).map((t) => (t === a.from ? to : t))
      const songs = state.songs.map((s) => (s.language === a.from ? { ...s, language: to } : s))
      return { ...state, types, songs }
    }
    case 'TYPE_DELETE': {
      const types = allTypes(state).filter((t) => t !== a.name)
      const songs = state.songs.map((s) => (s.language === a.name ? { ...s, language: '' } : s))
      return { ...state, types, songs }
    }
    case 'CLEAR_ALL':
      return { ...emptyState(), live: clearedLive(state), rev: state.rev }
    default:
      return state
  }
}

export function reducer(state, action) {
  const next = inner(state, action)
  return next === state ? state : { ...next, rev: state.rev + 1 }
}

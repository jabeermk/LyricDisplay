// Pure playlist / live-position helpers.
export function arrayMove(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const next = arr.slice()
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}

/** New live index after item `from` moves to `to` (-1 stays -1). */
export function indexAfterMove(index, from, to) {
  if (index < 0) return index
  if (index === from) return to
  if (from < index && to >= index) return index - 1
  if (from > index && to <= index) return index + 1
  return index
}

/** New live index after item `removed` is removed; -1 if it was the live item. */
export function indexAfterRemoval(index, removed) {
  if (index < 0) return index
  if (index === removed) return -1
  return removed < index ? index - 1 : index
}

export const nextIndex = (len, idx) => (idx + 1 < len ? idx + 1 : null)
export const prevIndex = (idx) => (idx > 0 ? idx - 1 : null)

/** Where is the live song in a chain? Falls back to the active playlist when pushed standalone. */
export function locateLive(state) {
  const { live, playlists, activePlaylistId } = state
  if (!live.songId) return null
  const own = playlists.find((p) => p.id === live.playlistId)
  if (own && live.index >= 0 && own.items[live.index]?.songId === live.songId) {
    return { playlistId: own.id, index: live.index, items: own.items }
  }
  const act = playlists.find((p) => p.id === activePlaylistId)
  if (act) {
    const i = act.items.findIndex((it) => it.songId === live.songId)
    if (i >= 0) return { playlistId: act.id, index: i, items: act.items }
  }
  return null
}

/** Target of next (+1) / prev (-1): {songId, playlistId, index} or null at the ends / no chain. */
export function stepTarget(state, dir) {
  const loc = locateLive(state)
  if (!loc) return null
  const i = dir > 0 ? nextIndex(loc.items.length, loc.index) : prevIndex(loc.index)
  if (i === null) return null
  const item = loc.items[i]
  if (!item || !state.songs.some((s) => s.id === item.songId)) return null
  return { songId: item.songId, playlistId: loc.playlistId, index: i }
}

// Text helpers: folding, search, first-letter groups, sorting, normalisation.
const COMBINING = /[̀-ًͯ-ٰٟ]/g

export const fold = (s) =>
  String(s || '').normalize('NFD').replace(COMBINING, '').normalize('NFC').toLowerCase()

/** Folds a string and keeps a map folded-index -> original-index (UTF-16 units). */
function foldWithMap(s) {
  let out = ''
  const map = []
  let i = 0
  for (const ch of s) {
    const f = fold(ch)
    for (let k = 0; k < f.length; k++) map.push(i)
    out += f
    i += ch.length
  }
  map.push(i)
  return { out, map }
}

export function normalizeLyrics(text) {
  return String(text || '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

export function titleFromFilename(name) {
  return String(name || '')
    .replace(/\.[^.\\/]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const dupKey = (song) =>
  fold(song.title).replace(/\s+/g, ' ').trim() + '|' + fold(normalizeLyrics(song.lyrics)).replace(/\s+/g, ' ').trim()

/** Query -> list of {song, snippet|null, titleMatch}. Empty query returns all songs. */
export function searchSongs(songs, query) {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return songs.map((song) => ({ song, snippet: null, titleMatch: false }))
  const results = []
  for (const song of songs) {
    const title = fold(song.title)
    const body = fold(song.lyrics)
    const meta = fold(`${song.language} ${song.tag}`)
    if (!terms.every((t) => title.includes(t) || body.includes(t) || meta.includes(t))) continue
    const titleMatch = terms.every((t) => title.includes(t))
    let snippet = null
    if (!titleMatch) {
      for (const line of String(song.lyrics).split('\n')) {
        const { out, map } = foldWithMap(line)
        const t = terms.find((x) => out.includes(x))
        if (!t) continue
        const at = out.indexOf(t)
        snippet = { line, start: map[at], end: map[Math.min(at + t.length, map.length - 1)] }
        break
      }
    }
    results.push({ song, snippet, titleMatch })
  }
  return results.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch))
}

export function firstGroup(title) {
  for (const ch of String(title || '').trim()) {
    if (/\p{L}/u.test(ch)) {
      const base = ch.normalize('NFD')[0].toUpperCase()
      return /[A-Z]/.test(base) ? base : ch
    }
    if (/\p{N}/u.test(ch)) return '#'
  }
  return '#'
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const rank = (g) => (/^[A-Z]$/.test(g) ? 0 : g === '#' ? 2 : 1)

export function compareGroups(a, b) {
  return rank(a) - rank(b) || collator.compare(a, b)
}

export function sortSongs(songs) {
  return [...songs].sort(
    (a, b) => compareGroups(firstGroup(a.title), firstGroup(b.title)) || collator.compare(a.title, b.title),
  )
}

/** [{key, songs}] ordered A-Z, other scripts, then '#'. Input order inside a group is preserved. */
export function groupSongs(sorted) {
  const map = new Map()
  for (const s of sorted) {
    const k = firstGroup(s.title)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(s)
  }
  return [...map.keys()].sort(compareGroups).map((key) => ({ key, songs: map.get(key) }))
}

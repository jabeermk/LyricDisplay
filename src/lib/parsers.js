// Text decoding and bulk song parsing.
import { detectLanguage } from './script.js'
import { dupKey, normalizeLyrics } from './text.js'

/** Decode bytes from a .txt file: UTF-8 (with/without BOM), UTF-16 LE/BE (Notepad), else Windows-1252. */
export function decodeText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  // BOM-less UTF-16: many NUL bytes at odd (LE) or even (BE) positions.
  if (bytes.length >= 4) {
    let even = 0
    let odd = 0
    const n = Math.min(bytes.length, 400)
    for (let i = 0; i < n; i++) if (bytes[i] === 0) (i % 2 ? odd++ : even++)
    if (odd > n / 8 && even === 0) return new TextDecoder('utf-16le').decode(bytes)
    if (even > n / 8 && odd === 0) return new TextDecoder('utf-16be').decode(bytes)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const SEPARATOR = /^[ \t]*-{3,}[ \t]*$/
const HEADER = /^[ \t]*(title|type|language|lang|tag|category|pitch|key|tempo)[ \t]*:[ \t]*(.*)$/i
const HEADER_FIELD = {
  title: 'title', type: 'language', language: 'language', lang: 'language', tag: 'tag', category: 'tag',
  pitch: 'pitch', key: 'pitch', tempo: 'pitch',
}

/** Split text on lines holding only `---`. Returns non-empty chunks (arrays of lines). */
export function splitChunks(text) {
  const lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const chunks = [[]]
  for (const line of lines) {
    if (SEPARATOR.test(line)) chunks.push([])
    else chunks[chunks.length - 1].push(line)
  }
  return chunks.filter((c) => c.some((l) => l.trim() !== ''))
}

function parseChunk(lines, fallbackTitle) {
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  const meta = {}
  let sawHeader = false
  while (i < lines.length) {
    const m = HEADER.exec(lines[i])
    if (!m) break
    meta[HEADER_FIELD[m[1].toLowerCase()]] = m[2].trim()
    sawHeader = true
    i++
  }
  if (sawHeader && lines[i] !== undefined && lines[i].trim() === '') i++
  let body = lines.slice(i)
  let title = meta.title
  if (!title) {
    if (fallbackTitle) title = fallbackTitle
    else {
      const first = body.findIndex((l) => l.trim() !== '')
      const nonEmpty = body.filter((l) => l.trim() !== '').length
      if (first >= 0 && nonEmpty > 1) {
        title = body[first].trim()
        body = body.slice(first + 1)
      } else if (first >= 0) title = body[first].trim().slice(0, 60)
    }
  }
  const lyrics = normalizeLyrics(body.join('\n'))
  return {
    title: title || 'Untitled',
    language: meta.language || detectLanguage(lyrics),
    tag: meta.tag || '',
    pitch: meta.pitch || '',
    lyrics,
  }
}

/**
 * Parse bulk text into songs. A single chunk with no Title header takes `fallbackTitle`
 * (e.g. the file name); otherwise a missing title falls back to the first line.
 */
export function parseBulk(text, { fallbackTitle = '' } = {}) {
  const chunks = splitChunks(text)
  return chunks
    .map((c) => parseChunk(c, chunks.length === 1 ? fallbackTitle : ''))
    .filter((s) => s.lyrics !== '' || s.title !== 'Untitled')
}

/**
 * Marks duplicates (same title + lyrics) against existing songs and earlier batch items.
 * Returns items with `dup: boolean`.
 */
export function markDuplicates(existing, items) {
  const seen = new Set(existing.map(dupKey))
  return items.map((it) => {
    const k = dupKey(it)
    const dup = seen.has(k)
    seen.add(k)
    return { ...it, dup }
  })
}

import { describe, expect, it } from 'vitest'
import { decodeText, markDuplicates, parseBulk } from './parsers.js'
import { reducer, A } from './reducer.js'
import { emptyState, newSong } from './model.js'
import { indexAfterMove, indexAfterRemoval, stepTarget } from './playlist.js'
import { detectLanguage, lineLang } from './script.js'
import { firstGroup, groupSongs, searchSongs, sortSongs } from './text.js'
import { makeId } from './ids.js'
import { migrate, validateBackup, exportBackup } from './storage.js'

const mk = (title, lyrics = 'la la') => newSong({ title, lyrics, language: 'English' })
function build() {
  let s = emptyState()
  const songs = ['A', 'B', 'C'].map((t) => mk(t, `line ${t}`))
  s = reducer(s, { type: 'ADD_SONGS', songs })
  s = reducer(s, A.createPlaylist('Set'))
  const pid = s.playlists[0].id
  s = reducer(s, A.playlistAdd(pid, songs.map((x) => x.id)))
  return { s, pid, ids: songs.map((x) => x.id) }
}

describe('parseBulk', () => {
  it('splits on --- and reads headers', () => {
    const r = parseBulk('Title: One\nLanguage: Hindi\nTag: Fast\nPitch: C\n\nla\nla\n---\nTitle: Two\nhey')
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ title: 'One', language: 'Hindi', tag: 'Fast', pitch: 'C', lyrics: 'la\nla' })
    expect(r[1].title).toBe('Two')
  })
  it('single file without separators uses filename', () => {
    const r = parseBulk('line one\nline two', { fallbackTitle: 'My Song' })
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('My Song')
    expect(r[0].lyrics).toBe('line one\nline two')
  })
  it('missing title in multi-song text uses first line', () => {
    const r = parseBulk('First\nbody1\n---\nSecond\nbody2')
    expect(r.map((x) => x.title)).toEqual(['First', 'Second'])
  })
  it('detects language and skips empty chunks', () => {
    const r = parseBulk('---\n\n---\nTitle: X\nരഘുപതി')
    expect(r).toHaveLength(1)
    expect(r[0].language).toBe('Malayalam')
  })
  it('flags duplicates', () => {
    const ex = [mk('A', 'x')]
    const r = markDuplicates(ex, [{ title: 'a', lyrics: 'x' }, { title: 'B', lyrics: 'y' }, { title: 'B', lyrics: 'y' }])
    expect(r.map((x) => x.dup)).toEqual([true, false, true])
  })
})

describe('decodeText', () => {
  it('utf-8 with BOM', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]))).toBe('hi')
  })
  it('utf-16le with BOM (Notepad)', () => {
    const b = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00, 0x15, 0x0d])
    expect(decodeText(b)).toBe('hiക')
  })
  it('utf-16be with BOM', () => {
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]))).toBe('hi')
  })
  it('plain utf-8 malayalam', () => {
    expect(decodeText(new TextEncoder().encode('അ'))).toBe('അ')
  })
})

describe('script', () => {
  it('detects scripts', () => {
    expect(detectLanguage('hello world')).toBe('English')
    expect(detectLanguage('സ്വർഗ്ഗസ്ഥനായ')).toBe('Malayalam')
    expect(detectLanguage('रघुपति राघव')).toBe('Hindi')
    expect(detectLanguage('بِسْمِ اللَّهِ')).toBe('Arabic')
    expect(detectLanguage('1234 ...')).toBe('')
  })
  it('line lang', () => {
    expect(lineLang('hello', 'Malayalam')).toBe('ml-Latn')
    expect(lineLang('അ', 'English')).toBe('ml')
  })
})

describe('text', () => {
  it('first groups and ordering', () => {
    expect(firstGroup("'Tis grace")).toBe('T')
    expect(firstGroup('Élan')).toBe('E')
    expect(firstGroup('1 2 3')).toBe('#')
    expect(firstGroup('അങ്ങ്')).toBe('അ')
    const g = groupSongs(sortSongs([mk('9 lives'), mk('അമ്മ'), mk('Beta'), mk('Alpha')]))
    expect(g.map((x) => x.key)).toEqual(['A', 'B', 'അ', '#'])
  })
  it('search matches title and lyrics with snippet', () => {
    const songs = [mk('Grace', 'x'), mk('Other', 'first\nsweet sound here')]
    const r = searchSongs(songs, 'sweet')
    expect(r).toHaveLength(1)
    expect(r[0].snippet.line).toBe('sweet sound here')
    expect(searchSongs(songs, 'grace')[0].titleMatch).toBe(true)
  })
  it('search folds arabic diacritics', () => {
    const r = searchSongs([mk('f', 'الرَّحْمَٰنِ')], 'الرحمن')
    expect(r).toHaveLength(1)
  })
})

describe('ids', () => {
  it('works without crypto.randomUUID', () => {
    const orig = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    const a = makeId('x_')
    const b = makeId('x_')
    Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true })
    expect(a).not.toBe(b)
    expect(a.startsWith('x_')).toBe(true)
  })
})

describe('playlist index math', () => {
  it('move', () => {
    expect(indexAfterMove(1, 1, 3)).toBe(3)
    expect(indexAfterMove(2, 0, 3)).toBe(1)
    expect(indexAfterMove(2, 3, 0)).toBe(3)
    expect(indexAfterMove(0, 2, 3)).toBe(0)
  })
  it('remove', () => {
    expect(indexAfterRemoval(2, 2)).toBe(-1)
    expect(indexAfterRemoval(2, 0)).toBe(1)
    expect(indexAfterRemoval(2, 3)).toBe(2)
  })
})

describe('reducer + next/prev', () => {
  it('chains next/prev and stops at the ends', () => {
    let { s, pid, ids } = build()
    s = reducer(s, A.pushLive(ids[0], pid, 0))
    expect(stepTarget(s, -1)).toBeNull()
    s = reducer(s, A.step(1))
    expect(s.live).toMatchObject({ songId: ids[1], index: 1 })
    s = reducer(s, A.step(1))
    s = reducer(s, A.step(1))
    expect(s.live.songId).toBe(ids[2])
    s = reducer(s, A.step(-1))
    expect(s.live.songId).toBe(ids[1])
  })
  it('standalone push uses active playlist for chain', () => {
    let { s, ids } = build()
    s = reducer(s, A.pushLive(ids[1]))
    expect(s.live.playlistId).toBeNull()
    s = reducer(s, A.step(1))
    expect(s.live.songId).toBe(ids[2])
    expect(s.live.index).toBe(2)
  })
  it('same song twice allowed; nonce and rev increase', () => {
    let { s, pid, ids } = build()
    const rev = s.rev
    s = reducer(s, A.playlistAdd(pid, [ids[0]]))
    expect(s.playlists[0].items).toHaveLength(4)
    expect(s.rev).toBe(rev + 1)
    const n = s.live.nonce
    s = reducer(s, A.pushLive(ids[0], pid, 3))
    expect(s.live.nonce).toBe(n + 1)
    expect(s.live.index).toBe(3)
  })
  it('live index follows move and remove', () => {
    let { s, pid, ids } = build()
    s = reducer(s, A.pushLive(ids[1], pid, 1))
    s = reducer(s, A.playlistMove(pid, 0, 2))
    expect(s.live.index).toBe(0)
    expect(s.playlists[0].items[0].songId).toBe(ids[1])
    s = reducer(s, A.playlistRemove(pid, 2))
    expect(s.live.index).toBe(0)
    s = reducer(s, A.playlistRemove(pid, 0))
    expect(s.live).toMatchObject({ playlistId: null, index: -1, songId: ids[1] })
  })
  it('deleting songs fixes live index and clears live song', () => {
    let { s, pid, ids } = build()
    s = reducer(s, A.pushLive(ids[2], pid, 2))
    s = reducer(s, A.deleteSong(ids[0]))
    expect(s.live.index).toBe(1)
    expect(s.playlists[0].items).toHaveLength(2)
    s = reducer(s, A.deleteSong(ids[2]))
    expect(s.live).toMatchObject({ songId: null, playlistId: null, index: -1 })
  })
  it('deleting playlist detaches live', () => {
    let { s, pid, ids } = build()
    s = reducer(s, A.pushLive(ids[1], pid, 1))
    s = reducer(s, A.deletePlaylist(pid))
    expect(s.live).toMatchObject({ songId: ids[1], playlistId: null, index: -1 })
    expect(s.activePlaylistId).toBeNull()
  })
  it('samples load idempotently with deterministic ids', () => {
    let s = reducer(emptyState(), A.loadSamples())
    const again = reducer(s, A.loadSamples())
    expect(again.songs).toHaveLength(4)
    expect(again.playlists).toHaveLength(1)
    expect(s.songs.map((x) => x.id)).toContain('sample-al-fatiha')
  })
})

describe('storage / backup', () => {
  it('migrates v0 and rejects newer', () => {
    expect(migrate({ state: {} }).schema).toBe(1)
    expect(migrate({ schema: 99 })).toBeNull()
  })
  it('round-trips a backup and rejects bad files', () => {
    const { s } = build()
    const v = validateBackup(JSON.parse(JSON.stringify(exportBackup(s))))
    expect(v.ok).toBe(true)
    expect(v.data.songs).toHaveLength(3)
    expect(v.data.playlists[0].items).toHaveLength(3)
    expect(validateBackup({ songs: [] }).ok).toBe(false)
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup({ app: 'stagelyrics', schema: 1, songs: 'x', playlists: [] }).ok).toBe(false)
  })
  it('merge skips duplicates and remaps playlists; replace swaps', () => {
    const { s, ids } = build()
    const v = validateBackup(JSON.parse(JSON.stringify(exportBackup(s)))).data
    const merged = reducer(s, A.mergeAll(v))
    expect(merged.songs).toHaveLength(3)
    expect(merged.playlists).toHaveLength(2)
    expect(merged.playlists[1].items.map((i) => i.songId)).toEqual(ids)
    const r = reducer(merged, A.replaceAll(v))
    expect(r.playlists).toHaveLength(1)
    expect(r.live.songId).toBeNull()
  })
})

describe('types', () => {
  it('add, rename, delete', () => {
    let { s, ids } = build()
    s = reducer(s, A.typeAdd('Fast'))
    s = reducer(s, A.typeAdd('fast'))
    expect(s.types.filter((t) => t.toLowerCase() === 'fast')).toHaveLength(1)
    s = reducer(s, A.typeRename('English', 'Eng'))
    expect(s.songs.every((x) => x.language === 'Eng')).toBe(true)
    s = reducer(s, A.typeDelete('Eng'))
    expect(s.songs.every((x) => x.language === '')).toBe(true)
    expect(s.types).toEqual(['Fast'])
    expect(ids).toHaveLength(3)
  })
  it('types survive backup', () => {
    let { s } = build()
    s = reducer(s, A.typeAdd('Choir'))
    const v = validateBackup(JSON.parse(JSON.stringify(exportBackup(s))))
    expect(v.data.types).toContain('Choir')
  })
})

import { itemsToText, analyzeExtraction } from './pdf.js'
describe('pdf text rebuild', () => {
  const tok = (str, x, y, w = str.length * 6) => ({ str, transform: [12, 0, 0, 12, x, y], width: w, height: 12 })
  it('joins items on a line, orders by y, adds stanza breaks', () => {
    const text = itemsToText([
      tok('line', 10, 700), tok('two', 50, 700),
      tok('Hello', 10, 716),
      tok('after gap', 10, 640),
      tok('next', 10, 624),
    ])
    expect(text).toBe('Hello\nline two\n\nafter gap\nnext')
  })
  it('reverses word order for RTL lines', () => {
    expect(itemsToText([tok('\u0645\u0631\u062d\u0628\u0627', 100, 700, 30), tok('\u0628\u0643\u0645', 10, 700, 20)])).toBe('\u0645\u0631\u062d\u0628\u0627 \u0628\u0643\u0645')
  })
  it('warns on empty and garbled', () => {
    expect(analyzeExtraction('  ')).toEqual(['empty'])
    expect(analyzeExtraction('abc (cid:12)(cid:13) \uFFFD\uFFFD\uFFFD def ghi')).toEqual(['garbled'])
    expect(analyzeExtraction('Amazing grace how sweet')).toEqual([])
  })
})

import { seedState } from './storage.js'
describe('seed file', () => {
  it('shipped songs.json is a valid backup', () => {
    const s = seedState()
    expect(Array.isArray(s.songs)).toBe(true)
    expect(s.live.songId).toBeNull()
  })
})

describe('remote sync', () => {
  it('applies newer rev only', () => {
    const { s } = build()
    const newer = { ...s, rev: s.rev + 3, live: { ...s.live, songId: s.songs[1].id } }
    expect(reducer(s, { type: 'REMOTE', state: newer }).live.songId).toBe(s.songs[1].id)
    expect(reducer(s, { type: 'REMOTE', state: { ...newer, rev: s.rev } })).toBe(s)
  })
})

describe('cloud apply', () => {
  it('replaces library, keeps live when song still exists, clears otherwise', () => {
    let { s, pid, ids } = build()
    s = reducer(s, A.pushLive(ids[1], pid, 1))
    const lib = { songs: s.songs.filter((x) => x.id !== ids[2]), playlists: s.playlists, types: ['Fast'] }
    let n = reducer(s, { type: 'CLOUD_APPLY', lib })
    expect(n.songs).toHaveLength(2)
    expect(n.live.songId).toBe(ids[1])
    expect(n.playlists[0].items).toHaveLength(2)
    expect(n.types).toContain('Fast')
    n = reducer(n, { type: 'CLOUD_APPLY', lib: { songs: [], playlists: [], types: [] } })
    expect(n.live.songId).toBeNull()
  })
})

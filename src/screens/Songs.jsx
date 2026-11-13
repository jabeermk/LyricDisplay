import { useEffect, useMemo, useRef, useState } from 'react'
import { pdfIds } from '../lib/pdfstore.js'
import { Badge, Icon } from '../ui.jsx'
import { go, haptic, useApp } from '../state.jsx'
import { A } from '../lib/reducer.js'
import { groupSongs, searchSongs, sortSongs } from '../lib/text.js'
import { playNow } from '../Sheets.jsx'

function Snippet({ s }) {
  const { line, start, end } = s
  return (
    <div className="snippet" dir="auto">
      {line.slice(0, start)}<mark>{line.slice(start, end)}</mark>{line.slice(end)}
    </div>
  )
}

export default function Songs() {
  const app = useApp()
  const { state, openSheet, prefs, setPref, cloud } = app
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('')
  const [tag, setTag] = useState('')
  const [pdfs, setPdfs] = useState(() => new Set())
  const { sheet } = app
  const scrollRef = useRef(null)
  const stickyRef = useRef(null)
  const [stickyH, setStickyH] = useState(0)
  useEffect(() => { pdfIds().then(setPdfs) }, [state.songs, sheet])

  const langs = useMemo(() => countBy(state.songs, 'language'), [state.songs])
  const tags = useMemo(() => countBy(state.songs, 'tag'), [state.songs])

  const results = useMemo(() => {
    const base = state.songs.filter((s) => (!lang || s.language === lang) && (!tag || s.tag === tag))
    const found = searchSongs(sortSongs(base), q)
    return found
  }, [state.songs, q, lang, tag])

  const sections = useMemo(() => (q.trim() ? null : groupSongs(results.map((r) => r.song))), [results, q])

  // Keep section headers below the sticky search block.
  useEffect(() => {
    const el = stickyRef.current
    if (!el) return setStickyH(0)
    setStickyH(el.offsetHeight)
    const ro = new ResizeObserver(() => setStickyH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state.songs.length > 0, langs.length > 0, tags.length > 0]) // eslint-disable-line

  const jump = (key) => {
    const box = scrollRef.current
    const el = box?.querySelector('[data-sec="' + CSS.escape(key) + '"]')?.parentElement // the section, not the sticky header
    if (!box || !el) return
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - stickyH
  }

  const row = (song, snippet) => (
    <li key={song.id} className="song">
      <button className="song-main" onClick={() => openSheet({ type: 'song', id: song.id })}>
        <span className="title" dir="auto">{song.title}</span>
        <span className="meta">
          <Badge lang={song.language} />
          {song.tag && <span className="tag">{song.tag}</span>}
          {song.pitch && <span className="pitch">♪ {song.pitch}</span>}
          {state.live.songId === song.id && <span className="live-badge">LIVE</span>}
        </span>
        {snippet && <Snippet s={snippet} />}
      </button>
      <div className="row-actions">
        <button className="pill" aria-label={`Open lyrics of ${song.title}`} onClick={() => go(`view/${encodeURIComponent(song.id)}/text`)}>Lyrics</button>
        {pdfs.has(song.id) && <button className="pill" aria-label={`Open PDF of ${song.title}`} onClick={() => go(`view/${encodeURIComponent(song.id)}/pdf`)}>PDF</button>}
        <button className="pill live" aria-label={`Push ${song.title} to live`} onClick={() => playNow(app, song.id)}>Live</button>
      </div>
    </li>
  )

  return (
    <div className="screen">
      <div className={'scroll' + (sections && sections.length > 1 ? ' has-az' : '')} ref={scrollRef} style={{ '--sticky-h': stickyH + 'px' }}>
        <header className="large"><h1>Songs</h1>
          <button className="icon-btn" aria-label={prefs.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setPref('theme', (t) => (t === 'dark' ? 'light' : 'dark'))}><Icon n={prefs.theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="icon-btn" aria-label="Add song" onClick={() => openSheet({ type: 'add' })}><Icon n="plus" /></button>
        </header>
        {cloud.active && !cloud.canWrite && <p className="hint ro-banner">Read-only · songs come from the shared library. Editors: More → Sync → edit key.</p>}
        {state.songs.length > 0 && (
          <div className="sticky" ref={stickyRef}>
            <div className="searchbox">
              <Icon n="search" size={18} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or lyrics" aria-label="Search songs" />
              {q && <button className="icon-btn sm" aria-label="Clear search" onClick={() => setQ('')}><Icon n="x" size={16} /></button>}
            </div>
            {langs.length > 0 && <Chips items={langs} value={lang} onChange={setLang} label="Type" />}
            {tags.length > 0 && <Chips items={tags} value={tag} onChange={setTag} label="Tag" />}
          </div>
        )}

        {state.songs.length === 0 ? (
          <div className="empty">
            <Icon n="music" size={44} />
            <h2>No songs yet</h2>
            <p>Add your lyrics, or try the samples.</p>
            <button className="btn primary" onClick={() => openSheet({ type: 'add' })}>Add song</button>
            <button className="btn" onClick={() => { app.dispatch(A.loadSamples()); app.toast('Samples loaded. Please verify the Malayalam text.') }}>Load sample songs</button>
          </div>
        ) : results.length === 0 ? (
          <div className="empty"><p>No songs match.</p></div>
        ) : (
          <>
            {q.trim() || lang || tag ? (
              <div className="count">{results.length} song{results.length === 1 ? '' : 's'}</div>
            ) : null}
            {sections ? (
              sections.map((g) => (
                <section key={g.key}>
                  <h3 className="sec" data-sec={g.key}>{g.key}</h3>
                  <ul className="plain">{g.songs.map((s) => row(s))}</ul>
                </section>
              ))
            ) : (
              <ul className="plain">{results.map((r) => row(r.song, r.snippet))}</ul>
            )}
          </>
        )}
        <div className="pad-bottom" />
      </div>
      {sections && sections.length > 1 && <AZRail keys={sections.map((g) => g.key)} onJump={jump} />}
      {state.songs.length > 0 && (
        <button className="fab" aria-label="Add song" onClick={() => { haptic(10); openSheet({ type: 'add' }) }}><Icon n="plus" size={26} /></button>
      )}
    </div>
  )
}

function countBy(songs, key) {
  const m = new Map()
  for (const s of songs) if (s[key]) m.set(s[key], (m.get(s[key]) || 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

function Chips({ items, value, onChange, label, extra }) {
  return (
    <div className="chips" role="group" aria-label={`Filter by ${label}`}>
      <button className={'chip' + (!value ? ' on' : '')} onClick={() => onChange('')}>All</button>
      {items.map(([name, n]) => (
        <button key={name} className={'chip' + (value === name ? ' on' : '')} aria-pressed={value === name} onClick={() => onChange(value === name ? '' : name)}>
          {name} <small>{n}</small>
        </button>
      ))}
      {extra}
    </div>
  )
}

/** Index rail: only letters that have songs. Tap or drag to jump. */
function AZRail({ keys, onJump }) {
  const [active, setActive] = useState(null)
  const ref = useRef(null)
  const last = useRef(null)
  const at = (e) => {
    const rect = ref.current.getBoundingClientRect()
    const i = Math.min(keys.length - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * keys.length)))
    const k = keys[i]
    setActive(k)
    if (k !== last.current) {
      last.current = k
      haptic(6)
      onJump(k)
    }
  }
  const end = () => { setActive(null); last.current = null }
  return (
    <div className="az" ref={ref} aria-hidden="true"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e) }}
      onPointerMove={(e) => e.buttons && at(e)} onPointerUp={end} onPointerCancel={end}>
      {keys.map((k) => <span key={k} className={k === active ? 'on' : ''}>{k}</span>)}
      {active && <div className="az-bubble">{active}</div>}
    </div>
  )
}

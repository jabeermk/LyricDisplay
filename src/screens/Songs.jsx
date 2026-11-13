import { useEffect, useMemo, useState } from 'react'
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
  const { state, openSheet, prefs, setPref } = app
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('')
  const [tag, setTag] = useState('')
  const [pdfs, setPdfs] = useState(() => new Set())
  const { sheet } = app
  useEffect(() => { pdfIds().then(setPdfs) }, [state.songs, sheet])

  const langs = useMemo(() => countBy(state.songs, 'language'), [state.songs])
  const tags = useMemo(() => countBy(state.songs, 'tag'), [state.songs])

  const results = useMemo(() => {
    const base = state.songs.filter((s) => (!lang || s.language === lang) && (!tag || s.tag === tag))
    const found = searchSongs(sortSongs(base), q)
    return found
  }, [state.songs, q, lang, tag])

  const sections = useMemo(() => (q.trim() ? null : groupSongs(results.map((r) => r.song))), [results, q])

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
      <div className="scroll">
        <header className="large"><h1>Songs</h1>
          <button className="icon-btn" aria-label={prefs.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setPref('theme', (t) => (t === 'dark' ? 'light' : 'dark'))}><Icon n={prefs.theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="icon-btn" aria-label="Add song" onClick={() => openSheet({ type: 'add' })}><Icon n="plus" /></button>
        </header>
        {state.songs.length > 0 && (
          <div className="sticky">
            <div className="searchbox">
              <Icon n="search" size={18} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or lyrics" aria-label="Search songs" />
              {q && <button className="icon-btn sm" aria-label="Clear search" onClick={() => setQ('')}><Icon n="x" size={16} /></button>}
            </div>
            {(langs.length > 0 || true) && <Chips items={langs} value={lang} onChange={setLang} label="Type" extra={<button className="chip manage" onClick={() => openSheet({ type: 'types' })}>Manage types</button>} />}
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
                  <h3 className="sec" id={'sec-' + g.key}>{g.key}</h3>
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

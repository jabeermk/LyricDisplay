// All bottom sheets, rendered from app.sheet.
import { useMemo, useState } from 'react'
import { Badge, Icon, Lyrics, Sheet } from './ui.jsx'
import { PIN, go, haptic, useApp } from './state.jsx'
import { A } from './lib/reducer.js'
import { decodeText, markDuplicates, parseBulk } from './lib/parsers.js'
import { detectLanguage, TAG_SUGGESTIONS } from './lib/script.js'
import { allTypes } from './lib/model.js'
import { dupKey, searchSongs, titleFromFilename } from './lib/text.js'
import { makeId } from './lib/ids.js'
import { deletePdf, putPdf } from './lib/pdfstore.js'
import { PdfView } from './screens/Perform.jsx'
import { WARNING_TEXT, extractPdf } from './lib/pdf.js' // pdfjs-dist itself loads lazily inside extractPdf

export function playNow(app, songId, playlistId = null, index = -1) {
  app.dispatch(A.pushLive(songId, playlistId, index))
  haptic(20)
  app.closeSheet()
  go('live')
}

function SongForm({ draft, setDraft, onSubmit, label, extra }) {
  const { state } = useApp()
  const types = allTypes(state)
  const [langTouched, setLangTouched] = useState(!!draft.language)
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const onLyrics = (v) =>
    setDraft((d) => ({ ...d, lyrics: v, language: langTouched ? d.language : detectLanguage(v) }))
  const ok = draft.title.trim() && draft.lyrics.trim()
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit() }}>
      <label>Title
        <input value={draft.title} onChange={(e) => set('title', e.target.value)} required autoComplete="off" />
      </label>
      <div className="row2">
        <label>Type
          <select value={draft.language} onChange={(e) => { setLangTouched(true); set('language', e.target.value) }}>
            <option value="">Auto-detect</option>
            {draft.language && !types.includes(draft.language) && <option value={draft.language}>{draft.language}</option>}
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Pitch / tempo (optional)
          <input value={draft.pitch} onChange={(e) => set('pitch', e.target.value)} placeholder="e.g. D, slow" autoComplete="off" />
        </label>
      </div>
      <label>Tag
        <input value={draft.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Melody, Fast, Medley…" autoComplete="off" />
      </label>
      <div className="chips wrap">
        {TAG_SUGGESTIONS.map((t) => (
          <button type="button" key={t} className={'chip' + (draft.tag === t ? ' on' : '')} onClick={() => set('tag', draft.tag === t ? '' : t)}>{t}</button>
        ))}
      </div>
      <label>Lyrics
        <textarea className="lyr-input" rows={10} value={draft.lyrics} onChange={(e) => onLyrics(e.target.value)} required dir="auto" />
      </label>
      {extra}
      <button className="btn primary block" disabled={!ok}>{label}</button>
    </form>
  )
}

const BLANK = { title: '', language: '', tag: '', pitch: '', lyrics: '' }

function AddSheet({ app, initialTab }) {
  const { state, dispatch, toast, closeSheet } = app
  const [tab, setTab] = useState(initialTab || 'paste')
  const [draft, setDraft] = useState(BLANK)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [off, setOff] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [pdfNotes, setPdfNotes] = useState([]) // [{name, warnings, error}]
  const [notice, setNotice] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [keepPdf, setKeepPdf] = useState(true)

  const items = useMemo(() => markDuplicates(state.songs, [...files, ...parseBulk(text)]), [state.songs, files, text])
  const fresh = items.filter((i) => !i.dup && !off.has(dupKey(i)))
  const dups = items.filter((i) => i.dup).length

  const savePaste = (again) => {
    const key = dupKey(draft)
    if (state.songs.some((s) => dupKey(s) === key)) return toast('This song already exists.', 'error')
    const id = makeId('s_')
    dispatch(A.addSongs([{ ...draft, id, language: draft.language || detectLanguage(draft.lyrics) }]))
    if (pdfFile && keepPdf) putPdf(id, pdfFile).catch(() => toast('Could not keep the PDF on this device.', 'error'))
    toast(`Saved "${draft.title.trim()}"`)
    haptic(15)
    if (again) { setDraft(BLANK); setPdfFile(null); setNotice('') }
    else closeSheet()
  }

  const readFiles = async (list) => {
    const out = []
    for (const f of list) {
      try {
        const buf = await f.arrayBuffer()
        out.push(...parseBulk(decodeText(buf), { fallbackTitle: titleFromFilename(f.name) }))
      } catch {
        toast(`Could not read ${f.name}`, 'error')
      }
    }
    setFiles((p) => [...p, ...out])
  }

  const readPdfs = async (list) => {
    setBusy(true)
    setPdfNotes([])
    const results = []
    const notes = []
    try {
      for (const f of list) {
        try {
          const r = await extractPdf(f)
          results.push({ ...r, file: f })
          notes.push({ name: f.name, warnings: r.warnings })
        } catch {
          notes.push({ name: f.name, error: 'Could not read this PDF (damaged or password protected).' })
        }
      }
    } catch {
      notes.push({ name: 'PDF reader', error: 'Could not load the PDF reader. Check your connection once, or use paste / .txt.' })
    }
    setBusy(false)
    setPdfNotes(notes)
    if (results.length === 1 && list.length === 1) {
      const r = results[0]
      setPdfFile(r.file)
      setDraft({ title: r.title, language: r.language, tag: '', pitch: '', lyrics: r.lyrics })
      setNotice(r.warnings.map((w) => WARNING_TEXT[w]).join(' ') || 'Text extracted from PDF. Please review before saving.')
      setTab('paste')
    } else if (results.length) {
      setFiles((p) => [...p, ...results.filter((r) => !r.warnings.includes('empty')).map(({ title, language, tag, pitch, lyrics, file }) => ({ title, language, tag, pitch, lyrics, pdf: file }))])
      setTab('bulk')
      const skipped = results.filter((r) => r.warnings.includes('empty')).length
      if (skipped) toast(`${skipped} PDF(s) had no text (scanned) and were skipped.`, 'error')
    }
  }

  const doImport = () => {
    if (!fresh.length) return
    const withIds = fresh.map((it) => ({ ...it, id: makeId('s_') }))
    dispatch(A.addSongs(withIds))
    if (keepPdf) withIds.forEach((it) => it.pdf && putPdf(it.id, it.pdf).catch(() => {}))
    toast(`Imported ${fresh.length} song${fresh.length > 1 ? 's' : ''}` + (dups ? `, skipped ${dups} duplicate${dups > 1 ? 's' : ''}` : ''))
    closeSheet()
  }

  return (
    <Sheet title="Add song" onClose={closeSheet}>
      <div className="tabs" role="tablist">
        {[['pdf', 'PDF'], ['paste', 'Type / paste'], ['bulk', 'Import .txt']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'pdf' ? (
        <div className="form">
          <label className="check keep">
            <input type="checkbox" checked={keepPdf} onChange={(e) => setKeepPdf(e.target.checked)} />
            <span>Keep the original PDF so I can switch Text / PDF on stage</span>
          </label>
          <label className="btn primary block file">
            <Icon n="upload" size={18} /> {busy ? 'Reading PDF…' : 'Choose PDF file(s)'}
            <input type="file" accept=".pdf,application/pdf" multiple hidden disabled={busy} onChange={(e) => { readPdfs([...e.target.files]); e.target.value = '' }} />
          </label>
          <p className="hint">One PDF opens in the editor so you can check it. Several PDFs go to the batch preview. The title comes from the file name.</p>
          <p className="hint warn">Indic-language PDFs (especially Malayalam) often extract as garbled text because of font encoding. Always check the preview. If it looks wrong, copy the text and paste it, or save as .txt. Scanned PDFs have no text.</p>
          <ul className="plain">
            {pdfNotes.map((n, i) => (
              <li key={i} className="hint pad">
                <strong>{n.name}</strong>: {n.error || (n.warnings.length ? n.warnings.map((w) => WARNING_TEXT[w]).join(' ') : 'OK')}
              </li>
            ))}
          </ul>
        </div>
      ) : tab === 'paste' ? (
        <>
        {notice && <p className="hint warn" role="status">{notice}</p>}
        <SongForm draft={draft} setDraft={setDraft} label="Save song" onSubmit={() => savePaste(false)}
          extra={<button type="button" className="btn block" disabled={!draft.title.trim() || !draft.lyrics.trim()} onClick={() => savePaste(true)}>Save and add another</button>} />
        </>
      ) : (
        <div className="form">
          <p className="hint">Pick one or more .txt files (UTF-8 or Notepad UTF-16), or paste text. Separate songs with a line containing only <code>---</code>. Optional header lines: <code>Title:</code> <code>Type:</code> <code>Tag:</code> <code>Pitch:</code></p>
          <label className="btn block file">
            <Icon n="upload" size={18} /> Choose .txt files
            <input type="file" accept=".txt,text/plain" multiple hidden onChange={(e) => { readFiles([...e.target.files]); e.target.value = '' }} />
          </label>
          <textarea className="lyr-input" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Title: Song one\nType: Hindi\n\nlyrics…\n---\nTitle: Song two\n…'} aria-label="Songs text" dir="auto" />
          <div className="found" aria-live="polite">
            <strong>{items.length} song{items.length === 1 ? '' : 's'} found</strong>
            {dups > 0 && <span> · {dups} duplicate{dups > 1 ? 's' : ''} will be skipped</span>}
            {files.length > 0 && <button type="button" className="link" onClick={() => setFiles([])}>clear files</button>}
          </div>
          <ul className="preview">
            {items.map((it, i) => {
              const k = dupKey(it)
              const on = !it.dup && !off.has(k)
              return (
                <li key={i} className={it.dup ? 'dup' : ''}>
                  <label className="check">
                    <input type="checkbox" checked={on} disabled={it.dup}
                      onChange={() => setOff((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })} />
                    <span className="grow">{it.title}</span>
                  </label>
                  <Badge lang={it.language} />
                  <small>{it.lyrics.split('\n').filter(Boolean).length} lines{it.dup ? ' · duplicate' : ''}</small>
                </li>
              )
            })}
          </ul>
          <button className="btn primary block" disabled={!fresh.length} onClick={doImport}>
            Import {fresh.length} song{fresh.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

function EditSheet({ app, id }) {
  const song = app.state.songs.find((s) => s.id === id)
  const [draft, setDraft] = useState(() => (song ? { title: song.title, language: song.language, tag: song.tag, pitch: song.pitch, lyrics: song.lyrics } : BLANK))
  if (!song) return null
  return (
    <Sheet title="Edit song" onClose={app.closeSheet}>
      <SongForm draft={draft} setDraft={setDraft} label="Save changes"
        onSubmit={() => { app.dispatch(A.updateSong(id, { ...draft, title: draft.title.trim() })); app.toast('Saved'); app.closeSheet() }} />
    </Sheet>
  )
}

function SongSheet({ app, id }) {
  const { state } = app
  const song = state.songs.find((s) => s.id === id)
  if (!song) return null
  const live = state.live.songId === id
  return (
    <Sheet title={song.title} onClose={app.closeSheet}
      footer={
        <div className="actions">
          <button className="btn primary grow" onClick={() => playNow(app, id)}><Icon n="play" size={18} fill /> {live ? 'Open live' : 'Push to Live'}</button>
          <button className="btn" onClick={() => app.openSheet({ type: 'addTo', songIds: [id] })}><Icon n="list" size={18} /> Setlist</button>
          <button className="btn" onClick={() => app.openSheet({ type: 'edit', id })}><Icon n="edit" size={18} /> Edit</button>
          <button className="btn danger" aria-label="Delete" onClick={() => app.openSheet({ type: 'pin', title: 'Delete song?', message: `"${song.title}" will be removed from all setlists. This cannot be undone. Enter the password to delete.`, label: 'Delete', onOk: () => { app.dispatch(A.deleteSong(id)); deletePdf(id); app.toast('Song deleted') } })}><Icon n="trash" size={18} /></button>
        </div>
      }>
      <div className="meta">
        <Badge lang={song.language} />
        {song.tag && <span className="tag">{song.tag}</span>}
        {song.pitch && <span className="pitch">♪ {song.pitch}</span>}
        {live && <span className="live-badge">LIVE</span>}
      </div>
      {song.sample && song.language === 'Malayalam' && <p className="hint warn">Sample text. Please verify the Malayalam before performing.</p>}
      <div className="preview-lyrics"><Lyrics song={song} /></div>
    </Sheet>
  )
}

function PdfSheet({ app, id }) {
  const song = app.state.songs.find((s) => s.id === id)
  if (!song) return null
  return (
    <Sheet title={song.title} onClose={app.closeSheet}
      footer={<button className="btn primary block" onClick={() => playNow(app, id)}><Icon n="play" size={18} fill /> Live</button>}>
      <PdfView songId={id} dark={false} zoom={1} />
    </Sheet>
  )
}

function AddToSheet({ app, songIds }) {
  const { state, dispatch, toast, closeSheet } = app
  const [name, setName] = useState('')
  const add = (pid, pname) => {
    dispatch(A.playlistAdd(pid, songIds))
    toast(`Added to ${pname}`)
    closeSheet()
  }
  const create = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const a = A.createPlaylist(name)
    dispatch(a)
    dispatch(A.playlistAdd(a.playlist.id, songIds))
    toast(`Added to ${a.playlist.name}`)
    closeSheet()
  }
  return (
    <Sheet title={songIds.length > 1 ? `Add ${songIds.length} songs to setlist` : 'Add to setlist'} onClose={closeSheet}>
      <ul className="plain">
        {state.playlists.map((p) => (
          <li key={p.id}><button className="row-btn" onClick={() => add(p.id, p.name)}><span className="grow">{p.name}</span><small>{p.items.length} songs</small></button></li>
        ))}
      </ul>
      <form className="form inline" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New setlist name" aria-label="New setlist name" />
        <button className="btn primary" disabled={!name.trim()}>Create</button>
      </form>
    </Sheet>
  )
}

function PickSheet({ app, playlistId }) {
  const { state, dispatch, closeSheet } = app
  const [q, setQ] = useState('')
  const pl = state.playlists.find((p) => p.id === playlistId)
  const list = useMemo(() => searchSongs(state.songs, q).map((r) => r.song), [state.songs, q])
  if (!pl) return null
  return (
    <Sheet title={`Add songs to ${pl.name}`} onClose={closeSheet}>
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs" aria-label="Search songs" />
      <ul className="plain">
        {list.map((s) => {
          const n = pl.items.filter((i) => i.songId === s.id).length
          return (
            <li key={s.id}>
              <button className="row-btn" onClick={() => { dispatch(A.playlistAdd(pl.id, [s.id])); haptic(10) }}>
                <span className="grow">{s.title}</span><Badge lang={s.language} />
                {n > 0 ? <small className="in">×{n}</small> : <Icon n="plus" size={18} />}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

function ConfirmSheet({ app, s }) {
  return (
    <Sheet title={s.title} onClose={app.closeSheet}>
      <p>{s.message}</p>
      <div className="actions">
        <button className="btn grow" onClick={app.closeSheet}>Cancel</button>
        <button className="btn danger-fill grow" onClick={() => { s.onConfirm(); app.closeSheet() }}>{s.label}</button>
      </div>
    </Sheet>
  )
}

function PinSheet({ app, s }) {
  const [v, setV] = useState('')
  const [bad, setBad] = useState(false)
  const submit = (e) => {
    e.preventDefault()
    if (v === PIN) {
      s.onOk()
      app.closeSheet()
    } else {
      setBad(true)
      setV('')
      haptic(60)
    }
  }
  return (
    <Sheet title={s.title} onClose={app.closeSheet}>
      <p>{s.message}</p>
      <form className="form" onSubmit={submit}>
        <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={v} aria-label="Password"
          aria-invalid={bad} placeholder="Password" onChange={(e) => { setV(e.target.value); setBad(false) }} />
        {bad && <p className="hint warn" role="alert">Wrong password.</p>}
        <div className="actions">
          <button type="button" className="btn grow" onClick={app.closeSheet}>Cancel</button>
          <button className="btn danger-fill grow" disabled={!v}>{s.label}</button>
        </div>
      </form>
    </Sheet>
  )
}

function NameSheet({ app, s }) {
  const [v, setV] = useState(s.value || '')
  return (
    <Sheet title={s.title} onClose={app.closeSheet}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { s.onSubmit(v.trim()); app.closeSheet() } }}>
        <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Name" autoFocus autoComplete="off" />
        <button className="btn primary block" disabled={!v.trim()}>{s.label}</button>
      </form>
    </Sheet>
  )
}

function ImportSheet({ app, s }) {
  const { songs, playlists } = s.data
  const go2 = (mode) => {
    app.dispatch(mode === 'merge' ? A.mergeAll(s.data) : A.replaceAll(s.data))
    app.toast(mode === 'merge' ? 'Backup merged' : 'Backup restored')
    app.closeSheet()
  }
  return (
    <Sheet title="Import backup" onClose={app.closeSheet}>
      <p>Backup holds <strong>{songs.length}</strong> songs and <strong>{playlists.length}</strong> setlists{s.dropped ? ` (${s.dropped} invalid entries ignored)` : ''}.</p>
      <p className="hint">Merge keeps your data and skips duplicates. Replace deletes current songs and setlists first.</p>
      <div className="actions">
        <button className="btn primary grow" onClick={() => go2('merge')}>Merge</button>
        <button className="btn danger-fill grow" onClick={() => go2('replace')}>Replace all</button>
      </div>
    </Sheet>
  )
}

function TypesSheet({ app }) {
  const { state, dispatch, toast, closeSheet } = app
  const types = allTypes(state)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null) // {from, value}
  const [confirm, setConfirm] = useState(null)
  const count = (t) => state.songs.filter((s) => s.language === t).length
  const add = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    if (types.some((t) => t.toLowerCase() === n.toLowerCase())) return toast('Type already exists.', 'error')
    dispatch(A.typeAdd(n))
    setName('')
  }
  const saveEdit = (e) => {
    e.preventDefault()
    const v = editing.value.trim()
    if (!v) return
    if (v !== editing.from && types.some((t) => t.toLowerCase() === v.toLowerCase())) return toast('Type already exists.', 'error')
    dispatch(A.typeRename(editing.from, v))
    setEditing(null)
  }
  return (
    <Sheet title="Manage types" onClose={closeSheet}>
      <p className="hint">Types label your songs (a language, or any group you like). Rename updates every song. Delete only clears the label.</p>
      <form className="form inline" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type, e.g. Telugu" aria-label="New type" autoComplete="off" />
        <button className="btn primary" disabled={!name.trim()}>Add</button>
      </form>
      <ul className="plain">
        {types.length === 0 && <li className="hint pad">No types yet.</li>}
        {types.map((t) => (
          <li key={t} className="trow">
            {editing?.from === t ? (
              <form className="form inline grow" onSubmit={saveEdit}>
                <input value={editing.value} onChange={(e) => setEditing({ from: t, value: e.target.value })} aria-label={`Rename ${t}`} autoFocus autoComplete="off" />
                <button className="btn primary">Save</button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : confirm === t ? (
              <>
                <span className="grow">Delete "{t}"? {count(t) ? `${count(t)} song(s) lose this type.` : ''}</span>
                <button className="btn danger-fill" onClick={() => { dispatch(A.typeDelete(t)); setConfirm(null) }}>Delete</button>
                <button className="btn" onClick={() => setConfirm(null)}>No</button>
              </>
            ) : (
              <>
                <Badge lang={t} />
                <small className="grow">{count(t)} song{count(t) === 1 ? '' : 's'}</small>
                <button className="icon-btn sm" aria-label={`Edit ${t}`} onClick={() => setEditing({ from: t, value: t })}><Icon n="edit" /></button>
                <button className="icon-btn sm" aria-label={`Delete ${t}`} onClick={() => setConfirm(t)}><Icon n="trash" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

export function SheetHost() {
  const app = useApp()
  const s = app.sheet
  if (!s) return null
  const k = s.type + (s.id || s.playlistId || '')
  switch (s.type) {
    case 'add': return <AddSheet key={k} app={app} initialTab={s.tab} />
    case 'song': return <SongSheet key={k} app={app} id={s.id} />
    case 'pdf': return <PdfSheet key={k} app={app} id={s.id} />
    case 'edit': return <EditSheet key={k} app={app} id={s.id} />
    case 'addTo': return <AddToSheet key={k} app={app} songIds={s.songIds} />
    case 'pick': return <PickSheet key={k} app={app} playlistId={s.playlistId} />
    case 'confirm': return <ConfirmSheet key={k} app={app} s={s} />
    case 'pin': return <PinSheet key={k} app={app} s={s} />
    case 'name': return <NameSheet key={k} app={app} s={s} />
    case 'types': return <TypesSheet key={k} app={app} />
    case 'import': return <ImportSheet key={k} app={app} s={s} />
    default: return null
  }
}

import { useRef, useState } from 'react'
import { Icon } from '../ui.jsx'
import { PIN, haptic, useApp } from '../state.jsx'
import { A } from '../lib/reducer.js'
import { clearPdfs } from '../lib/pdfstore.js'
import { exportBackup, storageUsage, validateBackup } from '../lib/storage.js'

function MoreInner() {
  const app = useApp()
  const { state, prefs, setPref, toast, openSheet, dispatch } = app
  const [help, setHelp] = useState(false)
  const fileRef = useRef(null)
  const usage = storageUsage()

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBackup(state), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stagelyrics-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast('Backup downloaded')
  }
  const doImport = async (file) => {
    try {
      const v = validateBackup(JSON.parse(await file.text()))
      if (!v.ok) return toast(v.error, 'error')
      openSheet({ type: 'import', data: v.data, dropped: v.dropped })
    } catch {
      toast('Not a valid JSON file.', 'error')
    }
  }

  return (
    <div className="screen">
      <div className="scroll">
        <header className="large"><h1>More</h1></header>

        <section className="card">
          <h3>Types</h3>
          <p className="hint">Add, rename or delete the types used to label and filter songs.</p>
          <button className="btn" onClick={() => openSheet({ type: 'types' })}><Icon n="edit" size={18} /> Manage types</button>
        </section>

        <section className="card">
          <h3>Backup</h3>
          <div className="actions">
            <button className="btn grow" onClick={doExport}><Icon n="download" size={18} /> Export JSON</button>
            <button className="btn grow" onClick={() => fileRef.current?.click()}><Icon n="upload" size={18} /> Import JSON</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = '' }} />
          </div>
        </section>

        <section className="card">
          <h3>Data</h3>
          <p className="hint">Stored on this device only: {(usage.bytes / 1024).toFixed(0)} KB of about {(usage.limit / 1048576).toFixed(0)} MB. {state.songs.length} songs, {state.playlists.length} setlists.</p>
          <div className="meter"><i style={{ width: Math.min(100, (usage.bytes / usage.limit) * 100) + '%' }} /></div>
          <div className="actions">
            <button className="btn grow" onClick={() => { dispatch(A.loadSamples()); toast('Samples added. Verify the Malayalam text.') }}>Reset to sample songs</button>
            <button className="btn danger grow" onClick={() => openSheet({ type: 'confirm', title: 'Delete all data?', message: 'All songs and setlists on this device will be deleted. Export a backup first. This cannot be undone.', label: 'Delete everything', onConfirm: () => { dispatch(A.clearAll()); clearPdfs(); toast('All data deleted') } })}>Delete all data</button>
          </div>
        </section>

        <section className="card">
          <button className="row-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help}><h3 className="grow">Help</h3><Icon n={help ? 'up' : 'down'} size={18} /></button>
          {help && <Help />}
        </section>
        <p className="hint center">StageLyrics Live · works offline · data never leaves this device</p>
        <div className="pad-bottom" />
      </div>
    </div>
  )
}

function Help() {
  return (
    <div className="help">
      <h4>Add songs</h4>
      <p><b>Type / paste:</b> title, lyrics. Type (e.g. a language) is detected from the script, or pick your own. Manage types in More. <b>PDF:</b> text is read on your device; check the preview (Malayalam and other Indic PDFs often garble; scanned PDFs have no text). On stage, a PDF song has a Text / PDF switch (the original PDF stays on this device and is not part of the JSON backup). <b>Import .txt:</b> separate songs with a line containing only <code>---</code>. Optional first lines: <code>Title:</code> <code>Type:</code> <code>Tag:</code> <code>Pitch:</code>. One .txt without <code>---</code> becomes one song named after the file. Windows Notepad UTF-16 files work. Duplicates are skipped.</p>
      <h4>On stage</h4>
      <p>Tap ▶ on a song row to push it live. Tap the lyrics to show or hide the controls. Next/Prev follow the setlist.</p>
      <h4>Keyboard (laptop)</h4>
      <p><kbd>Space</kbd> auto-scroll · <kbd>+</kbd>/<kbd>−</kbd> text size · <kbd>←</kbd>/<kbd>→</kbd> prev/next song · <kbd>↑</kbd>/<kbd>↓</kbd> scroll · <kbd>T</kbd> light/dark</p>
      <h4>Good to know</h4>
      <p>Data stays in this browser. Use Export JSON to back up or move to another device. Malayalam sample text should be verified before you sing it.</p>
    </div>
  )
}

export default function More() {
  const { unlocked } = useApp()
  return unlocked ? <MoreInner /> : <Lock />
}

function Lock() {
  const { setUnlocked } = useApp()
  const [v, setV] = useState('')
  const [bad, setBad] = useState(false)
  const submit = (e) => {
    e.preventDefault()
    if (v === PIN) setUnlocked(true)
    else {
      setBad(true)
      setV('')
      haptic(60)
    }
  }
  return (
    <div className="screen">
      <div className="scroll">
        <header className="large"><h1>More</h1></header>
        <form className="form lock" onSubmit={submit}>
          <Icon n="more" size={40} />
          <p>Enter the password to open More.</p>
          <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={v} aria-label="Password"
            aria-invalid={bad} placeholder="Password" onChange={(e) => { setV(e.target.value); setBad(false) }} />
          {bad && <p className="hint warn" role="alert">Wrong password.</p>}
          <button className="btn primary block" disabled={!v}>Unlock</button>
        </form>
      </div>
    </div>
  )
}

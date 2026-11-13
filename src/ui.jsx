// UI primitives: icons, badges, lyrics renderer, bottom sheet.
import { useEffect, useRef, useState } from 'react'
import { lineLang } from './lib/script.js'
import { useApp } from './state.jsx'

const P = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  play: 'M6 4l14 8-14 8z',
  pause: 'M7 4v16M17 4v16',
  prev: 'M19 20L9 12l10-8zM5 4v16',
  next: 'M5 4l10 8-10 8zM19 4v16',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  music: 'M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z',
  live: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M16 8a6 6 0 010 8M8 16a6 6 0 010-8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4 4l1.5 1.5M18.5 18.5L20 20M2 12h2M20 12h2M4 20l1.5-1.5M18.5 5.5L20 4',
  moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
  top: 'M12 19V8M6 13l6-6 6 6M5 3h14',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  back: 'M15 18l-6-6 6-6',
  check: 'M20 6L9 17l-5-5',
  refresh: 'M23 4v6h-6M20.5 15a9 9 0 11-2.1-9.4L23 10',
  ext: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h8',
}
export function Icon({ n, size = 22, fill = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[n]} />
    </svg>
  )
}

export function Badge({ lang }) {
  if (!lang) return null
  let h = 0
  for (const c of lang) h = (h * 31 + c.charCodeAt(0)) % 360
  return <span className="badge" style={{ '--h': h }}>{lang}</span>
}

/** Lyrics: one element per line, dir=auto (RTL for Arabic), lang per line. */
export function Lyrics({ song }) {
  return (
    <>
      {song.lyrics.split('\n').map((line, i) =>
        line.trim() === '' ? (
          <div key={i} className="gap" />
        ) : (
          <div key={i} className="line" dir="auto" lang={lineLang(line, song.language)}>
            {line}
          </div>
        ),
      )}
    </>
  )
}

/** Bottom sheet: tap backdrop, Esc, or swipe the handle down to close. */
export function Sheet({ title, onClose, children, footer }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  const [dy, setDy] = useState(0)
  const drag = useRef(null)
  const closeTimer = useRef(0)

  const close = () => {
    setShown(false)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(onClose, 200)
  }

  useEffect(() => {
    const prev = document.activeElement
    const r = requestAnimationFrame(() => setShown(true))
    ref.current?.focus()
    return () => {
      cancelAnimationFrame(r)
      clearTimeout(closeTimer.current)
      prev?.focus?.()
    }
  }, [])

  const onKey = (e) => {
    if (e.key === 'Escape') return close()
    if (e.key !== 'Tab') return
    const f = [...ref.current.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter((x) => !x.disabled)
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const down = (e) => {
    if (e.target.closest('button')) return // pointer capture would swallow the button click
    drag.current = { y: e.clientY, t: Date.now() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e) => drag.current && setDy(Math.max(0, e.clientY - drag.current.y))
  const up = (e) => {
    if (!drag.current) return
    const d = e.clientY - drag.current.y
    const fast = d / Math.max(1, Date.now() - drag.current.t) > 0.5
    drag.current = null
    if (d > 110 || (fast && d > 30)) close()
    setDy(0)
  }

  return (
    <div className={'sheet-wrap' + (shown ? ' shown' : '')} onKeyDown={onKey}>
      <div className="backdrop" onClick={close} />
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="grab" />
          <div className="sheet-title">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={close} aria-label="Close"><Icon n="x" /></button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
export { Sheet as default }

/** Pull the latest shared library. Shown to everyone when the shared library is on. */
export function RefreshButton() {
  const { cloud, syncNow, toast } = useApp()
  const [busy, setBusy] = useState(false)
  if (!cloud.active) return null
  const run = async () => {
    setBusy(true)
    const r = await syncNow()
    setBusy(false)
    toast(r === 'updated' ? 'Songs updated' : r === 'offline' ? 'Offline. Try again later.' : 'Already up to date')
  }
  return (
    <button className={'icon-btn' + (busy ? ' spin' : '')} aria-label="Refresh songs" disabled={busy} onClick={run}>
      <Icon n="refresh" />
    </button>
  )
}

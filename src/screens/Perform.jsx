import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Badge, Icon, Lyrics } from '../ui.jsx'
import { go, haptic, useApp } from '../state.jsx'
import { A } from '../lib/reducer.js'
import { locateLive, stepTarget } from '../lib/playlist.js'
import { getPdf, hasPdf } from '../lib/pdfstore.js'
import { openPdfDoc } from '../lib/pdf.js'

const BASE_PPS = 14 // px/sec at 1x speed and 32px font
const MIN_FONT = 18
const MAX_FONT = 90

export default function Perform() {
  const app = useApp()
  const { state, dispatch, prefs, setPref, toast, route, stageUp } = app
  const stage = route.tab === 'stage' // chromeless second-screen window
  const preview = route.tab === 'view' // read-only look at a song: never touches the live song
  const songId = preview ? route.id : state.live.songId
  const song = state.songs.find((s) => s.id === songId)
  const [pvPdf, setPvPdf] = useState(route.mode === 'pdf')
  const [playing, setPlaying] = useState(false)
  const [bar, setBar] = useState(true)
  const [pdfOk, setPdfOk] = useState(false) // original PDF stored for this song
  const scroller = useRef(null)
  const pos = useRef(0)
  const written = useRef(0)
  const ratio = useRef(0)
  const live = useRef({ speed: prefs.speed, font: prefs.fontSize })
  live.current = { speed: prefs.speed, font: prefs.fontSize }
  const hideTimer = useRef(0)
  const tap = useRef(null)

  const next = preview ? null : stepTarget(state, 1)
  const prev = preview ? null : stepTarget(state, -1)
  const nextSong = next && state.songs.find((s) => s.id === next.songId)
  const inChain = !!locateLive(state)
  const viewPdf = !!song && pdfOk && (preview ? pvPdf : !!prefs.viewPdf?.[song.id])
  const togglePdf = () => {
    if (preview) setPvPdf((v) => !v)
    else setPref('viewPdf', (m) => ({ ...(m || {}), [song.id]: !m?.[song.id] }))
    haptic(10)
  }
  const exit = () => (preview && history.length > 1 ? history.back() : go('songs'))
  const pushLive = () => { dispatch(A.pushLive(song.id)); haptic(20); go('live') }

  const showBar = () => {
    setBar(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setBar(false), 4500)
  }
  useEffect(() => { showBar(); return () => clearTimeout(hideTimer.current) }, [state.live.nonce]) // eslint-disable-line

  // New song -> top, stop auto-scroll.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = 0
    pos.current = 0
    ratio.current = 0
    setPlaying(false)
  }, [state.live.nonce, songId])

  // Keep reading position when font size changes.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = ratio.current * el.scrollHeight
  }, [prefs.fontSize])

  // Auto-scroll: rAF with fractional accumulator; manual scrolling resyncs it.
  useEffect(() => {
    if (!playing) return
    const el = scroller.current
    if (!el) return
    let raf
    let last = performance.now()
    pos.current = el.scrollTop
    written.current = el.scrollTop
    const tick = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      const cur = el.scrollTop
      if (Math.abs(cur - written.current) > 1.5) {
        pos.current = cur // user scrolled by hand
        written.current = cur
      } else {
        const { speed, font } = live.current
        pos.current += BASE_PPS * speed * (font / 32) * dt
        const max = el.scrollHeight - el.clientHeight
        if (pos.current >= max) {
          el.scrollTop = max
          setPlaying(false)
          toast('End of song')
          return
        }
        el.scrollTop = pos.current
        written.current = el.scrollTop
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, state.live.nonce, toast])

  useEffect(() => {
    let dead = false
    setPdfOk(false)
    if (songId) hasPdf(songId).then((v) => !dead && setPdfOk(v))
    return () => { dead = true }
  }, [songId])

  // Screen Wake Lock while performing.
  useEffect(() => {
    let lock = null
    let dead = false
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          const l = await navigator.wakeLock.request('screen')
          if (dead) l.release().catch(() => {})
          else lock = l
        }
      } catch { /* denied or unsupported */ }
    }
    const vis = () => document.visibilityState === 'visible' && acquire()
    acquire()
    document.addEventListener('visibilitychange', vis)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', vis)
      lock?.release().catch(() => {})
    }
  }, [])

  const openStage = () => window.open(new URL('#/stage', location.href).href, 'stagelyrics-stage', 'popup,width=1100,height=750')
  const font = (d) => { setPref('fontSize', (f) => Math.min(MAX_FONT, Math.max(MIN_FONT, f + d))); haptic(8) }
  const step = (dir) => {
    if (preview) return
    const t = dir > 0 ? next : prev
    if (!t) return toast(dir > 0 ? 'End of setlist' : 'Start of setlist')
    dispatch(A.step(dir))
    haptic(20)
  }
  const toTop = () => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    pos.current = 0
  }

  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      const el = scroller.current
      if (k === ' ') { e.preventDefault(); setPlaying((p) => !p) }
      else if (k === '+' || k === '=') font(4)
      else if (k === '-' || k === '_') font(-4)
      else if (k === 'ArrowRight') step(1)
      else if (k === 'ArrowLeft') step(-1)
      else if (k === 'ArrowDown') { e.preventDefault(); el?.scrollBy(0, 120) }
      else if (k === 'ArrowUp') { e.preventDefault(); el?.scrollBy(0, -120) }
      else if (k === 't' || k === 'T') setPref('perfTheme', (t) => (t === 'dark' ? 'light' : 'dark'))
      else return
      showBar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // re-bind each render: handlers read current state

  if (!song) {
    return (
      <div className="perform" data-pt={prefs.perfTheme}>
        <div className="empty">
          <Icon n="live" size={44} />
          <h2>Nothing live</h2>
          <p>Push a song from Songs or start a setlist.</p>
          {stage ? <p>Waiting for a song to be pushed Live…</p> : <button className="btn primary" onClick={() => go('songs')}>Pick a song</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="perform" data-pt={prefs.perfTheme}>
      <header className="perf-head">
        {!stage && <button className="exit-btn" aria-label="Exit to songs" onClick={exit}><Icon n="back" /> <span>Back</span></button>}
        <div className="perf-title">
          <strong dir="auto">{song.title}</strong>
          <Badge lang={song.language} />
          {preview && <span className="tag preview-tag">Preview</span>}
          {song.pitch && <span className="pitch">♪ {song.pitch}</span>}
        </div>
        {!stage && !preview && (
          <div className="perf-tools">
            {stageUp && <span className="stage-dot" role="status">● Screen connected</span>}
            <button className="icon-btn open-stage" aria-label="Open live screen in a new window" onClick={openStage}><Icon n="ext" /></button>
          </div>
        )}
      </header>

      <div
        className="lyrics-scroll"
        ref={scroller}
        tabIndex={0}
        aria-label="Lyrics"
        onScroll={(e) => { const el = e.currentTarget; ratio.current = el.scrollHeight ? el.scrollTop / el.scrollHeight : 0 }}
        onPointerDown={(e) => { tap.current = { x: e.clientX, y: e.clientY, t: Date.now() } }}
        onPointerUp={(e) => {
          const d = tap.current
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && Date.now() - d.t < 400 && !window.getSelection()?.toString()) {
            bar ? setBar(false) : showBar()
          }
        }}
      >
        {viewPdf ? (
          <PdfView key={song.id} songId={song.id} dark={prefs.perfTheme === 'dark'} zoom={Math.min(2.5, Math.max(0.5, prefs.fontSize / 34))} />
        ) : (
          <div className="lyrics-inner" style={{ fontSize: prefs.fontSize }}>
            <Lyrics song={song} />
          </div>
        )}
        <div className="end-pad" />
      </div>

      <div className={'perf-bar' + (bar ? '' : ' off')} onPointerDown={showBar} onFocus={showBar}>
        <div className="bar-row">
          {!preview && <button className="icon-btn" aria-label="Previous song" disabled={!prev} onClick={() => step(-1)}><Icon n="prev" fill /></button>}
          <button className="icon-btn big" aria-label={playing ? 'Pause auto-scroll' : 'Start auto-scroll'} onClick={() => { setPlaying((p) => !p); haptic(10) }}>
            <Icon n={playing ? 'pause' : 'play'} fill size={26} />
          </button>
          {!preview && <button className="icon-btn" aria-label="Next song" disabled={!next} onClick={() => step(1)}><Icon n="next" fill /></button>}
          <input type="range" min="1" max="5" step="0.5" value={prefs.speed} aria-label="Scroll speed"
            onChange={(e) => setPref('speed', Number(e.target.value))} />
          <span className="speed">{prefs.speed}×</span>
        </div>
        <div className="bar-row">
          <button className="icon-btn" aria-label="Smaller text" onClick={() => font(-4)}><span className="aa">A−</span></button>
          <button className="icon-btn" aria-label="Larger text" onClick={() => font(4)}><span className="aa big">A+</span></button>
          <button className="icon-btn" aria-label="Toggle light / dark stage theme" onClick={() => setPref('perfTheme', (t) => (t === 'dark' ? 'light' : 'dark'))}><Icon n={prefs.perfTheme === 'dark' ? 'sun' : 'moon'} /></button>
          {pdfOk && (
            <button className={'icon-btn pdf-toggle' + (viewPdf ? ' on' : '')} aria-label={viewPdf ? 'Showing PDF. Switch to text' : 'Showing text. Switch to PDF'} aria-pressed={viewPdf} onClick={togglePdf}>
              <Icon n="file" /><span className="aa tiny">{viewPdf ? 'PDF' : 'Text'}</span>
            </button>
          )}
          <button className="icon-btn" aria-label="Back to top" onClick={toTop}><Icon n="top" /></button>
        </div>
      </div>

      {preview ? (
        <div className="next-banner preview">
          <span className="grow">Preview only · live song not changed</span>
          <button className="pill live" onClick={pushLive}>Live</button>
        </div>
      ) : (
      <button className="next-banner" onClick={() => step(1)} disabled={!next}>
        {next ? <>Next: <strong dir="auto">{nextSong?.title}</strong></> : inChain ? 'End of setlist' : 'No setlist chain · add songs to a setlist'}
      </button>
      )}
    </div>
  )
}

/** Renders the stored original PDF as canvases (no text extraction, so no garbling). */
export function PdfView({ songId, dark, zoom }) {
  const [st, setSt] = useState({ status: 'loading', n: 0 })
  const doc = useRef(null)
  const wrap = useRef(null)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const blob = await getPdf(songId)
        if (!blob) throw new Error('missing')
        const d = await openPdfDoc(blob)
        if (dead) return d.destroy?.()
        doc.current = d
        setSt({ status: 'ok', n: d.numPages })
      } catch {
        if (!dead) setSt({ status: 'error', n: 0 })
      }
    })()
    return () => { dead = true; doc.current?.destroy?.(); doc.current = null }
  }, [songId])

  useEffect(() => {
    if (st.status !== 'ok') return
    let dead = false
    ;(async () => {
      const canvases = wrap.current.querySelectorAll('canvas')
      const target = Math.min(2200, (wrap.current.clientWidth || 360) * (window.devicePixelRatio || 1) * 2)
      for (let i = 0; i < st.n; i++) {
        const page = await doc.current.getPage(i + 1)
        if (dead) return
        const base = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: target / base.width })
        const c = canvases[i]
        c.width = vp.width
        c.height = vp.height
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
      }
    })().catch(() => {})
    return () => { dead = true }
  }, [st])

  if (st.status === 'error') return <p className="pdf-msg">PDF not available on this device. Switch back to Text.</p>
  return (
    <div className={'pdf-view' + (dark ? ' inv' : '')} ref={wrap}>
      {st.status === 'loading' && <p className="pdf-msg">Loading PDF…</p>}
      {Array.from({ length: st.n }, (_, i) => (
        <canvas key={i} style={{ width: zoom * 100 + '%' }} aria-label={'PDF page ' + (i + 1)} />
      ))}
    </div>
  )
}

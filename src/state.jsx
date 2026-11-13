// App state: data (reducer + localStorage), prefs, toasts, sheet host state, hash routing.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reducer } from './lib/reducer.js'
import { DATA_KEY, loadData, loadPrefs, migrate, saveData, savePrefs } from './lib/storage.js'
import { isValidState, repairState } from './lib/model.js'

// #/stage = chromeless live screen for a second window. It keeps its own display prefs.
const SCOPE = location.hash.startsWith('#/stage') ? ':stage' : ''
export const IS_STAGE = SCOPE !== ''

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export const PIN = '555' // casual lock only: stored in the app code, not real security
const DEFAULT_PREFS = { theme: 'dark', perfTheme: 'dark', fontSize: 34, speed: 2, viewPdf: {} }

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}

function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '')
  const [a = 'songs', b, c] = h.split('/')
  return { tab: ['songs', 'setlists', 'live', 'more', 'view', 'stage'].includes(a) ? a : 'songs', id: b ? decodeURIComponent(b) : null, mode: c || null }
}
export const go = (path) => {
  location.hash = '#/' + path
}

export function AppProvider({ children }) {
  const init = useMemo(loadData, [])
  const [state, dispatch] = useReducer(reducer, init.state)
  const [prefs, setPrefs] = useState(() => loadPrefs(DEFAULT_PREFS, SCOPE))
  const [toasts, setToasts] = useState([])
  const [sheet, setSheet] = useState(null)
  const [route, setRoute] = useState(parseHash)
  const [unlocked, setUnlocked] = useState(false) // resets on reload
  const saved = useRef(init.fresh || init.dirty ? -1 : state.rev)
  const warned = useRef(false)
  const chan = useRef(null)
  const lastPing = useRef(0)
  const [stageUp, setStageUp] = useState(false)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Cross-window sync (same browser, same device): BroadcastChannel + storage-event fallback.
  useEffect(() => {
    const apply = (raw) => {
      if (!isValidState(raw) || raw.rev <= saved.current) return // dedupe by rev
      saved.current = raw.rev
      dispatch({ type: 'REMOTE', state: repairState(raw) })
    }
    let bc = null
    try {
      bc = new BroadcastChannel('stagelyrics')
      chan.current = bc
      bc.onmessage = (e) => {
        const m = e.data
        if (m?.type === 'state') apply(m.state)
        else if (m?.type === 'ping' && !IS_STAGE) { lastPing.current = Date.now(); setStageUp(true) }
        else if (m?.type === 'bye') setStageUp(false)
      }
    } catch { /* storage events still work */ }
    const onStorage = (e) => {
      if (e.key !== DATA_KEY || !e.newValue) return
      try { const p = migrate(JSON.parse(e.newValue)); if (p) apply(p.state) } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage)
    let hb, watch
    const bye = () => bc?.postMessage({ type: 'bye' })
    if (IS_STAGE) {
      const ping = () => bc?.postMessage({ type: 'ping' })
      ping()
      hb = setInterval(ping, 2000)
      window.addEventListener('pagehide', bye)
    } else {
      watch = setInterval(() => { if (Date.now() - lastPing.current > 5000) setStageUp(false) }, 2000)
    }
    return () => {
      clearInterval(hb)
      clearInterval(watch)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pagehide', bye)
      bc?.close()
      chan.current = null
    }
  }, [])

  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random()
    setToasts((t) => [...t.slice(-2), { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  // Persist on every change. Quota / unavailable storage -> toast (once per failure streak).
  useEffect(() => {
    if (state.rev === saved.current) return
    saved.current = state.rev
    const r = saveData(state)
    try { chan.current?.postMessage({ type: 'state', state }) } catch { /* ignore */ }
    if (!r.ok && !warned.current) {
      warned.current = true
      toast(r.error === 'quota' ? 'Storage full. Export a backup and delete songs.' : 'Cannot save: storage unavailable.', 'error')
    } else if (r.ok) warned.current = false
  }, [state, toast])

  useEffect(() => {
    if (init.error === 'corrupt') toast('Saved data was unreadable. Started empty.', 'error')
    if (init.error === 'unavailable') toast('Storage unavailable. Changes will not be saved.', 'error')
  }, [init.error, toast])

  useEffect(() => {
    savePrefs(prefs, SCOPE)
    document.documentElement.dataset.theme = prefs.theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', prefs.theme === 'light' ? '#faf6f1' : '#0f0e0d')
  }, [prefs])

  const setPref = useCallback((k, v) => setPrefs((p) => ({ ...p, [k]: typeof v === 'function' ? v(p[k]) : v })), [])

  const value = useMemo(
    () => ({
      state, dispatch, prefs, setPref, toast, toasts, sheet, openSheet: setSheet, closeSheet: () => setSheet(null), route, unlocked, setUnlocked, stageUp,
    }),
    [state, prefs, setPref, toast, toasts, sheet, route, unlocked, stageUp],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

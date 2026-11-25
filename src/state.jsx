// App state: data (reducer + localStorage), prefs, toasts, sheet host state, hash routing.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { LIBRARY_ACTIONS, reducer } from './lib/reducer.js'
import { fetchLib, libHash, libOf, putLib } from './lib/cloud.js'
import { DATA_KEY, loadData, loadPrefs, migrate, saveData, savePrefs } from './lib/storage.js'
import { isValidState, repairState } from './lib/model.js'

// #/stage = chromeless live screen for a second window. It keeps its own display prefs.
const SCOPE = location.hash.startsWith('#/stage') ? ':stage' : ''
export const IS_STAGE = SCOPE !== ''

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export const PIN = '555' // casual lock only: stored in the app code, not real security
const REV_STORE = 'stagelyrics:cloudrev'
const lsGet = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* ignore */ } }

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
  const [state, rawDispatch] = useReducer(reducer, init.state)
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
  // Shared library sync (Netlify Function). Library edits need the edit key; everyone can read.
  const cloudRef = useRef({ active: false, ready: false, busy: false, key: '', rev: Number(lsGet(REV_STORE)) || 0, hash: null, applying: false, timer: 0, failed: false, blockedAt: 0 })
  const [cloud, setCloud] = useState({ active: false, canWrite: false, rev: 0, status: 'idle', at: 0 })
  const stateRef = useRef(state)
  stateRef.current = state
  cloudRef.current.key = unlocked ? PIN : '' // unlocking More (password) is what allows editing

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
    if (kind !== 'error' && Date.now() - cloudRef.current.blockedAt < 400) return
    const id = Math.random()
    setToasts((t) => [...t.slice(-2), { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const dispatch = useCallback((a) => {
    const c = cloudRef.current
    if (c.active && !c.key && LIBRARY_ACTIONS.has(a.type)) {
      c.blockedAt = Date.now()
      toast('Read-only. Unlock editing first: More → password.', 'error')
      return
    }
    rawDispatch(a)
  }, [toast])

  const publish = useCallback((patch) => setCloud((p) => ({ ...p, ...patch })), [])

  const applyRemote = useCallback((rev, lib) => {
    const c = cloudRef.current
    c.rev = rev
    lsSet(REV_STORE, String(rev))
    c.applying = true
    rawDispatch({ type: 'CLOUD_APPLY', lib })
  }, [])

  const pushRef = useRef(null)

  const pull = useCallback(async () => {
    const c = cloudRef.current
    if (c.busy) return 'busy'
    // Never overwrite edits that were not saved to the shared library yet: save them first.
    if (c.key && c.hash !== null && libHash(stateRef.current) !== c.hash) { clearTimeout(c.timer); await pushRef.current?.() }
    c.busy = true
    try {
      const d = await fetchLib(c.rev)
      if (d.unavailable) { c.active = false; publish({ active: false, status: 'idle' }); return 'unavailable' }
      c.active = true
      if (d.rev < c.rev) { c.rev = d.rev; lsSet(REV_STORE, String(d.rev)); c.hash = null } // server was reset: local library is the source
      let result = 'same'
      if (d.lib && d.rev > c.rev) { applyRemote(d.rev, d.lib); result = 'updated' }
      else if (d.rev > 0 && c.hash === null) c.hash = libHash(stateRef.current) // returning device: assume in sync
      c.ready = true
      publish({ active: true, status: 'ok', rev: Math.max(d.rev, c.rev), at: Date.now() })
      return result
    } catch {
      publish({ status: 'offline' })
      return 'offline'
    } finally {
      c.busy = false
    }
  }, [applyRemote, publish])

  const push = useCallback(async () => {
    const c = cloudRef.current
    const s = stateRef.current
    const h = libHash(s)
    if (!c.key || h === c.hash) return
    try {
      const r = await putLib(c.rev, c.key, libOf(s))
      if (r.status === 200) {
        c.rev = r.rev; c.hash = h; c.failed = false; lsSet(REV_STORE, String(r.rev))
        publish({ status: 'ok', rev: r.rev, at: Date.now() })
      } else if (r.status === 409) {
        if (r.lib) {
          // Keep my edited/added songs on top of the newer shared library, then save again.
          let base = { songs: [] }
          try { base = { songs: JSON.parse(c.hash)[0] || [] } } catch { /* no base */ }
          const was = new Map(base.songs.map((x) => [x.id, JSON.stringify(x)]))
          const mine = stateRef.current.songs.filter((x) => was.get(x.id) !== JSON.stringify(x))
          const ids = new Set(mine.map((x) => x.id))
          const songs = [...r.lib.songs.filter((x) => !ids.has(x.id)), ...mine]
          c.rev = r.rev
          lsSet(REV_STORE, String(r.rev))
          c.hash = JSON.stringify([r.lib.songs, r.lib.playlists, r.lib.types || []])
          rawDispatch({ type: 'CLOUD_APPLY', lib: { ...r.lib, songs } })
          toast('Another device saved first. Your change was kept and is being saved again.')
        } else { c.rev = r.rev; lsSet(REV_STORE, String(r.rev)) }
      } else if (r.status === 401) {
        toast('Server refused the password.', 'error')
      } else {
        if (!c.failed) toast(r.error || 'Could not save to the shared library.', 'error')
        c.failed = true
        publish({ status: 'error' })
      }
    } catch {
      if (!c.failed) toast('Offline: changes will sync when the connection returns.', 'error')
      c.failed = true
      publish({ status: 'offline' })
    }
  }, [applyRemote, publish, toast])

  pushRef.current = push
  // Leaving the page: save pending edits right away instead of waiting for the delay.
  useEffect(() => {
    const flush = () => { const c = cloudRef.current; if (document.visibilityState === 'hidden' && c.active && c.ready && c.key) { clearTimeout(c.timer); push() } }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [push])

  // Load once on open. After that only the Refresh button (or an edit) talks to the server.
  useEffect(() => {
    if (!IS_STAGE) pull()
  }, [pull])

  // Local library change -> push (debounced). After applying remote data, just record its hash.
  useEffect(() => {
    const c = cloudRef.current
    if (!c.active || !c.ready) return
    if (c.applying) { c.applying = false; c.hash = libHash(state); return }
    if (!c.key || libHash(state) === c.hash) return
    clearTimeout(c.timer)
    c.timer = setTimeout(push, 800)
    return () => clearTimeout(c.timer)
  }, [state, cloud, unlocked, push])

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
      state, dispatch, prefs, setPref, toast, toasts, sheet, openSheet: setSheet, closeSheet: () => setSheet(null), route, unlocked, setUnlocked, stageUp, cloud: { ...cloud, canWrite: unlocked }, syncNow: pull,
    }),
    [state, dispatch, prefs, setPref, toast, toasts, sheet, route, unlocked, stageUp, cloud, pull],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

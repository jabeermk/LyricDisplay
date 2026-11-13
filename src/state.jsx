// App state: data (reducer + localStorage), prefs, toasts, sheet host state, hash routing.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reducer } from './lib/reducer.js'
import { loadData, loadPrefs, saveData, savePrefs } from './lib/storage.js'

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
  return { tab: ['songs', 'setlists', 'live', 'more', 'view'].includes(a) ? a : 'songs', id: b ? decodeURIComponent(b) : null, mode: c || null }
}
export const go = (path) => {
  location.hash = '#/' + path
}

export function AppProvider({ children }) {
  const init = useMemo(loadData, [])
  const [state, dispatch] = useReducer(reducer, init.state)
  const [prefs, setPrefs] = useState(() => loadPrefs(DEFAULT_PREFS))
  const [toasts, setToasts] = useState([])
  const [sheet, setSheet] = useState(null)
  const [route, setRoute] = useState(parseHash)
  const [unlocked, setUnlocked] = useState(false) // resets on reload
  const saved = useRef(init.fresh ? -1 : state.rev)
  const warned = useRef(false)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
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
    savePrefs(prefs)
    document.documentElement.dataset.theme = prefs.theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', prefs.theme === 'light' ? '#faf6f1' : '#0f0e0d')
  }, [prefs])

  const setPref = useCallback((k, v) => setPrefs((p) => ({ ...p, [k]: typeof v === 'function' ? v(p[k]) : v })), [])

  const value = useMemo(
    () => ({
      state, dispatch, prefs, setPref, toast, toasts, sheet, openSheet: setSheet, closeSheet: () => setSheet(null), route, unlocked, setUnlocked,
    }),
    [state, prefs, setPref, toast, toasts, sheet, route, unlocked],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

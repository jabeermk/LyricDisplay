import { AppProvider, go, useApp } from './state.jsx'
import { Icon } from './ui.jsx'
import { SheetHost } from './Sheets.jsx'
import Songs from './screens/Songs.jsx'
import Setlists from './screens/Setlists.jsx'
import Perform from './screens/Perform.jsx'
import More from './screens/More.jsx'

const TABS = [
  ['songs', 'Songs', 'music'],
  ['setlists', 'Setlists', 'list'],
  ['live', 'Perform', 'live'],
  ['more', 'More', 'more'],
]

function Shell() {
  const { route, toasts, state } = useApp()
  const Screen = { songs: Songs, setlists: Setlists, live: Perform, view: Perform, more: More }[route.tab]
  const perform = route.tab === 'live' || route.tab === 'view'
  return (
    <div className="app">
      <main className="main"><Screen key={route.tab + (route.id || '') + (route.mode || '')} /></main>
      {!perform && state.live.songId && (
        <button className="mini-live" onClick={() => go('live')}>
          <span className="live-badge">LIVE</span>
          <span className="grow">{state.songs.find((s) => s.id === state.live.songId)?.title}</span>
          <Icon n="next" size={16} />
        </button>
      )}
      {!perform && (
        <nav className="tabbar" aria-label="Main">
          {TABS.map(([k, label, icon]) => (
            <button key={k} className={route.tab === k ? 'on' : ''} aria-current={route.tab === k ? 'page' : undefined} onClick={() => go(k)}>
              <Icon n={icon} /><span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      <SheetHost />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}
      </div>
    </div>
  )
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>
}

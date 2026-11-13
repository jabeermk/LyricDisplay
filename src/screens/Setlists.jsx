import { Badge, Icon } from '../ui.jsx'
import { go, haptic, useApp } from '../state.jsx'
import { A } from '../lib/reducer.js'
import { playNow } from '../Sheets.jsx'

export default function Setlists() {
  const app = useApp()
  const { state, route, openSheet } = app
  const pl = route.id ? state.playlists.find((p) => p.id === route.id) : null
  return pl ? <Detail app={app} pl={pl} /> : <List app={app} />
}

function List({ app }) {
  const { state, openSheet, dispatch } = app
  const create = () =>
    openSheet({
      type: 'name', title: 'New setlist', label: 'Create',
      onSubmit: (name) => { const a = A.createPlaylist(name); dispatch(a); go('setlists/' + a.playlist.id) },
    })
  return (
    <div className="screen">
      <div className="scroll">
        <header className="large"><h1>Setlists</h1>
          <button className="icon-btn" aria-label="New setlist" onClick={create}><Icon n="plus" /></button>
        </header>
        {state.playlists.length === 0 ? (
          <div className="empty">
            <Icon n="list" size={44} />
            <h2>No setlists yet</h2>
            <p>Chain songs so Next / Prev works on stage.</p>
            <button className="btn primary" onClick={create}>Create setlist</button>
          </div>
        ) : (
          <ul className="plain">
            {state.playlists.map((p) => (
              <li key={p.id}>
                <button className="row-btn tall" onClick={() => go('setlists/' + p.id)}>
                  <span className="grow"><span className="title">{p.name}</span><small className="sub">{p.items.length} song{p.items.length === 1 ? '' : 's'}</small></span>
                  {state.activePlaylistId === p.id && <span className="tag">Active</span>}
                  <Icon n="next" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pad-bottom" />
      </div>
    </div>
  )
}

function Detail({ app, pl }) {
  const { state, dispatch, openSheet, toast } = app
  const songOf = (id) => state.songs.find((s) => s.id === id)
  const move = (i, d) => { dispatch(A.playlistMove(pl.id, i, i + d)); haptic(8) }
  const first = pl.items[0]
  return (
    <div className="screen">
      <div className="scroll">
        <header className="large">
          <button className="icon-btn" aria-label="Back to setlists" onClick={() => go('setlists')}><Icon n="back" /></button>
          <h1 className="grow">{pl.name}</h1>
          <button className="icon-btn" aria-label="Rename setlist" onClick={() => openSheet({ type: 'name', title: 'Rename setlist', label: 'Save', value: pl.name, onSubmit: (n) => dispatch(A.renamePlaylist(pl.id, n)) })}><Icon n="edit" /></button>
          <button className="icon-btn" aria-label="Delete setlist" onClick={() => openSheet({ type: 'confirm', title: 'Delete setlist?', message: `"${pl.name}" will be deleted. Songs stay in your library.`, label: 'Delete', onConfirm: () => { dispatch(A.deletePlaylist(pl.id)); go('setlists') } })}><Icon n="trash" /></button>
        </header>
        <div className="actions pad">
          <button className="btn primary grow" disabled={!first} onClick={() => { dispatch(A.setActive(pl.id)); playNow(app, first.songId, pl.id, 0) }}><Icon n="play" size={18} fill /> Play from start</button>
          <button className="btn grow" onClick={() => openSheet({ type: 'pick', playlistId: pl.id })}><Icon n="plus" size={18} /> Add songs</button>
        </div>
        {state.activePlaylistId !== pl.id && (
          <div className="pad"><button className="link" onClick={() => { dispatch(A.setActive(pl.id)); toast('Active setlist: ' + pl.name) }}>Make active (used by Next/Prev when a song is pushed alone)</button></div>
        )}
        {pl.items.length === 0 ? (
          <div className="empty"><p>Empty. Add songs to build the setlist.</p></div>
        ) : (
          <ol className="plain queue">
            {pl.items.map((it, i) => {
              const s = songOf(it.songId)
              if (!s) return null
              const live = state.live.playlistId === pl.id && state.live.index === i
              return (
                <li key={it.id} className={'qrow' + (live ? ' now' : '')}>
                  <span className="num">{i + 1}</span>
                  <button className="song-main" onClick={() => playNow(app, s.id, pl.id, i)}>
                    <span className="title" dir="auto">{s.title}</span>
                    <span className="meta"><Badge lang={s.language} />{live && <span className="live-badge">LIVE</span>}</span>
                  </button>
                  <button className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon n="up" /></button>
                  <button className="icon-btn sm" aria-label="Move down" disabled={i === pl.items.length - 1} onClick={() => move(i, 1)}><Icon n="down" /></button>
                  <button className="icon-btn sm" aria-label={`Remove ${s.title}`} onClick={() => dispatch(A.playlistRemove(pl.id, i))}><Icon n="x" /></button>
                </li>
              )
            })}
          </ol>
        )}
        <div className="pad-bottom" />
      </div>
    </div>
  )
}

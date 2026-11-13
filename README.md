# StageLyrics Live (lean)

Simple offline PWA for group singers: keep lyrics, build setlists, read them on stage.
React + Vite, no backend, no router library (hash routes), data in `localStorage`.

## Run

```bash
npm install
npm run dev      # development
npm run build    # production build in dist/ (static, works from any host or folder)
npm test         # unit tests (parsers, reducer, playlist next/prev, backup)
```

Serve `dist/` with any static host. The service worker precaches the build, so the app works offline after the first visit.
Install it from the browser menu ("Add to Home screen" / "Install app").

## What it does

- **Songs**: search (title + lyrics, with matching-line snippet), language and tag chips, A to Z sections, tap a row for details, tap the play button to push a song live.
- **Add songs**: type/paste (language auto-detected from script), or import `.txt` files / pasted text. Separate songs with a line containing only `---`. Optional header lines: `Title:`, `Language:`, `Tag:`, `Pitch:`. A single file without `---` becomes one song named after the file. UTF-8 and UTF-16 (Notepad) are decoded. Duplicates (same title and lyrics) are skipped and counted.
- **Setlists**: create, rename, delete, add songs (same song can appear twice), reorder with up/down, remove, "Play from start".
- **Perform**: big lyrics (`dir="auto"` so Arabic is right-to-left, `lang` per line), text size, auto-scroll with 1x to 5x speed (scales with text size, manual scroll still works, pauses at the end), prev/next along the setlist, light/dark stage theme, back to top, "Next: ..." banner, screen wake lock. Tap the lyrics to hide or show controls.
- **More**: dark/light app theme, export/import JSON backup (merge or replace, schema validated), storage usage, reset to samples, delete all data, help.
- Keyboard on laptops: `Space` auto-scroll, `+`/`-` size, arrows prev/next and scroll, `T` theme.

Scripts render offline using bundled Noto fonts (Malayalam, Tamil, Devanagari, Arabic).
Other scripts use the device's system fonts.

## Data

- Key `stagelyrics:v1` holds `{schema, state}`; a migration hook handles future versions. Corrupt data is kept under `stagelyrics:v1:corrupt-<time>` and the app starts empty.
- Preferences (theme, text size, speed) live in `stagelyrics:prefs`.
- Storage-full errors show a toast. Export a backup regularly.
- First launch is empty. "Load sample songs" adds four public-domain songs (English, Hindi, Malayalam, Arabic) and one setlist. **Verify the Malayalam sample text before performing.**

## Ship songs and PDFs with the app (Netlify / any host)

Songs and PDFs live inside each browser, so the hosted site starts empty. To ship what you added on your laptop:

1. **Songs:** in the app go to **More → Export JSON**. Save it over `src/data/songs.json`.
2. **PDFs:** **More → Export PDFs** downloads one file per PDF plus `index.json`. Put all of them in `public/pdfs/`.
3. Commit, push, deploy. Both folders are tracked by git (not ignored).

On first load every visitor gets the shipped songs and setlists, and the PDF button and Text / PDF switch work for shipped PDFs. A visitor who already has data keeps it; shipped songs are added once per new version of `songs.json` (songs are matched by id, nothing is overwritten). Deleted shipped songs can come back when you ship a new version.

## Shared library on Netlify (all phones update)

On Netlify the app stores the song library as JSON text in **Netlify Blobs** through one small function (`netlify/functions/library.mjs`). No separate database or account.

Setup (once):
1. Deploy from git as usual (Netlify installs `@netlify/blobs` automatically).
2. Netlify dashboard → Site configuration → Environment variables → add `EDIT_KEY` = a secret word. Redeploy.
3. On the phone(s) that may edit: open the app → More (password 555) → **Sync** → enter the edit key.

Behaviour:
- Everyone who opens the site reads the same songs and setlists. Their app checks for changes about every 10 seconds (and when the app is opened or refocused).
- Only devices with the edit key can add, edit, delete or reorder. Others see a read-only banner. Everyone can still push songs to their own Perform screen (the live song is per device).
- Two editors saving at the same moment: the second one is told to reload and redo the change.
- Cached offline copy still works; edits made offline sync when the connection returns.
- PDFs are not synced (only text). Ship PDFs with `public/pdfs/` as described above.
- Free-tier note: each check is one function call. Light use is fine; check your Netlify usage if many phones stay open all day.
- Local dev: `npm run dev` emulates the API in memory with edit key `dev`. The key is checked on the server, so `555` and the in-app locks are only convenience locks.

## Limits

- Data lives in one browser on one device. Use Export/Import JSON to move it.
- No cross-device sync. PDF text extraction can garble Indic scripts (font encoding): check the preview, or keep the original PDF and switch Text / PDF on stage.

## Possible later additions (not built)

Multi-window / second-screen sync (BroadcastChannel), cross-device sync (WebRTC with PeerJS, or a tiny WebSocket relay).

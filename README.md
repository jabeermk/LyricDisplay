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

## Limits

- Data lives in one browser on one device. Use Export/Import JSON to move it.
- No cross-device sync, no PDF import. Copy text from a PDF and paste it instead (Indic-language PDFs often copy as garbled text because of font encoding).

## Possible later additions (not built)

Multi-window / second-screen sync (BroadcastChannel), PDF import (pdf.js), cross-device sync (WebRTC with PeerJS, or a tiny WebSocket relay).

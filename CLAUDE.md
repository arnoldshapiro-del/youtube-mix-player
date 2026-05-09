# YouTube Mix Player

## Project Purpose
Standalone web app that imports YouTube video, playlist, or Mix URLs, extracts the queue (with thumbnails, channel, duration), and plays them through with full transport controls (play/pause, prev/next, ±10s, shuffle, repeat all/one/off, volume, speed). Includes TV mode, fullscreen, "Copy TV link", "Open on YouTube" for native casting, queue search, favorites, and a local mix library that persists across sessions.

## Origin
Built originally by ChatGPT 5.5 (May 9, 2026). Code was placed in `C:\Users\arnol\Documents\New project\youtube-mix-player`. Claude Code (Opus 4.7) verified the local server worked, moved it to the standard `Project Files Do Not Delete` location, set up GitHub + Netlify deployment per Arnie's standard workflow.

## GitHub Repo
arnoldshapiro-del/youtube-mix-player

## Netlify URL
youtube-mix-player.netlify.app (or whatever Netlify assigns)

## Tech Stack
- Plain HTML / CSS / vanilla JS (ES modules) — no build step
- Node.js dev server (`server.js`) for local testing
- Netlify Functions (`netlify/functions/resolve-youtube.mts`) for serverless YouTube HTML scraping in production
- YouTube IFrame Player API embedded via script tag
- Google Cast SDK loaded for casting helper

## How It Works
1. User pastes any YouTube URL (video, playlist, or auto-generated Mix `RD...` list)
2. `playlistResolver.js` fetches the YouTube watch page HTML, extracts `ytInitialData` JSON, walks it for `playlistPanelVideoRenderer` / `playlistVideoRenderer` / `compactVideoRenderer` items, normalizes them to track objects with thumbnails
3. The IFrame Player loads the videos in sequence; UI handles transport, queue, library
4. Library persists in localStorage under key `youtube-mix-player:v1`

## Key Files
- `index.html` — single-page UI shell (topbar import form, player column, queue, library)
- `styles.css` — full styling (dark by default with red YouTube accent)
- `src/main.js` — UI logic, IFrame Player wiring, state management, persistence
- `src/youtubeTools.js` — pure helpers (URL parsing, ID extraction, formatting, shuffle)
- `src/playlistResolver.js` — server-side resolver: fetches YouTube HTML, parses ytInitialData
- `server.js` — Node.js dev server, serves static + `/api/resolve-youtube`
- `netlify/functions/resolve-youtube.mts` — production serverless function (same logic)
- `netlify.toml` — Netlify config (publish = `.`, functions dir, headers)
- `manifest.webmanifest` — PWA manifest
- `tests/youtubeTools.test.js` — unit tests for helpers (passes)

## Local Dev
```
cd "C:\Users\arnol\Desktop\Project Files Do Not Delete\youtube-mix-player"
npm start
```
Then open http://127.0.0.1:3000

## Status
- Active, deployed
- Local server tested and working
- API resolver tested with real YouTube Mix URL — successfully extracts tracks

## Known Limitations
- YouTube does NOT expose all personalized "Mix" shelves via official API. The app scrapes the watch-page HTML, which is reliable but depends on YouTube's HTML structure remaining stable.
- Some private/age-gated videos may fail to embed — by YouTube's design.

## Notes
- No build step needed — pure static + functions
- No environment variables needed
- No Firebase / auth wired up (it's a personal-use tool, no login)

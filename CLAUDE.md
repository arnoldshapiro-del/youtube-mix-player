# YouTube Mix Player

## Project Purpose
Standalone web app that imports YouTube video, playlist, or Mix URLs, extracts the queue (with thumbnails, channel, duration), and plays them through with full transport controls. Includes synced lyrics (LRClib), HQ artist search & save-as-playlist, sleep timer, share-with-timestamp, smart shuffle, picture-in-picture, mobile fullscreen, keyboard shortcuts, mix preview, and a persistent library of up to 18 saved mixes.

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
- `index.html` — single-page UI shell (topbar import form, player column, queue with lyrics panel, library)
- `styles.css` — full styling (dark by default with red YouTube accent)
- `src/main.js` — UI logic, IFrame Player wiring, state management, persistence (~1750 lines)
- `src/youtubeTools.js` — pure helpers (URL parsing, ID extraction, formatting, shuffle)
- `src/playlistResolver.js` — server-side resolver: fetches YouTube HTML, parses ytInitialData
- `src/searchResolver.js` — YouTube search (regular + HQ multi-query for artist search)
- `src/qualityScorer.js` — portable quality scoring engine (view count tiers, 27-pattern bad-keyword blocklist, official-channel boost)
- `src/starterMixes.js` — 10-mix curated starter pack builder
- `server.js` — Node.js dev server, routes: `/api/resolve-youtube`, `/api/search-youtube`, `/api/starter-pack`, `/api/hq-artist`
- `netlify/functions/resolve-youtube.mts` — production serverless: URL → tracks
- `netlify/functions/search-youtube.mts` — production serverless: regular search
- `netlify/functions/starter-pack.mts` — production serverless: curated pack
- `netlify/functions/hq-artist.mts` — production serverless: HQ multi-query artist search
- `netlify.toml` — Netlify config (publish = `.`, functions dir, headers)
- `manifest.webmanifest` — PWA manifest
- `tests/youtubeTools.test.js` — unit tests for helpers (passes)

## Features
**Core playback**
- Paste any YouTube video / playlist / Mix URL → queue loads with thumbnails
- Play/pause, prev/next, ±10s, shuffle, repeat all/one/off, volume, speed (0.5–2x), quality (Auto–4K)
- 4 player size presets: Cozy / Cinema / Theater / Max (fixes fuzzy fullscreen by physically scaling iframe)
- Mobile-first fullscreen button on the player itself (true browser fullscreen)
- TV mode + Cast helper + Open-on-YouTube
- Library persists in localStorage (cap: 18 mixes)

**Search & discovery**
- Built-in YouTube search bar — search any artist/song, click "Play as Mix" to load that song's auto-Mix
- "Load starter pack (10 mixes)" — one-click curated classic-rock library
- "More by artist" button — runs HQ multi-query search (6 parallel angles), returns top 40 with quality badges
- "💎 Save all 40 as 'Artist – HQ Collection' playlist" — saves HQ search as new mix in library
- "See songs" preview button on every mix card — shows full track list inline without loading

**Smart features (Round 2 build)**
- Synced lyrics (LRClib API) — karaoke-style scrolling, highlights active line, auto-detects artist/title from track
- Sleep timer — 15/30/45/60 min + "End of song" + Cancel, live "Sleeps in Xm" label
- Smart shuffle — tracks last 12 played, avoids them
- Picture-in-Picture mini-player — Document PiP API with iframe fallback
- Share-with-timestamp — copies URL with `?source=...&t=N`
- Keyboard shortcuts — Space/K, J/L (or ←/→), N, B/P, F, M, S, R, 0–9, ?

**Mobile-specific**
- Sticky video on top of viewport when lyrics panel is open (prevents losing video while scrolling)
- 56px fullscreen button (vs 44px on desktop)
- Action buttons sized larger and pill-shaped on phones
- Lyrics panel sized to 50vh (instead of fixed pixel height)
- Lyrics panel moved to queue column so it never pushes video down

## Quality scorer rubric (qualityScorer.js — portable)
**View count tiers (the strongest signal):**
- 500M+ views: +80
- 100M+: +60
- 10M+: +40
- 1M+: +20
- 100K+: +8
- <10K: -20

**Channel signals:**
- Official/VEVO/Topic/Records/Music in channel name: +25
- Channel name matches artist name: +20

**Title signals:**
- "official video/audio/music video": +12 each
- "live at/in/from/on/concert/performance/session": +12 each
- "remastered", "HD/4K/1080p/2160p/HQ", "VEVO": +12 each

**Bad-keyword blocklist (27 patterns, -50 if any match):**
cover, tribute, karaoke, instrumental, lyrics video, 8d audio/music, speed up/sped up, slowed/slowed down, nightcore, reverb, loop, 1 hour/10 hour, extended, type beat, remake, remix by, ai generated/ai cover, fan made, made by, reaction, react to, first time hearing, in the style of, with rain, for sleep, to sleep

**Duration filter:**
- Under 60s: -40 (clips, shorts)
- 90-480s (song-length): +8
- Over 1800s (compilations): -20

**Min score threshold:** 30 (filtered out below)

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

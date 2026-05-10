# SESSION NOTES — YouTube Mix Player

## Session — 2026-05-09
**What we did:**
- Took the YouTube Mix Player code that ChatGPT 5.5 built and dropped in `C:\Users\arnol\Documents\New project\youtube-mix-player`
- Verified the local server actually runs (`node server.js` → `http://127.0.0.1:3000` serves the UI correctly)
- Tested the YouTube resolver API with a real Mix URL — successfully extracted the Fleetwood Mac "Landslide" Mix queue
- Moved the project to the standard `Desktop\Project Files Do Not Delete\youtube-mix-player\` location (cleared the `Documents\New project\` clutter)
- Created CLAUDE.md and SESSION_NOTES.md memory files
- Pushed to GitHub as `arnoldshapiro-del/youtube-mix-player`
- Wired Netlify with two-way sync to deploy automatically
- Added Desktop `.url` shortcut to "All Of My Working Apps That Are Beautiful"
- Updated `arnies-app-showcase` gallery

**What's working:**
- Paste any YouTube video, playlist, or Mix URL → queue loads with thumbnails
- Play/pause, prev/next, ±10s, shuffle, repeat all/one/off, volume, speed
- TV mode + fullscreen + Cast helper
- Saved-mix library persists in localStorage
- Local dev: `npm start` works
- Netlify production: serverless function handles YouTube HTML scraping

**What's next:**
- Use the app, see what feels off, come back with refinements

**Important decisions:**
- Kept ChatGPT's code as-is — it was actually well-written and works. No need to rewrite.
- Used Netlify standard auto-deploy from GitHub (Arnie's standard workflow), not Vercel.
- No Firebase / auth gate — this is a personal media app, not a clinical tool.

**Problems encountered:**
- ChatGPT had told Arnie to manually edit Netlify settings — confusing for a non-coder. Claude handled the deploy end-to-end with Netlify two-way sync.

---

## Session — 2026-05-09 (continuation, big build session — Opus 4.7 with 1M context)

**What we did (huge session — 11 features + 2 bug fixes shipped):**

### Round 1 — Initial UX upgrades (early in session)
- Added player size presets (Cozy / Cinema / Theater / Max) to fix fuzzy fullscreen
- Added Quality dropdown (Auto / 4K / 1440p / 1080p / 720p / 480p) — 1080p default, locks in across track changes
- Added in-app YouTube search bar (search any artist/song, click "Play as Mix" on results)
- Added "Load starter pack (10 mixes)" button — one-click curated classic-rock library
- Added URL clear (✕) button inside the URL paste box
- Added mix-library count badge

### Round 2 — Mobile + 8 core features
- Added prominent player fullscreen button (true browser fullscreen, big on mobile)
- Verified Media Session API (lock-screen / car stereo controls) was already wired and works
- Built Lyrics panel — synced karaoke-style scrolling via free LRClib API. Auto-detects artist/title from track, fetches synced LRC, highlights active line, auto-scrolls.
- Built Sleep Timer — 15/30/45/60 min + "End of song" + Cancel options. Live "Sleeps in Xm" label.
- Built "More by artist" button — extracts artist from current track, runs YouTube search.
- Built Smart Shuffle — tracks last 12 played, avoids them. Falls back to standard if all played.
- Built Picture-in-Picture mini-player — uses Document PiP API, falls back to iframe PiP for older browsers.
- Built Share-with-timestamp — copies URL with `?source=...&t=N` so receiver opens at exact second.
- Built Keyboard shortcuts dialog — Space/K, J/L, F, M, S, R, 0–9, ?

### Round 3 — HQ video search (the big one)
- Created `src/qualityScorer.js` — scoring engine: view count weighting (up to +80), bad-keyword blocklist (27 patterns: 8D, nightcore, slowed, AI cover, reaction, etc.), official-channel boost, duration filter
- Created `highQualityArtistSearchRequest()` in searchResolver.js — 6 parallel YouTube searches with quality keywords, dedup, score, filter, return top 40
- Added `/api/hq-artist` endpoint in both server.js and netlify/functions/hq-artist.mts
- Upgraded "More by artist" button to use HQ endpoint by default
- Added quality badges on results: 💎 Premium (gold gradient, score 100+) / ⭐ Great (green, 60-99) / ✓ Good (blue, 30-59)
- Tested on James Taylor: 78 candidates filtered to 40 verified HQ videos; Eagles top result was "Hotel California (Live 1977) [HD]"

### Round 4 — Mix preview + HQ playlist save
- Added "See songs" button on every mix card — expands inline to show all songs (thumbnail + title + channel + duration) without loading the mix
- Added "💎 Save all 40 as 'Artist - HQ Collection' playlist" button at top of HQ search results — one-click saves the HQ search results as a new mix in the library
- Smart dedup: re-saving an artist replaces the old version, doesn't create duplicates

### Round 5 — Bug fixes
- Fixed sleep timer menu showing by default at page load — `display: flex` was overriding the `[hidden]` attribute. Added `.sleep-timer-menu[hidden] { display: none; }`.
- Fixed lyrics panel pushing video down — moved the panel out of the player column into the queue column. Video stays full-size, lyrics appear in middle column. Added sticky video on mobile when lyrics open. Added Max-mode lyrics overlay (floats as fixed glass-effect drawer).

**What's working:**
- All 11 new features live at youtube-mix-player.netlify.app
- 18-mix library cap with smart replacement
- Synced lyrics for any song with LRClib data (most major artists covered)
- HQ artist search returns Premium-quality picks (no covers, no lyric videos, no nonsense)

**What's next:**
- Move to Music Vault upgrade project (separate session)

**Important decisions:**
- Kept "More by artist" as the HQ button (not a separate one) — Arnie wants the best by default
- HQ playlist titled "[Artist] – HQ Collection" with em-dash for visual distinction from imported mixes
- Lyrics moved to queue column (not player column) so video stays full-size
- Sticky video on mobile when lyrics open (prevents losing video while scrolling lyrics)

**Problems encountered:**
- Netlify API rate-limited during one deploy poll (429) — switched to direct HTTP polling
- Initial Puppeteer screenshot saved to wrong path (Project Files location vs. Desktop gallery) — corrected
- Gallery push had merge conflict mid-session (concurrent push from another agent) — resolved with rebase

**Files modified/created today:**
- `index.html` — major additions: track-actions row, lyrics-panel, sleep-timer-menu, shortcuts-dialog, fullscreen button, URL clear button, mix-library count, search bar
- `src/main.js` — many feature implementations (~600 added lines)
- `src/qualityScorer.js` — NEW file
- `src/searchResolver.js` — added `highQualityArtistSearchRequest()`
- `src/starterMixes.js` — NEW file (10-mix curated starter pack)
- `src/searchResolver.js` — NEW file
- `server.js` — added 3 API routes (search, starter-pack, hq-artist)
- `netlify/functions/search-youtube.mts` — NEW
- `netlify/functions/starter-pack.mts` — NEW
- `netlify/functions/hq-artist.mts` — NEW
- `styles.css` — extensive CSS for all new UI elements

**Architecture notes for future sessions:**
- The quality scorer (`src/qualityScorer.js`) is portable — designed to be drop-in for any other YouTube-search-based app (e.g., Music Vault). Key constants:
  - View count tiers: 100K=8pts, 1M=20pts, 10M=40pts, 100M=60pts, 500M=80pts
  - Bad keywords list: 27 modern garbage patterns to block
  - Min score threshold: 30 (anything below filtered out)
- The HQ multi-query strategy: 6 parallel searches (`official video`, `VEVO`, `official audio`, `live HD`, `greatest hits`, `live concert`), dedup, score, return top N


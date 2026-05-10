# SESSION NOTES — YouTube Mix Player

## Session — 2026-05-11 (Firebase Auth + Firestore — saved mixes are now permanent)

### Why
Arnie cleared browser cookies on May 11 morning following well-intended
instructions. Chrome's "Cookies and other site data" clear also wipes
localStorage. Mix Player had no cloud backup — saved mixes (~15) gone
permanently. Music Vault survived because it's been on Firebase since April.
Arnie demanded permanent memory for Mix Player so this can never repeat.

### What we shipped (commits 3f16474 and d2a7fde)

**src/firebase.js (new)**
- ES module imports from gstatic CDN (Mix Player has no npm/bundler;
  CDN modules match the project's vanilla-JS architecture)
- Uses existing shapiro-apps Firebase project (same as Music Vault)
- Exports: signIn, signOutUser, isUserAllowed, fetchUserState,
  saveUserState, onUserChange, getCurrentUser

**src/authGate.js (new)**
- Loaded BEFORE main.js. Hides app shell via html[data-auth-gate=pending]
  while checking auth. On signed-in + allowlisted: opens the gate.
- Allowlist deny: friendly error + auto sign-out
- Broadcasts user changes via window.__mp_user_listeners so main.js
  can sync state on auth change

**src/main.js**
- Imports fetchUserState/saveUserState from firebase.js
- loadSavedState refactored: applyStateFromSaved() pulled out for reuse
- saveState now also schedules a 2s-debounced Firestore write via
  scheduleFirestoreSave()
- syncStateFromFirestoreOnAuth: on user sign-in, fetch cloud state
  (cloud wins on conflict), re-render UI, write to localStorage cache
- Subscribes to window.__mp_user_listeners

**index.html**
- Loads ./src/authGate.js as ES module BEFORE ./src/main.js
- Adds the auth-gate overlay (hidden until JS shows it)
- Adds the auth-pill (sign-out + sync indicator) for signed-in state

**styles.css**
- ~80 lines of CSS for .auth-gate / .auth-gate-card / .auth-gate-button /
  .auth-pill. Matches Mix Player aesthetic (#f5533d red/orange).
- html[data-auth-gate=pending|denied] hides .app-shell to prevent FOUC

### Firebase admin config (already done before commit)
- youtube-mix-player.netlify.app added to Firebase Authorized Domains via
  identitytoolkit.googleapis.com PATCH
- youtube-mix-player.netlify.app/* + *--youtube-mix-player.netlify.app/*
  added to API key (AIzaSyBWKpWwPRFqjSxCmxSBpqZjLenlL7B7REU) HTTP referrer
  allowlist via apikeys.googleapis.com PATCH
- Both via ~/.claude/scripts/add-mix-player-firebase-config.js (preserved
  for re-running if needed)

### Gallery refresh (commit d2a7fde in arnies-app-showcase)
- New Mix Player screenshot showing the auth gate (the public-facing UI now)
- Tagline updated to mention Firebase sign-in + Firestore sync + the
  May 10 HQ scoring port

### What's next for Arnie
- Sign in once at youtube-mix-player.netlify.app — bootstraps allowlist
  to his email only
- Add Ela + kids via Access Manager (arnie-access-manager.netlify.app)
- Saved mixes from then on write to Firestore. Cookie clears can't lose
  them ever again.

---

## Session — 2026-05-10 (Music Vault port + 3 pre-existing bug fixes)

While working on Music Vault Phase 3, Arnie asked me to study what had been
added there and port any improvements that would benefit Mix Player. Found
two scoring improvements directly applicable + uncovered three pre-existing
Mix Player bugs that had to be fixed before the port could be verified live.

### What we ported (commits 782493f → 1cd7ede → 29fe443 → d734ea7)

**src/qualityScorer.js: two new penalties from arnies-music-vault**

1. Universal -60 wrong-artist penalty. When neither the title nor the
   channel mentions any meaningful word from the user's searched artist, the
   result is almost certainly wrong-artist. Pre-fix, popular off-topic
   videos with high view counts could outrank correct-artist results that
   happened to be less popular (e.g. a Cohen 'Hallelujah' search returning
   Pentatonix's cover at the top).
2. -35 lyric-video penalty. The bad-keyword list catches 'lyrics video'
   (with the s) but 'Official Lyric Video' uploads were scoring high
   because GOOD_TITLE_PATTERNS rewards 'official'. -35 cleanly tips toward
   real visual content when a music video also exists.

Verified live after deploy:
- /api/hq-artist?artist=Dave+Loggins returns ZERO lyric videos in top 5
- /api/hq-artist?artist=Leonard+Cohen returns 5 authentic Cohen recordings
  in top 5 (Hallelujah Live London 2008 at top, score 105)

### Pre-existing bugs found and fixed

**1. Missing /api/* redirect** (commit 29fe443)
The frontend (src/main.js) calls /api/hq-artist, /api/resolve-youtube,
/api/search-youtube, /api/starter-pack — but production netlify.toml had no
redirect rule from /api/* to /.netlify/functions/:splat. So the production
HQ artist search, mix resolver, search bar, and starter pack ALL returned
404 to users. Worked locally only because server.js bound those paths
itself.

Fix:
```toml
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

**2. Missing build command** (commit d734ea7)
netlify.toml had `[build] publish = "."` with no `command`. Netlify's
auto-detection on the noble image now tries to run `npm run build` even
though Mix Player has no build script. The build failed with exit code 2,
preventing functions from bundling at all (fns=0 in deploy artifact, all
function URLs returned 404 even when /api/* redirect was in place).

Fix: `command = "npm install --no-audit --no-fund"` — installs deps so
esbuild has what it needs to bundle .mts function files; doesn't need an
actual build step beyond that.

**3. Same noble-new-builds + Node 22.22.2 regression as Music Vault**
(commit 2e7e30e)

Pinned NODE_VERSION = "20" in [build.environment]. Even with this pin,
fresh pushes still occasionally fail nondeterministically with exit code 2;
clearing the build cache via the Netlify API
(POST /sites/{id}/builds {clear_cache:true}) reliably succeeds. See
`~/.claude/projects/.../memory/netlify_vite_build_fix.md` for full details.

### Notes for the next session

- Mix Player's scoring engine is now in sync with Music Vault's. Future
  scoring tweaks in either project should be ported to the other.
- Functions are now properly deployed and working in production. The site
  was effectively broken in production before today's fixes.
- The cache-clear-as-workaround pattern is documented in memory; if a push
  fails with exit code 2, immediately try cache-clear before assuming the
  code is wrong.

---

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


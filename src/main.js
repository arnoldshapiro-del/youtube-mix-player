import {
  STARTER_URL,
  formatTime,
  makeId,
  normalizeTrack,
  parseYoutubeUrl,
  shuffledIndexes,
  thumbnailFor,
  youtubeWatchUrl
} from "./youtubeTools.js";

const STORAGE_KEY = "youtube-mix-player:v1";
const MAX_LIBRARY_ITEMS = 18;
const SIZE_PRESETS = ["cozy", "cinema", "theater", "max"];
const DEFAULT_SIZE = "cinema";
const DEFAULT_QUALITY = "hd1080";

const state = {
  playerReady: false,
  isPlaying: false,
  isSeeking: false,
  nativeListMode: false,
  nativeListLoaded: false,
  currentIndex: 0,
  shuffle: false,
  shuffleOrder: [],
  repeat: "all",
  volume: 82,
  filter: "",
  favoritesOnly: false,
  source: null,
  tracks: [],
  library: [],
  favorites: new Set(),
  played: new Set(),
  size: DEFAULT_SIZE,
  quality: DEFAULT_QUALITY,
  searchQuery: "",
  searchResults: [],
  searching: false,
  recentlyPlayed: [],
  sleepTimer: { mode: null, endTime: 0 },
  lyricsOpen: false,
  lyrics: { fetchedKey: "", lines: [], synced: false, plain: "" },
  preMuteVolume: 82,
  searchHqMode: false,
  searchHqStats: null,
  previewedMixId: ""
};

const RECENT_HISTORY_LIMIT = 12;

let player = null;
let progressTimer = 0;
let deferredInstallPrompt = null;
let wakeLock = null;
let sleepTimerTimeoutId = 0;
let sleepTimerCountdownId = 0;
let lyricsAbortController = null;
let lyricsScrollTimer = 0;
let pipWindow = null;

const els = {};

function bindElements() {
  Object.assign(els, {
    importForm: document.querySelector("#import-form"),
    youtubeUrl: document.querySelector("#youtube-url"),
    urlClear: document.querySelector("#url-clear"),
    installButton: document.querySelector("#install-button"),
    tvModeButton: document.querySelector("#tv-mode-button"),
    castButton: document.querySelector("#cast-button"),
    castDialog: document.querySelector("#cast-dialog"),
    castStatus: document.querySelector("#cast-status"),
    fullscreenButton: document.querySelector("#fullscreen-button"),
    playerFullscreenButton: document.querySelector("#player-fullscreen"),
    videoShell: document.querySelector(".video-shell"),
    copyTvLinkButton: document.querySelector("#copy-tv-link-button"),
    youtubeCastButton: document.querySelector("#youtube-cast-button"),
    playerCover: document.querySelector("#player-cover"),
    coverImage: document.querySelector("#cover-image"),
    coverTitle: document.querySelector("#cover-title"),
    statusLine: document.querySelector("#status-line"),
    trackTitle: document.querySelector("#track-title"),
    trackMeta: document.querySelector("#track-meta"),
    seekSlider: document.querySelector("#seek-slider"),
    elapsedTime: document.querySelector("#elapsed-time"),
    durationTime: document.querySelector("#duration-time"),
    previousButton: document.querySelector("#previous-button"),
    rewindButton: document.querySelector("#rewind-button"),
    playButton: document.querySelector("#play-button"),
    forwardButton: document.querySelector("#forward-button"),
    nextButton: document.querySelector("#next-button"),
    shuffleButton: document.querySelector("#shuffle-button"),
    repeatButton: document.querySelector("#repeat-button"),
    speedSelect: document.querySelector("#speed-select"),
    volumeSlider: document.querySelector("#volume-slider"),
    queueCount: document.querySelector("#queue-count"),
    queueSearch: document.querySelector("#queue-search"),
    favoritesFilter: document.querySelector("#favorites-filter"),
    queueList: document.querySelector("#queue-list"),
    mixLibrary: document.querySelector("#mix-library"),
    copyLinkButton: document.querySelector("#copy-link-button"),
    playedCount: document.querySelector("#played-count"),
    savedCount: document.querySelector("#saved-count"),
    mixCount: document.querySelector("#mix-count"),
    mixLibraryCount: document.querySelector("#mix-library-count"),
    openYoutubeButton: document.querySelector("#open-youtube-button"),
    clearPlayedButton: document.querySelector("#clear-played-button"),
    qualitySelect: document.querySelector("#quality-select"),
    sizeButtons: Array.from(document.querySelectorAll(".size-button")),
    searchForm: document.querySelector("#search-form"),
    searchInput: document.querySelector("#search-query"),
    searchClear: document.querySelector("#search-clear"),
    searchResultsShell: document.querySelector("#search-results-shell"),
    searchResults: document.querySelector("#search-results"),
    searchStatus: document.querySelector("#search-status"),
    starterPackButton: document.querySelector("#starter-pack-button"),
    starterPackStatus: document.querySelector("#starter-pack-status"),
    lyricsToggle: document.querySelector("#lyrics-toggle"),
    lyricsPanel: document.querySelector("#lyrics-panel"),
    lyricsBody: document.querySelector("#lyrics-body"),
    lyricsStatus: document.querySelector("#lyrics-status"),
    lyricsClose: document.querySelector("#lyrics-close"),
    moreByArtistButton: document.querySelector("#more-by-artist"),
    shareTimeButton: document.querySelector("#share-time"),
    pipButton: document.querySelector("#pip-button"),
    sleepTimerButton: document.querySelector("#sleep-timer-button"),
    sleepTimerLabel: document.querySelector("#sleep-timer-label"),
    sleepTimerMenu: document.querySelector("#sleep-timer-menu"),
    keyboardHelpButton: document.querySelector("#keyboard-help"),
    shortcutsDialog: document.querySelector("#shortcuts-dialog")
  });
}

function loadSavedState() {
  let saved = {};

  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    saved = {};
  }

  state.library = Array.isArray(saved.library) ? saved.library : [];
  state.favorites = new Set(Array.isArray(saved.favorites) ? saved.favorites : []);
  state.played = new Set(Array.isArray(saved.played) ? saved.played : []);
  state.volume = Number.isFinite(saved.volume) ? saved.volume : 82;
  state.shuffle = Boolean(saved.shuffle);
  state.repeat = saved.repeat || "all";
  state.size = SIZE_PRESETS.includes(saved.size) ? saved.size : DEFAULT_SIZE;
  state.quality = typeof saved.quality === "string" && saved.quality ? saved.quality : DEFAULT_QUALITY;
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      library: state.library,
      favorites: Array.from(state.favorites),
      played: Array.from(state.played),
      volume: state.volume,
      shuffle: state.shuffle,
      repeat: state.repeat,
      size: state.size,
      quality: state.quality
    })
  );
}

function bindEvents() {
  els.importForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadSource(els.youtubeUrl.value, { play: true });
  });

  els.playButton.addEventListener("click", togglePlayback);
  els.previousButton.addEventListener("click", previousTrack);
  els.nextButton.addEventListener("click", nextTrack);
  els.rewindButton.addEventListener("click", () => seekBy(-10));
  els.forwardButton.addEventListener("click", () => seekBy(10));

  els.shuffleButton.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    state.shuffleOrder = state.shuffle ? shuffledIndexes(state.tracks.length, state.currentIndex) : [];
    if (player?.setShuffle && state.nativeListMode) {
      player.setShuffle(state.shuffle);
    }
    saveState();
    renderAll();
  });

  els.repeatButton.addEventListener("click", () => {
    state.repeat = state.repeat === "all" ? "one" : state.repeat === "one" ? "off" : "all";
    if (player?.setLoop && state.nativeListMode) {
      player.setLoop(state.repeat !== "off");
    }
    saveState();
    renderModes();
  });

  els.speedSelect.addEventListener("change", () => {
    if (player?.setPlaybackRate) {
      player.setPlaybackRate(Number(els.speedSelect.value));
    }
  });

  if (els.qualitySelect) {
    els.qualitySelect.addEventListener("change", () => {
      state.quality = els.qualitySelect.value;
      saveState();
      applyQualityPreference();
    });
  }

  for (const button of els.sizeButtons) {
    button.addEventListener("click", () => {
      const target = button.dataset.size;

      if (!SIZE_PRESETS.includes(target)) {
        return;
      }

      state.size = target;
      saveState();
      applySize();
      applyQualityPreference();
    });
  }

  if (els.searchForm) {
    els.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = els.searchInput.value.trim();

      if (!query) {
        return;
      }

      runSearch(query);
    });
  }

  if (els.urlClear) {
    els.youtubeUrl.addEventListener("input", () => {
      els.urlClear.hidden = !els.youtubeUrl.value;
    });
    els.urlClear.addEventListener("click", () => {
      els.youtubeUrl.value = "";
      els.urlClear.hidden = true;
      els.youtubeUrl.focus();
    });
  }

  if (els.searchClear) {
    els.searchClear.addEventListener("click", () => {
      els.searchInput.value = "";
      state.searchQuery = "";
      state.searchResults = [];
      renderSearch();
      els.searchInput.focus();
    });
  }

  if (els.starterPackButton) {
    els.starterPackButton.addEventListener("click", loadStarterPack);
  }

  if (els.searchResults) {
    els.searchResults.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");

      if (!button) {
        return;
      }

      const videoId = button.dataset.videoId;
      const action = button.dataset.action;
      const result = state.searchResults.find((entry) => entry.videoId === videoId);

      if (!result || !videoId) {
        return;
      }

      if (action === "play-mix") {
        const url = result.mixUrl || `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}&start_radio=1`;
        els.youtubeUrl.value = url;
        loadSource(url, { play: true });
      }

      if (action === "play-video") {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        els.youtubeUrl.value = url;
        loadSource(url, { play: true });
      }
    });

    // Listener for the "Save HQ as playlist" CTA button (event delegated on the same container)
    els.searchResults.addEventListener("click", (event) => {
      const saveBtn = event.target.closest("[data-action='save-hq-playlist']");
      if (!saveBtn) return;
      saveHqResultsAsPlaylist();
    });
  }

  els.volumeSlider.addEventListener("input", () => {
    state.volume = Number(els.volumeSlider.value);
    if (player?.setVolume) {
      player.setVolume(state.volume);
    }
    saveState();
  });

  els.seekSlider.addEventListener("input", () => {
    state.isSeeking = true;
  });

  els.seekSlider.addEventListener("change", () => {
    const duration = getDuration();
    const target = duration * (Number(els.seekSlider.value) / 1000);
    if (player?.seekTo) {
      player.seekTo(target, true);
    }
    state.isSeeking = false;
    updateProgress();
  });

  els.queueSearch.addEventListener("input", () => {
    state.filter = els.queueSearch.value.trim().toLowerCase();
    renderQueue();
  });

  els.favoritesFilter.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderQueue();
  });

  els.queueList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);

    if (button.dataset.action === "play") {
      playAt(index, { play: true });
    }

    if (button.dataset.action === "favorite") {
      toggleFavorite(index);
    }
  });

  els.mixLibrary.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const id = button.dataset.id;

    if (button.dataset.action === "load-mix") {
      loadLibraryMix(id);
    }

    if (button.dataset.action === "remove-mix") {
      removeLibraryMix(id);
    }

    if (button.dataset.action === "preview-mix") {
      state.previewedMixId = state.previewedMixId === id ? "" : id;
      renderLibrary();
    }
  });

  els.copyLinkButton.addEventListener("click", () => copyText(buildShareUrl(), "App link copied."));
  els.copyTvLinkButton.addEventListener("click", () => copyText(buildShareUrl(), "TV link copied."));
  els.openYoutubeButton.addEventListener("click", openCurrentOnYoutube);
  els.youtubeCastButton.addEventListener("click", openCurrentOnYoutube);
  els.clearPlayedButton.addEventListener("click", () => {
    state.played.clear();
    saveState();
    renderAll();
  });

  els.castButton.addEventListener("click", () => els.castDialog.showModal());
  els.fullscreenButton.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  if (els.playerFullscreenButton && els.videoShell) {
    const target = els.videoShell;
    const enterFs = () => {
      const req = target.requestFullscreen
        || target.webkitRequestFullscreen
        || target.webkitEnterFullscreen
        || target.mozRequestFullScreen
        || target.msRequestFullscreen;
      if (req) req.call(target);
    };
    const exitFs = () => {
      const exit = document.exitFullscreen
        || document.webkitExitFullscreen
        || document.mozCancelFullScreen
        || document.msExitFullscreen;
      if (exit) exit.call(document);
    };
    els.playerFullscreenButton.addEventListener("click", () => {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (isFs) exitFs(); else enterFs();
    });
    const updateFsIcon = () => {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement;
      els.playerFullscreenButton.classList.toggle("is-fullscreen", !!isFs);
      els.playerFullscreenButton.setAttribute("aria-label", isFs ? "Exit fullscreen" : "Fullscreen video");
    };
    document.addEventListener("fullscreenchange", updateFsIcon);
    document.addEventListener("webkitfullscreenchange", updateFsIcon);
  }

  els.tvModeButton.addEventListener("click", () => {
    const enabled = document.body.classList.toggle("is-tv");
    els.tvModeButton.setAttribute("aria-pressed", String(enabled));
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });

  window.addEventListener("keydown", handleKeydown);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateProgress();
    }
  });

  bindLyricsEvents();
  bindMoreByArtistEvent();
  bindShareTimeEvent();
  bindPipEvent();
  bindSleepTimerEvents();
  bindShortcutsHelpEvent();
}

function bindLyricsEvents() {
  if (!els.lyricsToggle) return;
  els.lyricsToggle.addEventListener("click", () => {
    state.lyricsOpen = !state.lyricsOpen;
    els.lyricsToggle.setAttribute("aria-pressed", String(state.lyricsOpen));
    els.lyricsPanel.hidden = !state.lyricsOpen;
    document.body.classList.toggle("lyrics-open", state.lyricsOpen);
    if (state.lyricsOpen) {
      ensureLyricsLoaded();
    }
  });
  els.lyricsClose?.addEventListener("click", () => {
    state.lyricsOpen = false;
    els.lyricsToggle.setAttribute("aria-pressed", "false");
    els.lyricsPanel.hidden = true;
    document.body.classList.remove("lyrics-open");
  });
}

function bindMoreByArtistEvent() {
  if (!els.moreByArtistButton) return;
  els.moreByArtistButton.addEventListener("click", () => {
    const track = state.tracks[state.currentIndex];
    if (!track) return;
    const { artist } = parseTrackTitle(track.title, track.channel);
    if (!artist) {
      setStatus("Could not detect the artist of this track.", true);
      return;
    }
    if (els.searchInput) {
      els.searchInput.value = artist;
      els.searchInput.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    runHqArtistSearch(artist);
  });
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function saveHqResultsAsPlaylist() {
  if (!state.searchHqMode || state.searchResults.length === 0) {
    setStatus("Run an artist HQ search first.", true);
    return;
  }

  const artist = state.searchQuery;
  const tracks = state.searchResults.map((result, index) =>
    normalizeTrack(
      {
        videoId: result.videoId,
        title: result.title,
        channel: result.channel || artist,
        durationText: result.durationText || "",
        thumbnail: result.thumbnail || thumbnailFor(result.videoId),
        url: `https://www.youtube.com/watch?v=${result.videoId}`,
        source: "hq-collection"
      },
      index
    )
  );

  const playlistId = `hq-${artist.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  const libraryItem = {
    id: playlistId,
    title: `${artist} – HQ Collection`,
    type: "hq-playlist",
    listId: "",
    videoId: tracks[0]?.videoId || "",
    watchUrl: `https://www.youtube.com/watch?v=${tracks[0]?.videoId || ""}`,
    importedAt: new Date().toISOString(),
    tracks
  };

  // Replace any existing HQ playlist for this artist (newest version wins)
  const existingArtistKey = `${artist.toLowerCase()} – hq collection`;
  state.library = [
    libraryItem,
    ...state.library.filter((item) => String(item.title || "").toLowerCase() !== existingArtistKey)
  ].slice(0, MAX_LIBRARY_ITEMS);

  saveState();
  renderLibrary();
  renderStats();

  setStatus(`✓ Saved "${artist} – HQ Collection" with ${tracks.length} videos to your Mixes library.`);

  // Scroll the library panel into view so user sees the new playlist
  els.mixLibrary.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runHqArtistSearch(artist) {
  state.searchQuery = artist;
  state.searching = true;
  state.searchHqMode = true;
  els.searchResultsShell.hidden = false;
  els.searchClear.hidden = false;
  els.searchStatus.classList.remove("is-error");
  els.searchStatus.textContent = `Finding high-quality videos by ${artist} — this can take 5-10 seconds (running 6 parallel searches and filtering out covers, lyric videos, and low-quality uploads)...`;
  els.searchResults.innerHTML = "";

  try {
    const response = await fetch(`/api/hq-artist?artist=${encodeURIComponent(artist)}`);
    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error || "HQ search failed.");
    }

    state.searchResults = Array.isArray(payload.results) ? payload.results : [];
    state.searching = false;
    state.searchHqStats = { candidates: payload.candidates, queriesRun: payload.queriesRun };
    renderSearch();
  } catch (error) {
    state.searching = false;
    state.searchResults = [];
    state.searchHqMode = false;
    els.searchStatus.classList.add("is-error");
    els.searchStatus.textContent = error?.message || "HQ search failed. Try again.";
    els.searchResults.innerHTML = "";
  }
}

function bindShareTimeEvent() {
  if (!els.shareTimeButton) return;
  els.shareTimeButton.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.search = "";
    const t = Math.floor(getCurrentTime());
    const track = state.tracks[state.currentIndex];
    if (track?.videoId) {
      url.searchParams.set("source", `https://www.youtube.com/watch?v=${track.videoId}${state.source?.listId ? `&list=${state.source.listId}` : ""}`);
    } else if (state.source?.watchUrl) {
      url.searchParams.set("source", state.source.watchUrl);
    }
    if (t > 0) url.searchParams.set("t", String(t));
    copyText(url.toString(), `Link copied — starts at ${formatTime(t)}.`);
  });
}

function bindPipEvent() {
  if (!els.pipButton) return;
  els.pipButton.addEventListener("click", togglePictureInPicture);
}

function bindSleepTimerEvents() {
  if (!els.sleepTimerButton) return;
  els.sleepTimerButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const expanded = els.sleepTimerButton.getAttribute("aria-expanded") === "true";
    els.sleepTimerButton.setAttribute("aria-expanded", String(!expanded));
    els.sleepTimerMenu.hidden = expanded;
  });

  els.sleepTimerMenu?.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-sleep]");
    if (!target) return;
    const value = target.dataset.sleep;
    setSleepTimer(value);
    els.sleepTimerMenu.hidden = true;
    els.sleepTimerButton.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("click", (event) => {
    if (!els.sleepTimerMenu) return;
    if (els.sleepTimerMenu.hidden) return;
    if (event.target.closest(".sleep-timer-wrap")) return;
    els.sleepTimerMenu.hidden = true;
    els.sleepTimerButton?.setAttribute("aria-expanded", "false");
  });
}

function bindShortcutsHelpEvent() {
  if (!els.keyboardHelpButton) return;
  els.keyboardHelpButton.addEventListener("click", () => {
    els.shortcutsDialog?.showModal?.();
  });
}

function handleKeydown(event) {
  if (event.target.closest("input, select, textarea")) {
    return;
  }

  if (event.target.closest("dialog[open]")) {
    return;
  }

  const key = event.key;
  const lower = typeof key === "string" ? key.toLowerCase() : "";

  if (event.code === "Space" || lower === "k") {
    event.preventDefault();
    togglePlayback();
    return;
  }

  if (key === "ArrowRight" || lower === "l") {
    event.preventDefault();
    seekBy(10);
    return;
  }

  if (key === "ArrowLeft" || lower === "j") {
    event.preventDefault();
    seekBy(-10);
    return;
  }

  if (lower === "n") {
    nextTrack();
    return;
  }

  if (lower === "b" || lower === "p") {
    previousTrack();
    return;
  }

  if (lower === "f") {
    event.preventDefault();
    togglePlayerFullscreen();
    return;
  }

  if (lower === "m") {
    event.preventDefault();
    toggleMute();
    return;
  }

  if (lower === "s") {
    event.preventDefault();
    els.shuffleButton.click();
    return;
  }

  if (lower === "r") {
    event.preventDefault();
    els.repeatButton.click();
    return;
  }

  if (key >= "0" && key <= "9") {
    event.preventDefault();
    const fraction = Number(key) / 10;
    const duration = getDuration();
    if (duration > 0 && player?.seekTo) {
      player.seekTo(duration * fraction, true);
      updateProgress();
    }
    return;
  }

  if (key === "?" || (event.shiftKey && key === "/")) {
    event.preventDefault();
    els.shortcutsDialog?.showModal?.();
    return;
  }
}

function togglePlayerFullscreen() {
  if (!els.videoShell) return;
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (isFs) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } else {
    (els.videoShell.requestFullscreen || els.videoShell.webkitRequestFullscreen)?.call(els.videoShell);
  }
}

function toggleMute() {
  if (!player) return;
  const isMuted = player.isMuted?.() ?? false;
  if (isMuted) {
    player.unMute?.();
    if (state.preMuteVolume > 0) {
      player.setVolume?.(state.preMuteVolume);
      els.volumeSlider.value = String(state.preMuteVolume);
      state.volume = state.preMuteVolume;
    }
    setStatus("Unmuted");
  } else {
    state.preMuteVolume = state.volume;
    player.mute?.();
    setStatus("Muted (press M to unmute)");
  }
  saveState();
}

async function loadInitialSource() {
  const params = new URLSearchParams(window.location.search);
  const sharedIds = params.get("ids");
  const sharedSource = params.get("source");
  const startTime = Number(params.get("t") || 0);

  if (sharedIds) {
    const tracks = sharedIds
      .split(",")
      .map((id, index) => normalizeTrack({ videoId: id, thumbnail: thumbnailFor(id) }, index));
    setMix({
      source: {
        id: makeId("shared"),
        title: "Shared YouTube queue",
        type: "queue",
        watchUrl: youtubeWatchUrl(tracks[0]?.videoId || "")
      },
      tracks,
      play: false,
      nativeListMode: false
    });
    if (startTime > 0) seekToWhenReady(startTime);
    return;
  }

  const savedMix = state.library[0];

  if (sharedSource) {
    await loadSource(sharedSource, { play: false });
    if (startTime > 0) seekToWhenReady(startTime);
  } else if (savedMix) {
    loadLibraryMix(savedMix.id, { play: false });
  } else {
    els.youtubeUrl.value = STARTER_URL;
    await loadSource(STARTER_URL, { play: false });
  }
}

function seekToWhenReady(seconds) {
  // Wait for player to be ready, then seek
  const tryNow = () => {
    if (player?.seekTo && getDuration() > 0) {
      player.seekTo(seconds, true);
      setStatus(`Started at ${formatTime(seconds)} from shared link.`);
      return true;
    }
    return false;
  };
  if (tryNow()) return;

  let attempts = 0;
  const interval = window.setInterval(() => {
    attempts += 1;
    if (tryNow() || attempts > 20) {
      window.clearInterval(interval);
    }
  }, 500);
}

async function loadSource(rawUrl, { play = false } = {}) {
  const url = rawUrl || STARTER_URL;
  let parsed;

  try {
    parsed = parseYoutubeUrl(url);
  } catch (error) {
    setStatus(error.message || "That YouTube URL could not be read.", true);
    return;
  }

  els.youtubeUrl.value = parsed.input || url;
  setStatus(parsed.generatedMix ? "Building generated Mix from this video" : "Reading playlist");

  try {
    const response = await fetch("/api/resolve-youtube", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });
    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error || "YouTube did not return this queue.");
    }

    const tracks = payload.tracks.map((track, index) => normalizeTrack(track, index));
    const nativeListMode = !payload.extracted && Boolean(payload.source?.listId);

    setMix({
      source: payload.source,
      tracks,
      play,
      nativeListMode
    });
  } catch (error) {
    const fallbackTrack = parsed.videoId
      ? normalizeTrack(
          {
            videoId: parsed.videoId,
            title: parsed.generatedMix ? "Generated YouTube Mix" : "YouTube video",
            thumbnail: thumbnailFor(parsed.videoId),
            url: parsed.watchUrl
          },
          0
        )
      : null;

    setMix({
      source: {
        id: parsed.listId || parsed.videoId,
        title: parsed.generatedMix ? "Generated YouTube Mix" : parsed.isMix ? "YouTube Mix" : "YouTube playlist",
        type: parsed.type,
        listId: parsed.listId,
        videoId: parsed.videoId,
        generatedMix: parsed.generatedMix,
        watchUrl: parsed.watchUrl,
        importedAt: new Date().toISOString()
      },
      tracks: fallbackTrack ? [fallbackTrack] : [],
      play,
      nativeListMode: Boolean(parsed.listId)
    });
    setStatus(`Loaded by YouTube player. Queue details will fill in as YouTube exposes them.`, false);
  }
}

function setMix({ source, tracks, play = false, nativeListMode = false }) {
  state.source = {
    ...source,
    id: source.id || source.listId || source.videoId || makeId("source")
  };
  state.tracks = tracks.map((track, index) => normalizeTrack(track, index));
  state.currentIndex = Math.min(Math.max(source.index || 0, 0), Math.max(0, state.tracks.length - 1));
  state.nativeListMode = nativeListMode;
  state.nativeListLoaded = false;
  state.shuffleOrder = state.shuffle ? shuffledIndexes(state.tracks.length, state.currentIndex) : [];
  upsertLibraryMix();
  saveState();
  renderAll();

  if (state.playerReady) {
    if (state.nativeListMode) {
      loadNativeList({ play });
    } else {
      playAt(state.currentIndex, { play });
    }
  }
}

function upsertLibraryMix() {
  if (!state.source || state.tracks.length === 0) {
    return;
  }

  const id = state.source.id;
  const libraryItem = {
    id,
    title: state.source.title || state.tracks[0]?.title || "YouTube Mix",
    type: state.source.type || "mix",
    listId: state.source.listId || "",
    videoId: state.source.videoId || state.tracks[0]?.videoId || "",
    watchUrl: state.source.watchUrl || youtubeWatchUrl(state.tracks[0]?.videoId || "", state.source.listId || ""),
    importedAt: state.source.importedAt || new Date().toISOString(),
    tracks: state.tracks
  };
  const nextLibrary = state.library.filter((item) => item.id !== id);
  state.library = [libraryItem, ...nextLibrary].slice(0, MAX_LIBRARY_ITEMS);
}

function loadLibraryMix(id, { play = true } = {}) {
  const item = state.library.find((mix) => mix.id === id);

  if (!item) {
    return;
  }

  setMix({
    source: {
      id: item.id,
      title: item.title,
      type: item.type,
      listId: item.listId,
      videoId: item.videoId,
      watchUrl: item.watchUrl,
      importedAt: item.importedAt
    },
    tracks: item.tracks,
    play,
    nativeListMode: item.tracks.length <= 1 && Boolean(item.listId)
  });
}

function removeLibraryMix(id) {
  state.library = state.library.filter((mix) => mix.id !== id);
  saveState();
  renderLibrary();
  renderStats();
}

function playAt(index, { play = true } = {}) {
  if (!state.tracks[index] || !player) {
    return;
  }

  state.currentIndex = index;
  rememberRecent(state.tracks[index].videoId);

  if (state.nativeListMode) {
    if (!state.nativeListLoaded) {
      loadNativeList({ play });
    } else if (player.playVideoAt) {
      player.playVideoAt(index);
    }
  } else if (play) {
    player.loadVideoById(state.tracks[index].videoId);
  } else {
    player.cueVideoById(state.tracks[index].videoId);
  }

  renderAll();
  updateMediaSession();

  if (state.lyricsOpen) {
    ensureLyricsLoaded();
  }
}

function rememberRecent(videoId) {
  if (!videoId) return;
  state.recentlyPlayed = [videoId, ...state.recentlyPlayed.filter((id) => id !== videoId)].slice(0, RECENT_HISTORY_LIMIT);
}

function loadNativeList({ play = false } = {}) {
  if (!player || !state.source?.listId) {
    return;
  }

  state.nativeListLoaded = true;
  const command = play ? player.loadPlaylist : player.cuePlaylist;

  command.call(player, {
    listType: "playlist",
    list: state.source.listId,
    index: state.currentIndex,
    startSeconds: 0
  });

  if (player.setLoop) {
    player.setLoop(state.repeat !== "off");
  }

  if (player.setShuffle && state.shuffle) {
    player.setShuffle(true);
  }
}

function togglePlayback() {
  if (!player || state.tracks.length === 0) {
    loadSource(els.youtubeUrl.value || STARTER_URL, { play: true });
    return;
  }

  const playerState = player.getPlayerState?.();

  if (playerState === window.YT?.PlayerState?.PLAYING) {
    player.pauseVideo();
  } else {
    if (state.nativeListMode && !state.nativeListLoaded) {
      loadNativeList({ play: true });
    } else {
      player.playVideo();
    }
  }
}

function nextTrack() {
  if (state.nativeListMode && state.nativeListLoaded && player?.nextVideo) {
    player.nextVideo();
    syncNativePlaylist();
    return;
  }

  const next = getNextIndex();

  if (next !== -1) {
    playAt(next, { play: true });
  }
}

function previousTrack() {
  if (state.nativeListMode && state.nativeListLoaded && player?.previousVideo) {
    player.previousVideo();
    syncNativePlaylist();
    return;
  }

  if (getCurrentTime() > 5) {
    player?.seekTo?.(0, true);
    return;
  }

  const previous = state.currentIndex > 0 ? state.currentIndex - 1 : state.repeat === "all" ? state.tracks.length - 1 : 0;
  playAt(previous, { play: true });
}

function getNextIndex() {
  if (state.tracks.length === 0) {
    return -1;
  }

  if (state.repeat === "one") {
    return state.currentIndex;
  }

  if (state.shuffle) {
    // Smart shuffle: prefer tracks not in recentlyPlayed
    const recent = new Set(state.recentlyPlayed);
    const candidates = state.tracks
      .map((track, idx) => ({ track, idx }))
      .filter(({ idx, track }) => idx !== state.currentIndex && !recent.has(track.videoId));

    if (candidates.length > 0) {
      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      return choice.idx;
    }

    // All tracks played recently — fall back to standard shuffle
    if (state.shuffleOrder.length <= 1) {
      state.shuffleOrder = shuffledIndexes(state.tracks.length, state.currentIndex);
    }

    const currentOrderIndex = state.shuffleOrder.indexOf(state.currentIndex);
    const nextOrderIndex = currentOrderIndex + 1;

    if (nextOrderIndex < state.shuffleOrder.length) {
      return state.shuffleOrder[nextOrderIndex];
    }

    if (state.repeat === "all") {
      state.shuffleOrder = shuffledIndexes(state.tracks.length, state.currentIndex);
      return state.shuffleOrder[1] ?? state.currentIndex;
    }

    return -1;
  }

  if (state.currentIndex < state.tracks.length - 1) {
    return state.currentIndex + 1;
  }

  return state.repeat === "all" ? 0 : -1;
}

function seekBy(seconds) {
  if (!player?.seekTo) {
    return;
  }

  const target = Math.max(0, Math.min(getDuration(), getCurrentTime() + seconds));
  player.seekTo(target, true);
  updateProgress();
}

function toggleFavorite(index) {
  const track = state.tracks[index];

  if (!track) {
    return;
  }

  if (state.favorites.has(track.videoId)) {
    state.favorites.delete(track.videoId);
  } else {
    state.favorites.add(track.videoId);
  }

  saveState();
  renderAll();
}

function onPlayerReady(event) {
  state.playerReady = true;
  player = event.target;
  player.setVolume?.(state.volume);
  els.volumeSlider.value = String(state.volume);
  setStatus("Ready");
  applyQualityPreference();

  if (state.tracks.length > 0) {
    if (state.nativeListMode) {
      loadNativeList({ play: false });
    } else {
      playAt(state.currentIndex, { play: false });
    }
  }

  progressTimer = window.setInterval(updateProgress, 600);
  renderAll();
}

function applySize() {
  for (const preset of SIZE_PRESETS) {
    document.body.classList.toggle(`size-${preset}`, state.size === preset);
  }

  for (const button of els.sizeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.size === state.size));
  }
}

function applyQualityPreference() {
  if (els.qualitySelect && els.qualitySelect.value !== state.quality) {
    els.qualitySelect.value = state.quality;
  }

  if (!player?.setPlaybackQuality || state.quality === "auto") {
    return;
  }

  try {
    player.setPlaybackQuality(state.quality);
  } catch {
    // YouTube ignores quality requests it can't honor — that's fine.
  }
}

async function runSearch(query) {
  state.searchQuery = query;
  state.searching = true;
  state.searchHqMode = false;
  els.searchResultsShell.hidden = false;
  els.searchClear.hidden = false;
  els.searchStatus.classList.remove("is-error");
  els.searchStatus.textContent = `Searching YouTube for "${query}"...`;
  els.searchResults.innerHTML = "";

  try {
    const response = await fetch("/api/search-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 30 })
    });

    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error || "Search failed.");
    }

    state.searchResults = Array.isArray(payload.results) ? payload.results : [];
    state.searching = false;
    renderSearch();
  } catch (error) {
    state.searching = false;
    state.searchResults = [];
    els.searchStatus.classList.add("is-error");
    els.searchStatus.textContent = error?.message || "Search failed. Try again.";
    els.searchResults.innerHTML = "";
  }
}

async function loadStarterPack() {
  if (!els.starterPackButton) {
    return;
  }

  els.starterPackButton.disabled = true;
  els.starterPackStatus.classList.remove("is-error");
  els.starterPackStatus.textContent = "Loading 10 curated mixes (this takes ~20-40 seconds the first time)...";

  try {
    const response = await fetch("/api/starter-pack");
    const payload = await response.json();

    if (!payload.ok || !Array.isArray(payload.mixes) || payload.mixes.length === 0) {
      throw new Error(payload.error || "Starter pack returned no mixes.");
    }

    let added = 0;

    for (const mix of payload.mixes) {
      if (!mix?.source || !Array.isArray(mix.tracks) || mix.tracks.length === 0) {
        continue;
      }

      const id = mix.source.id || mix.source.listId || mix.source.videoId;

      if (!id) {
        continue;
      }

      const libraryItem = {
        id,
        title: mix.source.title || mix.tracks[0]?.title || "YouTube Mix",
        type: mix.source.type || "mix",
        listId: mix.source.listId || "",
        videoId: mix.source.videoId || mix.tracks[0]?.videoId || "",
        watchUrl: mix.source.watchUrl || `https://www.youtube.com/watch?v=${mix.source.videoId || ""}&list=${mix.source.listId || ""}`,
        importedAt: mix.source.importedAt || new Date().toISOString(),
        tracks: mix.tracks
      };

      state.library = [libraryItem, ...state.library.filter((item) => item.id !== id)];
      added += 1;
    }

    state.library = state.library.slice(0, MAX_LIBRARY_ITEMS);
    saveState();
    renderLibrary();
    renderStats();

    els.starterPackStatus.textContent = `Added ${added} mix${added === 1 ? "" : "es"} to your library. Click any mix on the right to play it.`;
  } catch (error) {
    els.starterPackStatus.classList.add("is-error");
    els.starterPackStatus.textContent = error?.message || "Could not load the starter pack. Try again in a moment.";
  } finally {
    els.starterPackButton.disabled = false;
  }
}

function renderSearch() {
  if (!els.searchResults || !els.searchStatus) {
    return;
  }

  const fragment = document.createDocumentFragment();

  if (state.searchResults.length === 0) {
    if (state.searchQuery && !state.searching) {
      els.searchStatus.textContent = `No results for "${state.searchQuery}".`;
    } else if (!state.searching) {
      els.searchStatus.textContent = "";
      els.searchResultsShell.hidden = true;
      els.searchClear.hidden = true;
    }

    els.searchResults.replaceChildren(fragment);
    return;
  }

  els.searchStatus.classList.remove("is-error");
  if (state.searchHqMode) {
    const stats = state.searchHqStats || {};
    els.searchStatus.textContent = `💎 ${state.searchResults.length} HIGH-QUALITY videos by ${state.searchQuery} (filtered ${stats.candidates || 0} candidates from ${stats.queriesRun || 0} parallel searches — only official channels, high-view-count, and verified versions kept). Click "Play as Mix" on any to load YouTube's Mix starting from that song.`;
  } else {
    els.searchStatus.textContent = `${state.searchResults.length} results for "${state.searchQuery}". Click "Play as Mix" to load YouTube's auto-generated Mix from any song.`;
  }

  // HQ mode: insert a prominent "Save as playlist" CTA at the top of results
  if (state.searchHqMode && state.searchResults.length > 0) {
    const cta = document.createElement("div");
    cta.className = "hq-save-cta";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hq-save-button";
    button.dataset.action = "save-hq-playlist";
    button.innerHTML = `💎 Save all ${state.searchResults.length} as "<strong>${escapeHtml(state.searchQuery)} - HQ Collection</strong>" playlist`;
    const hint = document.createElement("p");
    hint.className = "hq-save-hint";
    hint.textContent = "Saves to your Mixes library. You can preview, play, or remove it just like any other mix.";
    cta.append(button, hint);
    fragment.append(cta);
  }

  for (const result of state.searchResults) {
    const card = document.createElement("article");
    card.className = "search-card";

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "search-card-thumb";

    const img = document.createElement("img");
    img.src = result.thumbnail || "";
    img.alt = "";
    img.loading = "lazy";
    thumbWrap.append(img);

    if (result.durationText) {
      const duration = document.createElement("span");
      duration.className = "search-card-duration";
      duration.textContent = result.durationText;
      thumbWrap.append(duration);
    }

    const title = document.createElement("p");
    title.className = "search-card-title";
    title.textContent = result.title;

    const meta = document.createElement("p");
    meta.className = "search-card-meta";
    meta.textContent = [result.channel, result.viewCountText, result.publishedText].filter(Boolean).join(" • ");

    if (state.searchHqMode && result.quality) {
      const badge = document.createElement("span");
      badge.className = "search-card-quality";
      const score = result.quality.score;
      let tier = "good";
      if (score >= 100) tier = "premium";
      else if (score >= 60) tier = "great";
      badge.dataset.tier = tier;
      const tierLabel = tier === "premium" ? "💎 Premium" : tier === "great" ? "⭐ Great" : "✓ Good";
      badge.textContent = `${tierLabel} quality`;
      meta.appendChild(document.createElement("br"));
      meta.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "search-card-actions";

    const mixButton = document.createElement("button");
    mixButton.type = "button";
    mixButton.className = "primary";
    mixButton.dataset.action = "play-mix";
    mixButton.dataset.videoId = result.videoId;
    mixButton.textContent = "Play as Mix";

    const videoButton = document.createElement("button");
    videoButton.type = "button";
    videoButton.dataset.action = "play-video";
    videoButton.dataset.videoId = result.videoId;
    videoButton.textContent = "Just the video";

    actions.append(mixButton, videoButton);
    card.append(thumbWrap, title, meta, actions);
    fragment.append(card);
  }

  els.searchResults.replaceChildren(fragment);
}

function onPlayerStateChange(event) {
  const playerState = window.YT?.PlayerState;
  state.isPlaying = event.data === playerState?.PLAYING;

  if (event.data === playerState?.PLAYING) {
    els.playerCover.hidden = true;
    syncVideoData();
    updateMediaSession();
    requestWakeLock();
    applyQualityPreference();
  }

  if (event.data === playerState?.PAUSED || event.data === playerState?.ENDED) {
    releaseWakeLock();
  }

  if (event.data === playerState?.ENDED) {
    const track = state.tracks[state.currentIndex];

    if (track) {
      state.played.add(track.videoId);
      saveState();
    }

    // End-of-track sleep timer
    if (state.sleepTimer.mode === "end-of-track") {
      state.sleepTimer = { mode: null, endTime: 0 };
      updateSleepTimerLabel();
      setStatus("Sleep timer fired — playback stopped after this song.");
      return;
    }

    if (!state.nativeListMode) {
      nextTrack();
    }
  }

  if (state.nativeListMode) {
    syncNativePlaylist();
  }

  renderAll();
}

function onAutoplayBlocked() {
  setStatus("Press Play to start this mix.");
  state.isPlaying = false;
  renderControls();
}

function syncNativePlaylist() {
  if (!player?.getPlaylist || !state.nativeListMode) {
    return;
  }

  const ids = player.getPlaylist() || [];
  const playerIndex = Number(player.getPlaylistIndex?.());

  if (ids.length > state.tracks.length) {
    state.tracks = ids.map((id, index) => {
      const existing = state.tracks.find((track) => track.videoId === id);
      return existing || normalizeTrack({ videoId: id, thumbnail: thumbnailFor(id) }, index);
    });
    upsertLibraryMix();
    saveState();
  }

  if (Number.isFinite(playerIndex) && playerIndex >= 0 && playerIndex < state.tracks.length) {
    state.currentIndex = playerIndex;
  }
}

function syncVideoData() {
  const data = player?.getVideoData?.();
  const track = state.tracks[state.currentIndex];

  if (!data || !track) {
    return;
  }

  if (data.title && (!track.title || track.title.startsWith("YouTube video"))) {
    track.title = data.title;
  }

  if (data.author && !track.channel) {
    track.channel = data.author;
  }

  upsertLibraryMix();
  saveState();
}

function getCurrentTime() {
  return Number(player?.getCurrentTime?.()) || 0;
}

function getDuration() {
  return Number(player?.getDuration?.()) || 0;
}

function updateProgress() {
  const duration = getDuration();
  const current = getCurrentTime();

  if (!state.isSeeking) {
    els.seekSlider.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
  }

  els.elapsedTime.textContent = formatTime(current);
  els.durationTime.textContent = formatTime(duration);

  if (state.lyricsOpen) {
    syncLyricsToPlayback();
  }
}

function renderAll() {
  renderNowPlaying();
  renderControls();
  renderModes();
  renderQueue();
  renderLibrary();
  renderStats();
}

function renderNowPlaying() {
  const track = state.tracks[state.currentIndex];
  const source = state.source;

  if (!track) {
    els.trackTitle.textContent = "YouTube Mix Player";
    els.trackMeta.textContent = "Load a YouTube Mix, playlist, or video.";
    els.coverTitle.textContent = "Load a YouTube Mix";
    els.coverImage.removeAttribute("src");
    return;
  }

  els.trackTitle.textContent = track.title;
  els.trackMeta.textContent = [track.channel, source?.title, `${state.currentIndex + 1} of ${state.tracks.length}`]
    .filter(Boolean)
    .join(" | ");
  els.coverTitle.textContent = source?.title || track.title;
  els.coverImage.src = track.thumbnail || thumbnailFor(track.videoId);
  els.coverImage.alt = "";
}

function renderControls() {
  els.playButton.textContent = state.isPlaying ? "Pause" : "Play";
  const hasTracks = state.tracks.length > 0;
  [els.previousButton, els.rewindButton, els.playButton, els.forwardButton, els.nextButton].forEach((button) => {
    button.disabled = !hasTracks && button !== els.playButton;
  });
}

function renderModes() {
  els.shuffleButton.setAttribute("aria-pressed", String(state.shuffle));
  els.repeatButton.dataset.repeat = state.repeat;
  els.repeatButton.textContent =
    state.repeat === "all" ? "Repeat all" : state.repeat === "one" ? "Repeat one" : "Repeat off";
}

function renderQueue() {
  const fragment = document.createDocumentFragment();
  const visibleTracks = state.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => {
      const matchesSearch =
        !state.filter ||
        track.title.toLowerCase().includes(state.filter) ||
        track.channel.toLowerCase().includes(state.filter);
      const matchesFavorite = !state.favoritesOnly || state.favorites.has(track.videoId);
      return matchesSearch && matchesFavorite;
    });

  for (const { track, index } of visibleTracks) {
    const item = document.createElement("li");
    item.className = [
      "queue-item",
      index === state.currentIndex ? "is-active" : "",
      state.played.has(track.videoId) ? "is-played" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const thumbButton = document.createElement("button");
    thumbButton.className = "queue-thumb";
    thumbButton.type = "button";
    thumbButton.dataset.action = "play";
    thumbButton.dataset.index = String(index);
    thumbButton.setAttribute("aria-label", `Play ${track.title}`);

    const img = document.createElement("img");
    img.src = track.thumbnail || thumbnailFor(track.videoId);
    img.alt = "";
    img.loading = "lazy";

    const queueIndex = document.createElement("span");
    queueIndex.className = "queue-index";
    queueIndex.textContent = String(index + 1);

    thumbButton.append(img, queueIndex);

    const body = document.createElement("div");
    const title = document.createElement("p");
    title.className = "queue-title";
    title.textContent = track.title;
    const channel = document.createElement("p");
    channel.className = "queue-channel";
    channel.textContent = [track.channel, track.durationText].filter(Boolean).join(" | ");
    body.append(title, channel);

    const actions = document.createElement("div");
    actions.className = "queue-actions";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.dataset.action = "play";
    playButton.dataset.index = String(index);
    playButton.textContent = index === state.currentIndex ? "Now" : "Play";

    const favoriteButton = document.createElement("button");
    favoriteButton.className = "favorite-button";
    favoriteButton.type = "button";
    favoriteButton.dataset.action = "favorite";
    favoriteButton.dataset.index = String(index);
    favoriteButton.setAttribute("aria-pressed", String(state.favorites.has(track.videoId)));
    favoriteButton.textContent = state.favorites.has(track.videoId) ? "Saved" : "Save";

    actions.append(playButton, favoriteButton);
    item.append(thumbButton, body, actions);
    fragment.append(item);
  }

  els.queueList.replaceChildren(fragment);
  els.queueCount.textContent = String(state.tracks.length);
  els.favoritesFilter.setAttribute("aria-pressed", String(state.favoritesOnly));
}

function renderLibrary() {
  const fragment = document.createDocumentFragment();

  for (const mix of state.library) {
    const isPreviewed = state.previewedMixId === mix.id;
    const card = document.createElement("article");
    card.className = `mix-card${state.source?.id === mix.id ? " is-active" : ""}${isPreviewed ? " is-previewed" : ""}`;

    const strip = document.createElement("div");
    strip.className = "mix-strip";

    for (const track of mix.tracks.slice(0, 4)) {
      const img = document.createElement("img");
      img.src = track.thumbnail || thumbnailFor(track.videoId);
      img.alt = "";
      img.loading = "lazy";
      strip.append(img);
    }

    const title = document.createElement("h3");
    title.textContent = mix.title || "YouTube Mix";

    const meta = document.createElement("p");
    meta.textContent = `${mix.tracks.length} videos`;

    const actions = document.createElement("div");
    actions.className = "mix-card-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.dataset.action = "load-mix";
    loadButton.dataset.id = mix.id;
    loadButton.textContent = "Load";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.dataset.action = "preview-mix";
    previewButton.dataset.id = mix.id;
    previewButton.textContent = isPreviewed ? "Hide songs" : "See songs";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.dataset.action = "remove-mix";
    removeButton.dataset.id = mix.id;
    removeButton.textContent = "Remove";

    actions.append(loadButton, previewButton, removeButton);
    card.append(strip, title, meta, actions);

    if (isPreviewed) {
      const previewPanel = document.createElement("div");
      previewPanel.className = "mix-preview-panel";

      const list = document.createElement("ol");
      list.className = "mix-preview-list";

      for (const track of mix.tracks) {
        const item = document.createElement("li");
        item.className = "mix-preview-item";

        const thumb = document.createElement("img");
        thumb.src = track.thumbnail || thumbnailFor(track.videoId);
        thumb.alt = "";
        thumb.loading = "lazy";

        const body = document.createElement("div");
        body.className = "mix-preview-body";

        const trackTitle = document.createElement("p");
        trackTitle.className = "mix-preview-title";
        trackTitle.textContent = track.title;

        const trackMeta = document.createElement("p");
        trackMeta.className = "mix-preview-meta";
        trackMeta.textContent = [track.channel, track.durationText].filter(Boolean).join(" • ");

        body.append(trackTitle, trackMeta);
        item.append(thumb, body);
        list.append(item);
      }

      previewPanel.append(list);
      card.append(previewPanel);
    }

    fragment.append(card);
  }

  if (state.library.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No mixes imported yet.";
    fragment.append(empty);
  }

  els.mixLibrary.replaceChildren(fragment);
}

function renderStats() {
  els.playedCount.textContent = String(state.played.size);
  els.savedCount.textContent = String(state.favorites.size);
  els.mixCount.textContent = String(state.library.length);
  els.mixLibraryCount.textContent = String(state.library.length);
}

function setStatus(message, isError = false) {
  els.statusLine.textContent = message;
  els.statusLine.style.color = isError ? "var(--red-strong)" : "var(--green)";
}

function buildShareUrl() {
  const url = new URL(window.location.href);
  url.search = "";

  if (state.source?.watchUrl) {
    url.searchParams.set("source", state.source.watchUrl);
  } else if (state.tracks.length > 0) {
    url.searchParams.set("ids", state.tracks.map((track) => track.videoId).join(","));
  }

  return url.toString();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch {
    setStatus("Copy failed. The link is still in the address bar.", true);
  }
}

function openCurrentOnYoutube() {
  const track = state.tracks[state.currentIndex];

  if (!track) {
    return;
  }

  const url = state.source?.watchUrl || youtubeWatchUrl(track.videoId, state.source?.listId || "");
  window.open(url, "_blank", "noopener,noreferrer");
}

function updateMediaSession() {
  if (!("mediaSession" in navigator)) {
    return;
  }

  const track = state.tracks[state.currentIndex];

  if (!track) {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.channel || state.source?.title || "YouTube",
    album: state.source?.title || "YouTube Mix",
    artwork: [
      {
        src: track.thumbnail || thumbnailFor(track.videoId),
        sizes: "480x360",
        type: "image/jpeg"
      }
    ]
  });

  navigator.mediaSession.setActionHandler("play", () => player?.playVideo?.());
  navigator.mediaSession.setActionHandler("pause", () => player?.pauseVideo?.());
  navigator.mediaSession.setActionHandler("previoustrack", previousTrack);
  navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
  navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-10));
  navigator.mediaSession.setActionHandler("seekforward", () => seekBy(10));
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) {
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) {
    return;
  }

  try {
    await wakeLock.release();
  } catch {
    // The browser can release this automatically.
  }

  wakeLock = null;
}

function setSleepTimer(value) {
  clearSleepTimer();

  if (value === "off" || value === null) {
    state.sleepTimer = { mode: null, endTime: 0 };
    setStatus("Sleep timer cancelled.");
    updateSleepTimerLabel();
    return;
  }

  if (value === "end-of-track") {
    state.sleepTimer = { mode: "end-of-track", endTime: 0 };
    setStatus("Sleep timer set: stops after this song ends.");
    updateSleepTimerLabel();
    return;
  }

  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const endTime = Date.now() + minutes * 60 * 1000;
  state.sleepTimer = { mode: "minutes", endTime };

  sleepTimerTimeoutId = window.setTimeout(() => {
    player?.pauseVideo?.();
    state.sleepTimer = { mode: null, endTime: 0 };
    setStatus("Sleep timer fired — playback paused.");
    updateSleepTimerLabel();
  }, minutes * 60 * 1000);

  sleepTimerCountdownId = window.setInterval(updateSleepTimerLabel, 30000);

  updateSleepTimerLabel();
  setStatus(`Sleep timer set for ${minutes} minute${minutes === 1 ? "" : "s"}.`);
}

function clearSleepTimer() {
  if (sleepTimerTimeoutId) {
    window.clearTimeout(sleepTimerTimeoutId);
    sleepTimerTimeoutId = 0;
  }
  if (sleepTimerCountdownId) {
    window.clearInterval(sleepTimerCountdownId);
    sleepTimerCountdownId = 0;
  }
}

function updateSleepTimerLabel() {
  if (!els.sleepTimerLabel || !els.sleepTimerButton) return;

  if (state.sleepTimer.mode === "minutes") {
    const remainingMs = state.sleepTimer.endTime - Date.now();
    if (remainingMs <= 0) {
      els.sleepTimerLabel.textContent = "Sleep timer";
      els.sleepTimerButton.classList.remove("is-active");
      return;
    }
    const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
    els.sleepTimerLabel.textContent = `Sleeps in ${minutes}m`;
    els.sleepTimerButton.classList.add("is-active");
    return;
  }

  if (state.sleepTimer.mode === "end-of-track") {
    els.sleepTimerLabel.textContent = "Sleeps after song";
    els.sleepTimerButton.classList.add("is-active");
    return;
  }

  els.sleepTimerLabel.textContent = "Sleep timer";
  els.sleepTimerButton.classList.remove("is-active");
}

async function togglePictureInPicture() {
  try {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      pipWindow = null;
      els.pipButton.classList.remove("is-active");
      return;
    }

    if (!("documentPictureInPicture" in window)) {
      // Try the iframe element directly (works in some browsers)
      const iframe = els.videoShell?.querySelector("iframe");
      if (iframe?.requestPictureInPicture) {
        await iframe.requestPictureInPicture();
        els.pipButton.classList.add("is-active");
        return;
      }
      setStatus("Picture-in-Picture is not available in this browser. Try Chrome or Edge.", true);
      return;
    }

    const playerEl = document.getElementById("player");
    if (!playerEl) return;

    const placeholder = document.createElement("div");
    placeholder.id = "pip-placeholder";
    playerEl.parentNode.insertBefore(placeholder, playerEl);

    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 480,
      height: 270
    });

    // Copy stylesheets so the PiP window has the same styles for the iframe
    [...document.styleSheets].forEach((sheet) => {
      try {
        const cssText = [...sheet.cssRules].map((r) => r.cssText).join("\n");
        const styleEl = document.createElement("style");
        styleEl.textContent = cssText;
        pipWindow.document.head.appendChild(styleEl);
      } catch {
        // Cross-origin stylesheet — skip.
      }
    });

    pipWindow.document.body.style.margin = "0";
    pipWindow.document.body.style.background = "#000";
    pipWindow.document.body.appendChild(playerEl);
    playerEl.style.width = "100vw";
    playerEl.style.height = "100vh";

    els.pipButton.classList.add("is-active");

    pipWindow.addEventListener("pagehide", () => {
      const ph = document.getElementById("pip-placeholder");
      if (ph) {
        ph.parentNode.insertBefore(playerEl, ph);
        ph.remove();
      }
      playerEl.style.width = "";
      playerEl.style.height = "";
      pipWindow = null;
      els.pipButton.classList.remove("is-active");
    });
  } catch (error) {
    setStatus("Could not start mini player: " + (error?.message || "unknown error"), true);
  }
}

function parseTrackTitle(rawTitle, channel) {
  // YouTube titles often look like "Artist - Song Title (Official Video)"
  const cleaned = String(rawTitle || "")
    .replace(/\s*[\[(](?:official|video|hd|4k|live|audio|lyrics?|mv|mix|remaster(?:ed)?|with lyrics|hq|m\/v).*?[\])]/gi, "")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+-\s+topic\s*$/i, "")
    .trim();

  let artist = "";
  let title = cleaned;

  const dashSplit = cleaned.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2) {
    artist = dashSplit[0].trim();
    title = dashSplit.slice(1).join(" - ").trim();
  } else if (channel) {
    artist = String(channel).replace(/\s+-\s+topic\s*$/i, "").replace(/vevo$/i, "").trim();
  }

  // Clean leftover trailing junk in title
  title = title
    .replace(/\s*\(.*?\)\s*$/g, "")
    .replace(/\s*\[.*?\]\s*$/g, "")
    .trim();

  return { artist, title };
}

async function ensureLyricsLoaded() {
  if (!els.lyricsBody) return;
  const track = state.tracks[state.currentIndex];
  if (!track) {
    els.lyricsBody.replaceChildren();
    els.lyricsStatus.textContent = "Play a song to see lyrics.";
    return;
  }

  const { artist, title } = parseTrackTitle(track.title, track.channel);
  const key = `${artist}::${title}`;

  if (state.lyrics.fetchedKey === key && state.lyrics.lines.length > 0) {
    renderLyrics();
    return;
  }

  if (lyricsAbortController) {
    lyricsAbortController.abort();
  }

  lyricsAbortController = new AbortController();
  els.lyricsStatus.textContent = `Looking up lyrics for "${title}" by ${artist || "unknown artist"}...`;
  els.lyricsBody.replaceChildren();
  state.lyrics = { fetchedKey: key, lines: [], synced: false, plain: "" };

  try {
    const params = new URLSearchParams();
    if (artist) params.set("artist_name", artist);
    if (title) params.set("track_name", title);
    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      signal: lyricsAbortController.signal
    });

    if (!response.ok) {
      // Try the search endpoint as a fallback
      const searchParams = new URLSearchParams({ q: `${artist} ${title}`.trim() });
      const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
        signal: lyricsAbortController.signal
      });
      const searchData = await searchResponse.json();
      const best = Array.isArray(searchData) ? searchData[0] : null;
      if (!best) {
        els.lyricsStatus.textContent = `No lyrics found for "${title}". Try a different song.`;
        return;
      }
      handleLyricsPayload(best, key);
      return;
    }

    const data = await response.json();
    handleLyricsPayload(data, key);
  } catch (error) {
    if (error.name === "AbortError") return;
    els.lyricsStatus.textContent = "Could not load lyrics — check your connection.";
  }
}

function handleLyricsPayload(data, key) {
  if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
    els.lyricsStatus.textContent = "No lyrics available for this song.";
    return;
  }

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    state.lyrics = { fetchedKey: key, lines, synced: true, plain: data.plainLyrics || "" };
    els.lyricsStatus.textContent = `Synced lyrics — ${data.artistName || ""} • ${data.trackName || ""}`;
  } else {
    state.lyrics = { fetchedKey: key, lines: [], synced: false, plain: data.plainLyrics || "" };
    els.lyricsStatus.textContent = `Lyrics (not synced) — ${data.artistName || ""} • ${data.trackName || ""}`;
  }

  renderLyrics();
}

function parseLrc(text) {
  const lines = [];
  const lrcRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(lrcRegex)];
    if (matches.length === 0) continue;
    const lyric = rawLine.replace(lrcRegex, "").trim();
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractional = match[3] ? Number(`0.${match[3]}`) : 0;
      const time = minutes * 60 + seconds + fractional;
      lines.push({ time, text: lyric });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function renderLyrics() {
  if (!els.lyricsBody) return;
  els.lyricsBody.replaceChildren();

  if (state.lyrics.synced && state.lyrics.lines.length > 0) {
    els.lyricsBody.classList.remove("plain");
    const fragment = document.createDocumentFragment();
    state.lyrics.lines.forEach((line, index) => {
      const p = document.createElement("p");
      p.dataset.index = String(index);
      p.dataset.time = String(line.time);
      p.textContent = line.text || "♪";
      fragment.append(p);
    });
    els.lyricsBody.append(fragment);
    return;
  }

  if (state.lyrics.plain) {
    els.lyricsBody.classList.add("plain");
    const fragment = document.createDocumentFragment();
    for (const line of state.lyrics.plain.split(/\r?\n/)) {
      const p = document.createElement("p");
      p.textContent = line.trim() || " ";
      fragment.append(p);
    }
    els.lyricsBody.append(fragment);
  }
}

function syncLyricsToPlayback() {
  if (!state.lyricsOpen || !state.lyrics.synced || state.lyrics.lines.length === 0) return;
  const t = getCurrentTime();
  const lines = state.lyrics.lines;

  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= t) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const paragraphs = els.lyricsBody.children;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    p.classList.toggle("is-active", i === activeIndex);
    p.classList.toggle("is-past", i < activeIndex);
  }

  if (activeIndex >= 0 && activeIndex !== Number(els.lyricsBody.dataset.lastActive || -1)) {
    els.lyricsBody.dataset.lastActive = String(activeIndex);
    const activeP = paragraphs[activeIndex];
    if (activeP) {
      activeP.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function setupCastFlag() {
  window.__onGCastApiAvailable = (isAvailable) => {
    if (!isAvailable) {
      return;
    }

    els.castStatus.textContent = "Cast tools are available. For YouTube-native casting, open the current mix on YouTube.";
  };
}

function loadYouTubeApi() {
  window.onYouTubeIframeAPIReady = initializePlayer;

  if (window.YT?.Player) {
    initializePlayer();
    return;
  }

  if (document.querySelector("script[data-youtube-api]")) {
    return;
  }

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  script.dataset.youtubeApi = "true";
  document.head.append(script);
}

function initializePlayer() {
  if (player || !document.querySelector("#player")) {
    return;
  }

  player = new window.YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: {
      controls: 1,
      enablejsapi: 1,
      playsinline: 1,
      rel: 0,
      origin: window.location.origin
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onAutoplayBlocked
    }
  });
}

function init() {
  bindElements();
  loadSavedState();
  bindEvents();
  setupCastFlag();
  applySize();

  if (els.qualitySelect) {
    els.qualitySelect.value = state.quality;
  }

  renderAll();
  loadYouTubeApi();
  loadInitialSource();
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("pagehide", () => {
  window.clearInterval(progressTimer);
  releaseWakeLock();
});

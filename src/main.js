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
  played: new Set()
};

let player = null;
let progressTimer = 0;
let deferredInstallPrompt = null;
let wakeLock = null;

const els = {};

function bindElements() {
  Object.assign(els, {
    importForm: document.querySelector("#import-form"),
    youtubeUrl: document.querySelector("#youtube-url"),
    installButton: document.querySelector("#install-button"),
    tvModeButton: document.querySelector("#tv-mode-button"),
    castButton: document.querySelector("#cast-button"),
    castDialog: document.querySelector("#cast-dialog"),
    castStatus: document.querySelector("#cast-status"),
    fullscreenButton: document.querySelector("#fullscreen-button"),
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
    openYoutubeButton: document.querySelector("#open-youtube-button"),
    clearPlayedButton: document.querySelector("#clear-played-button")
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
      repeat: state.repeat
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
}

function handleKeydown(event) {
  if (event.target.closest("input, select, textarea")) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }

  if (event.key === "ArrowRight") {
    seekBy(10);
  }

  if (event.key === "ArrowLeft") {
    seekBy(-10);
  }

  if (event.key.toLowerCase() === "n") {
    nextTrack();
  }

  if (event.key.toLowerCase() === "b") {
    previousTrack();
  }
}

async function loadInitialSource() {
  const params = new URLSearchParams(window.location.search);
  const sharedIds = params.get("ids");
  const sharedSource = params.get("source");

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
    return;
  }

  const savedMix = state.library[0];

  if (sharedSource) {
    await loadSource(sharedSource, { play: false });
  } else if (savedMix) {
    loadLibraryMix(savedMix.id, { play: false });
  } else {
    els.youtubeUrl.value = STARTER_URL;
    await loadSource(STARTER_URL, { play: false });
  }
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

function onPlayerStateChange(event) {
  const playerState = window.YT?.PlayerState;
  state.isPlaying = event.data === playerState?.PLAYING;

  if (event.data === playerState?.PLAYING) {
    els.playerCover.hidden = true;
    syncVideoData();
    updateMediaSession();
    requestWakeLock();
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
    const card = document.createElement("article");
    card.className = `mix-card${state.source?.id === mix.id ? " is-active" : ""}`;

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

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.dataset.action = "remove-mix";
    removeButton.dataset.id = mix.id;
    removeButton.textContent = "Remove";

    actions.append(loadButton, removeButton);
    card.append(strip, title, meta, actions);
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
  renderAll();
  loadYouTubeApi();
  loadInitialSource();
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("pagehide", () => {
  window.clearInterval(progressTimer);
  releaseWakeLock();
});

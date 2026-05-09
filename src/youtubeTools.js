export const STARTER_URL = "https://youtu.be/WM7-PYtXtJM?si=mFHCA2B_BO7vpKcX";

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function cleanUrlInput(value) {
  const input = String(value || "").trim();

  if (!input) {
    return "";
  }

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (/^(www\.)?(youtube\.com|youtu\.be)\//i.test(input)) {
    return `https://${input}`;
  }

  return input;
}

export function parseYoutubeUrl(value) {
  const input = cleanUrlInput(value);
  let url;

  try {
    url = new URL(input);
  } catch {
    if (VIDEO_ID_PATTERN.test(input)) {
      return buildParsedYoutube({ videoId: input });
    }

    throw new Error("Enter a YouTube URL or video id.");
  }

  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId = "";
  let listId = url.searchParams.get("list") || "";

  if (host === "youtu.be") {
    videoId = parts[0] || "";
  } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else if (["embed", "shorts", "live"].includes(parts[0])) {
      videoId = parts[1] || "";
    } else if (parts[0] === "playlist") {
      videoId = "";
    }
  }

  if (videoId && !VIDEO_ID_PATTERN.test(videoId)) {
    videoId = "";
  }

  if (!videoId && !listId) {
    throw new Error("That URL does not include a YouTube video or playlist id.");
  }

  return buildParsedYoutube({
    input,
    videoId,
    listId,
    index: Number(url.searchParams.get("index") || 0) || 0
  });
}

export function buildParsedYoutube({ input = "", videoId = "", listId = "", index = 0 }) {
  const generatedMix = Boolean(videoId && !listId);
  const resolvedListId = listId || (videoId ? `RD${videoId}` : "");
  const isMix = resolvedListId.startsWith("RD") || resolvedListId.startsWith("UL");
  const type = isMix ? "mix" : resolvedListId ? "playlist" : "video";
  const watchUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}${resolvedListId ? `&list=${resolvedListId}` : ""}${generatedMix ? "&start_radio=1" : ""}`
    : `https://www.youtube.com/playlist?list=${resolvedListId}`;

  return {
    input,
    videoId,
    listId: resolvedListId,
    originalListId: listId,
    generatedMix,
    isMix,
    type,
    index: Math.max(0, index - 1),
    watchUrl
  };
}

export function thumbnailFor(videoId, quality = "hqdefault") {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : "";
}

export function youtubeWatchUrl(videoId, listId = "") {
  if (!videoId) {
    return listId ? `https://www.youtube.com/playlist?list=${listId}` : "https://www.youtube.com/";
  }

  return `https://www.youtube.com/watch?v=${videoId}${listId ? `&list=${listId}` : ""}`;
}

export function normalizeTrack(track, index = 0) {
  const videoId = track.videoId || track.id || "";
  const title = track.title || (videoId ? `YouTube video ${videoId}` : "Untitled video");

  return {
    id: videoId,
    videoId,
    title,
    channel: track.channel || track.author || "",
    durationText: track.durationText || track.duration || "",
    thumbnail: track.thumbnail || thumbnailFor(videoId),
    url: track.url || youtubeWatchUrl(videoId),
    source: track.source || "youtube",
    position: Number.isFinite(track.position) ? track.position : index
  };
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${secs}`;
  }

  return `${mins}:${secs}`;
}

export function makeId(prefix = "mix") {
  const bytes = new Uint8Array(8);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function shuffledIndexes(length, currentIndex = 0) {
  const indexes = Array.from({ length }, (_, index) => index).filter((index) => index !== currentIndex);

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }

  return [currentIndex, ...indexes];
}

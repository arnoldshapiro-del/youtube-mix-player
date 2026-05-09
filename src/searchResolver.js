import { extractInitialData, fetchYoutubeHtml } from "./playlistResolver.js";
import { normalizeTrack, thumbnailFor } from "./youtubeTools.js";
import { rankByQuality } from "./qualityScorer.js";

export async function highQualityArtistSearchRequest({ artist, maxResults = 40 } = {}) {
  const trimmed = String(artist || "").trim();

  if (!trimmed) {
    throw new Error("Pass an artist name.");
  }

  // Run multiple parallel searches with quality-targeting modifiers
  const queries = [
    `${trimmed} official video`,
    `${trimmed} VEVO`,
    `${trimmed} official audio`,
    `${trimmed} live HD`,
    `${trimmed} greatest hits`,
    `${trimmed} live concert`
  ];

  const searchResults = await Promise.allSettled(
    queries.map((q) => runSingleSearch(q, 25))
  );

  const seen = new Set();
  const combined = [];

  for (const search of searchResults) {
    if (search.status !== "fulfilled" || !Array.isArray(search.value)) continue;
    for (const result of search.value) {
      if (seen.has(result.videoId)) continue;
      seen.add(result.videoId);
      combined.push(result);
    }
  }

  const ranked = rankByQuality(combined, trimmed, { minScore: 30 });

  return {
    artist: trimmed,
    count: ranked.length,
    queriesRun: queries.length,
    candidates: combined.length,
    results: ranked.slice(0, maxResults)
  };
}

async function runSingleSearch(query, maxResults) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const html = await fetchYoutubeHtml(url);
    const initialData = extractInitialData(html);
    return collectSearchResults(initialData)
      .slice(0, maxResults)
      .map((item, index) => normalizeSearchResult(item, index));
  } catch {
    return [];
  }
}

export async function searchYoutubeRequest({ query, maxResults = 30 } = {}) {
  const trimmed = String(query || "").trim();

  if (!trimmed) {
    throw new Error("Enter something to search for.");
  }

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmed)}`;
  const html = await fetchYoutubeHtml(url);
  const initialData = extractInitialData(html);
  const rawResults = collectSearchResults(initialData).slice(0, maxResults);
  const results = rawResults.map((item, index) => normalizeSearchResult(item, index));

  return {
    query: trimmed,
    count: results.length,
    results
  };
}

function collectSearchResults(initialData) {
  const seen = new Set();
  const out = [];

  visit(initialData, (node) => {
    const renderer = node.videoRenderer;

    if (!renderer) {
      return;
    }

    const videoId = renderer.videoId;

    if (!videoId || seen.has(videoId)) {
      return;
    }

    seen.add(videoId);
    out.push(renderer);
  });

  return out;
}

function normalizeSearchResult(renderer, index) {
  const videoId = renderer.videoId;
  const thumbnail =
    renderer.thumbnail?.thumbnails?.at(-1)?.url ||
    renderer.richThumbnail?.movingThumbnailRenderer?.movingThumbnailDetails?.thumbnails?.at(-1)?.url ||
    thumbnailFor(videoId);

  const lengthText = textOf(renderer.lengthText);
  const isLive = Boolean(renderer.badges?.some((badge) => /live/i.test(textOf(badge?.metadataBadgeRenderer?.label) || "")));

  const track = normalizeTrack(
    {
      videoId,
      title: textOf(renderer.title) || `YouTube video ${videoId}`,
      channel: textOf(renderer.longBylineText) || textOf(renderer.shortBylineText) || textOf(renderer.ownerText) || "",
      durationText: lengthText,
      thumbnail: thumbnail?.replace(/&amp;/g, "&"),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source: "search"
    },
    index
  );

  return {
    ...track,
    publishedText: textOf(renderer.publishedTimeText) || "",
    viewCountText: textOf(renderer.shortViewCountText) || textOf(renderer.viewCountText) || "",
    isLive,
    mixUrl: `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}&start_radio=1`
  };
}

function textOf(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.simpleText === "string") {
    return value.simpleText;
  }

  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run.text || "").join("").trim();
  }

  if (value.accessibility?.accessibilityData?.label) {
    return value.accessibility.accessibilityData.label;
  }

  return "";
}

function visit(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }

  visitor(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      visit(item, visitor);
    }

    return;
  }

  for (const value of Object.values(node)) {
    visit(value, visitor);
  }
}

import { request as httpsRequest } from "node:https";

import { normalizeTrack, parseYoutubeUrl, thumbnailFor } from "./youtubeTools.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export async function resolveYoutubeRequest({ url, maxResults = 150 } = {}) {
  const parsed = parseYoutubeUrl(url);
  const html = await fetchYoutubeHtml(parsed.watchUrl);
  const initialData = extractInitialData(html);
  const buckets = collectVideoBuckets(initialData);
  const rawTracks = chooseBestBucket(buckets);
  const tracks = rawTracks
    .slice(0, maxResults)
    .map((track, index) => normalizeTrack(track, index));
  const sourceTitle = findPlaylistTitle(initialData) || titleFromHtml(html) || fallbackTitle(parsed);
  const seedTrack = parsed.videoId
    ? normalizeTrack(
        {
          videoId: parsed.videoId,
          title: sourceTitle,
          thumbnail: thumbnailFor(parsed.videoId),
          url: parsed.watchUrl
        },
        0
      )
    : null;

  return {
    source: {
      id: parsed.listId || parsed.videoId,
      title: sourceTitle,
      type: parsed.type,
      listId: parsed.listId,
      videoId: parsed.videoId,
      generatedMix: parsed.generatedMix,
      watchUrl: parsed.watchUrl,
      importedAt: new Date().toISOString()
    },
    tracks: tracks.length > 0 ? tracks : seedTrack ? [seedTrack] : [],
    extracted: tracks.length > 0,
    buckets: {
      panel: buckets.panel.length,
      playlist: buckets.playlist.length,
      compact: buckets.compact.length
    }
  };
}

async function fetchYoutubeHtml(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": USER_AGENT
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube returned ${response.status}.`);
    }

    return await response.text();
  } catch (error) {
    if (!isLocalCertificateError(error)) {
      throw error;
    }

    return fetchYoutubeHtmlWithLocalTlsFallback(url);
  }
}

function isLocalCertificateError(error) {
  const cause = error?.cause;
  const message = `${error?.message || ""} ${cause?.message || ""} ${cause?.code || ""}`;

  return /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|certificate/i.test(message);
}

function fetchYoutubeHtmlWithLocalTlsFallback(url) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        headers: {
          "accept-language": "en-US,en;q=0.9",
          "user-agent": USER_AGENT
        },
        rejectUnauthorized: false,
        timeout: 20000
      },
      (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          reject(new Error(`YouTube returned ${response.statusCode || "an error"}.`));
          response.resume();
          return;
        }

        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Timed out while reading YouTube."));
    });
    request.on("error", reject);
    request.end();
  });
}

export function extractInitialData(html) {
  const marker = "ytInitialData";
  const markerIndex = html.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const start = html.indexOf("{", markerIndex);

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function collectVideoBuckets(initialData) {
  const buckets = {
    panel: [],
    playlist: [],
    compact: []
  };

  visit(initialData, (node) => {
    if (node.playlistPanelVideoRenderer) {
      pushUnique(buckets.panel, rendererToTrack(node.playlistPanelVideoRenderer, "panel"));
    }

    if (node.playlistVideoRenderer) {
      pushUnique(buckets.playlist, rendererToTrack(node.playlistVideoRenderer, "playlist"));
    }

    if (node.compactVideoRenderer) {
      pushUnique(buckets.compact, rendererToTrack(node.compactVideoRenderer, "compact"));
    }
  });

  return buckets;
}

function chooseBestBucket(buckets) {
  if (buckets.panel.length > 0) {
    return buckets.panel;
  }

  if (buckets.playlist.length > 0) {
    return buckets.playlist;
  }

  return buckets.compact;
}

function pushUnique(bucket, track) {
  if (!track?.videoId || bucket.some((item) => item.videoId === track.videoId)) {
    return;
  }

  bucket.push(track);
}

function rendererToTrack(renderer, source) {
  const videoId =
    renderer.videoId ||
    renderer.navigationEndpoint?.watchEndpoint?.videoId ||
    renderer.endpoint?.watchEndpoint?.videoId ||
    "";

  if (!videoId) {
    return null;
  }

  const thumbnail =
    renderer.thumbnail?.thumbnails?.at(-1)?.url ||
    renderer.richThumbnail?.movingThumbnailRenderer?.movingThumbnailDetails?.thumbnails?.at(-1)?.url ||
    thumbnailFor(videoId);

  return {
    videoId,
    title: textOf(renderer.title) || `YouTube video ${videoId}`,
    channel:
      textOf(renderer.shortBylineText) ||
      textOf(renderer.longBylineText) ||
      textOf(renderer.ownerText) ||
      "",
    durationText: textOf(renderer.lengthText) || findDuration(renderer),
    thumbnail: thumbnail?.replace(/&amp;/g, "&"),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    source
  };
}

function findDuration(renderer) {
  const overlays = renderer.thumbnailOverlays || [];

  for (const overlay of overlays) {
    const text = textOf(overlay.thumbnailOverlayTimeStatusRenderer?.text);

    if (text) {
      return text;
    }
  }

  return "";
}

function findPlaylistTitle(initialData) {
  const candidates = [];

  visit(initialData, (node) => {
    if (node.playlistPanelRenderer?.title) {
      candidates.push(textOf(node.playlistPanelRenderer.title));
    }

    if (node.playlistSidebarPrimaryInfoRenderer?.title) {
      candidates.push(textOf(node.playlistSidebarPrimaryInfoRenderer.title));
    }

    if (node.sidebarPlaylistRenderer?.title) {
      candidates.push(textOf(node.sidebarPlaylistRenderer.title));
    }
  });

  return candidates.find(Boolean) || "";
}

function titleFromHtml(html) {
  const match = html.match(/<title>(.*?)<\/title>/is);

  if (!match) {
    return "";
  }

  return decodeHtml(match[1]).replace(/\s+-\s+YouTube\s*$/i, "").trim();
}

function fallbackTitle(parsed) {
  if (parsed.generatedMix) {
    return "Generated YouTube Mix";
  }

  if (parsed.isMix) {
    return "YouTube Mix";
  }

  return "YouTube playlist";
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

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

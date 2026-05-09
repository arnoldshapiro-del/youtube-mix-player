import { resolveYoutubeRequest } from "./playlistResolver.js";
import { searchYoutubeRequest } from "./searchResolver.js";

const SEEDS = [
  { label: "Fleetwood Mac mix", query: "Fleetwood Mac Dreams official", fallbackVideoId: "PgagPdVM7bk" },
  { label: "Eagles mix", query: "Eagles Hotel California live 1977 official", fallbackVideoId: "" },
  { label: "Queen mix", query: "Queen Bohemian Rhapsody official video", fallbackVideoId: "" },
  { label: "The Beatles mix", query: "The Beatles Hey Jude official", fallbackVideoId: "" },
  { label: "Simon & Garfunkel mix", query: "Simon and Garfunkel Bridge Over Troubled Water", fallbackVideoId: "" },
  { label: "Don McLean mix", query: "Don McLean American Pie official", fallbackVideoId: "" },
  { label: "Frank Sinatra mix", query: "Frank Sinatra My Way official", fallbackVideoId: "" },
  { label: "Stevie Wonder mix", query: "Stevie Wonder Superstition live", fallbackVideoId: "" },
  { label: "Bob Dylan mix", query: "Bob Dylan Like a Rolling Stone official", fallbackVideoId: "" },
  { label: "James Taylor mix", query: "James Taylor Fire and Rain official", fallbackVideoId: "" }
];

export async function buildStarterPack() {
  const results = await Promise.allSettled(SEEDS.map(resolveSeed));
  const mixes = results
    .map((entry, index) => {
      if (entry.status !== "fulfilled" || !entry.value) {
        return null;
      }

      return { ...entry.value, seed: SEEDS[index].label };
    })
    .filter(Boolean);

  return {
    count: mixes.length,
    mixes
  };
}

async function resolveSeed(seed) {
  const seedVideo = await findSeedVideo(seed);

  if (!seedVideo?.videoId) {
    return null;
  }

  const mixUrl = `https://www.youtube.com/watch?v=${seedVideo.videoId}&list=RD${seedVideo.videoId}&start_radio=1`;
  const resolved = await resolveYoutubeRequest({ url: mixUrl });

  if (!resolved.tracks || resolved.tracks.length === 0) {
    return null;
  }

  const sourceTitle = preferredTitle({
    resolvedTitle: resolved.source?.title,
    seedTitle: seedVideo.title,
    seedLabel: seed.label
  });

  return {
    source: {
      ...resolved.source,
      title: sourceTitle,
      watchUrl: mixUrl
    },
    tracks: resolved.tracks,
    extracted: resolved.extracted
  };
}

function preferredTitle({ resolvedTitle, seedTitle, seedLabel }) {
  const generic = (value) => !value || /^(YouTube Mix|Generated YouTube Mix|YouTube playlist)$/i.test(value.trim());

  if (!generic(resolvedTitle)) {
    return resolvedTitle;
  }

  if (!generic(seedTitle)) {
    return `${seedLabel} - ${seedTitle}`;
  }

  return seedLabel;
}

async function findSeedVideo(seed) {
  try {
    const search = await searchYoutubeRequest({ query: seed.query, maxResults: 5 });
    const top = search.results?.[0];

    if (top?.videoId) {
      return { videoId: top.videoId, title: top.title || "" };
    }
  } catch {
    // Fall through to fallback below.
  }

  if (seed.fallbackVideoId) {
    return { videoId: seed.fallbackVideoId, title: "" };
  }

  return null;
}

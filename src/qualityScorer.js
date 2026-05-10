// Score YouTube search results by likely audio/visual quality.
// Higher score = better. Used to filter out covers, lyric videos, low-quality uploads.

const BAD_TITLE_KEYWORDS = [
  "cover", "tribute", "karaoke", "instrumental", "lyrics video",
  "8d audio", "8d music", "speed up", "sped up", "slowed", "slowed down",
  "nightcore", "reverb", "loop", "1 hour", "10 hour", "extended",
  "type beat", "remake", "remix by", "ai generated", "ai cover",
  "fan made", "made by", "reaction", "react to", "first time hearing",
  "in the style of", "with rain", "for sleep", "to sleep"
];

const GOOD_TITLE_PATTERNS = [
  /\bofficial\s+(video|audio|music\s*video|mv|lyric\s*video)\b/i,
  /\bofficial\s+visualizer\b/i,
  /\bremaster(ed)?\b/i,
  /\bhd\b|\b4k\b|\b1080p\b|\b2160p\b|\bhq\b/i,
  /\blive\s+(at|in|from|on|concert|performance|session)\b/i,
  /\bvevo\b/i
];

const VERIFIED_CHANNEL_INDICATORS = [
  "vevo", "official", " - topic", "records", "music"
];

function parseViewCount(text) {
  if (!text) return 0;
  // "125M views" / "1.2B views" / "12,345 views"
  const match = String(text).match(/([\d.,]+)\s*([KMB]?)/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return 0;
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") return num * 1_000;
  if (suffix === "M") return num * 1_000_000;
  if (suffix === "B") return num * 1_000_000_000;
  return num;
}

function parseDurationSeconds(text) {
  if (!text) return 0;
  const parts = String(text).split(":").map((part) => Number(part.replace(/[^\d]/g, "")));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function scoreVideoQuality(result, artistName = "") {
  const title = String(result.title || "").toLowerCase();
  const channel = String(result.channel || "").toLowerCase();
  const artistLower = String(artistName || "").toLowerCase().trim();

  const views = parseViewCount(result.viewCountText);
  const durationSec = parseDurationSeconds(result.durationText);

  let score = 0;
  const reasons = [];

  // View count is the strongest single quality signal — popular = vetted by millions.
  if (views >= 500_000_000) { score += 80; reasons.push("500M+ views"); }
  else if (views >= 100_000_000) { score += 60; reasons.push("100M+ views"); }
  else if (views >= 10_000_000) { score += 40; reasons.push("10M+ views"); }
  else if (views >= 1_000_000) { score += 20; reasons.push("1M+ views"); }
  else if (views >= 100_000) { score += 8; reasons.push("100K+ views"); }
  else if (views > 0 && views < 10_000) { score -= 20; reasons.push("low views"); }

  // Verified / official channel
  const channelIsOfficial = VERIFIED_CHANNEL_INDICATORS.some((ind) => channel.includes(ind));
  const channelMatchesArtist = artistLower && (
    channel.includes(artistLower) ||
    artistLower.split(/\s+/).every((word) => word.length > 2 && channel.includes(word))
  );
  if (channelIsOfficial) { score += 25; reasons.push("official channel"); }
  if (channelMatchesArtist) { score += 20; reasons.push("artist channel"); }

  // Universal wrong-artist penalty (ported from arnies-music-vault, May 10 2026).
  // If neither the title nor the channel mentions ANY meaningful artist word,
  // it's almost certainly the wrong artist for an artist-mode search. Pre-fix,
  // popular off-topic videos with high view counts could outrank correct artist
  // results that happened to be less popular.
  const artistWords = artistLower.split(/\s+/).filter((w) => w.length > 2);
  const artistInTitle = artistWords.length > 0 && artistWords.some((w) => title.includes(w));
  const artistInChannelLoose = artistWords.length > 0 && artistWords.some((w) => channel.includes(w));
  if (artistWords.length > 0 && !artistInTitle && !artistInChannelLoose) {
    score -= 60;
    reasons.push("wrong artist");
  }

  // Title-based quality cues
  for (const pattern of GOOD_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      score += 12;
      reasons.push(`title: ${pattern.source.slice(0, 30)}`);
    }
  }

  // Disqualifiers — strong negatives
  for (const bad of BAD_TITLE_KEYWORDS) {
    if (title.includes(bad)) {
      score -= 50;
      reasons.push(`bad: ${bad}`);
      break; // one strike is enough
    }
  }

  // Lyric-video penalty (ported from arnies-music-vault, May 10 2026).
  // The BAD_TITLE_KEYWORDS list catches "lyrics video" (with the s) but not
  // "lyric video" (singular). Many official channels post Lyric Video uploads
  // for songs that DO have a real music video — without this penalty the
  // ranking would prefer the lyric upload because of its 'official' channel.
  // -35 cleanly tips the scale toward real video content when both exist.
  if (/\blyric/i.test(title)) {
    score -= 35;
    reasons.push("lyric video");
  }

  // Duration sanity — too short = clip/short, too long = compilation
  if (durationSec > 0 && durationSec < 60) { score -= 40; reasons.push("too short"); }
  else if (durationSec >= 90 && durationSec <= 480) { score += 8; reasons.push("song length"); }
  else if (durationSec > 1800) { score -= 20; reasons.push("too long"); }

  // Live performance bonus
  if (/\blive\b/i.test(title) && (channelIsOfficial || views >= 1_000_000)) {
    score += 5;
    reasons.push("quality live");
  }

  // Skip live-stream indicators
  if (result.isLive) { score -= 100; reasons.push("currently live"); }

  return { score, reasons, views, durationSec };
}

export function rankByQuality(results, artistName = "", { minScore = 25 } = {}) {
  return results
    .map((result) => ({
      ...result,
      quality: scoreVideoQuality(result, artistName)
    }))
    .filter((r) => r.quality.score >= minScore)
    .sort((a, b) => b.quality.score - a.quality.score);
}

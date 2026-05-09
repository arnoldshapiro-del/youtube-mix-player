import assert from "node:assert/strict";
import test from "node:test";

import { collectVideoBuckets, extractInitialData } from "../src/playlistResolver.js";
import { formatTime, parseYoutubeUrl, thumbnailFor } from "../src/youtubeTools.js";

test("a plain youtu.be video becomes a generated Mix seed", () => {
  const parsed = parseYoutubeUrl("https://youtu.be/WM7-PYtXtJM?si=mFHCA2B_BO7vpKcX");

  assert.equal(parsed.videoId, "WM7-PYtXtJM");
  assert.equal(parsed.listId, "RDWM7-PYtXtJM");
  assert.equal(parsed.generatedMix, true);
  assert.equal(parsed.type, "mix");
  assert.equal(parsed.watchUrl, "https://www.youtube.com/watch?v=WM7-PYtXtJM&list=RDWM7-PYtXtJM&start_radio=1");
});

test("a watch URL keeps the provided playlist id", () => {
  const parsed = parseYoutubeUrl("https://www.youtube.com/watch?v=abc123DEF45&list=PL1234567890");

  assert.equal(parsed.videoId, "abc123DEF45");
  assert.equal(parsed.listId, "PL1234567890");
  assert.equal(parsed.generatedMix, false);
  assert.equal(parsed.type, "playlist");
});

test("formatTime handles minutes and hours", () => {
  assert.equal(formatTime(62), "1:02");
  assert.equal(formatTime(3661), "1:01:01");
});

test("thumbnailFor builds a stable YouTube thumbnail URL", () => {
  assert.equal(thumbnailFor("WM7-PYtXtJM"), "https://i.ytimg.com/vi/WM7-PYtXtJM/hqdefault.jpg");
});

test("extractInitialData reads balanced JSON from YouTube markup", () => {
  const html = `<script>var ytInitialData = {"contents":{"items":[{"playlistPanelVideoRenderer":{"videoId":"abc123DEF45","title":{"simpleText":"Track title"},"shortBylineText":{"runs":[{"text":"Artist"}]}}}]}};</script>`;
  const data = extractInitialData(html);
  const buckets = collectVideoBuckets(data);

  assert.equal(buckets.panel.length, 1);
  assert.equal(buckets.panel[0].videoId, "abc123DEF45");
  assert.equal(buckets.panel[0].title, "Track title");
  assert.equal(buckets.panel[0].channel, "Artist");
});

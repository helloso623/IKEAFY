import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sanitizeLogValue } from "../server/lib/log.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const video = readFileSync(path.join(root, "server/lib/video.js"), "utf8");

test("sanitizeLogValue redacts keys and does not dump data URLs", () => {
  assert.equal(sanitizeLogValue({ fal_key: "fal-secret", FAL_KEY: "x" }).fal_key, "[set]");
  assert.equal(sanitizeLogValue({ authorization: "Key fal-secret" }).authorization, "[set]");
  assert.match(sanitizeLogValue("data:image/jpeg;base64,abc"), /^\[data \d+ chars\]$/);
  assert.equal(sanitizeLogValue({ videoUrl: "https://fal.media/files/demo.mp4" }).videoUrl, "https://fal.media/files/demo.mp4");
});

test("Seedance renderer logs queue, poll, and missing FAL_KEY without interpolating the key", () => {
  assert.match(video, /\[ikealive:\$\{scope\}\]|ikealiveLog\("video"/);
  assert.match(video, /missing FAL_KEY/);
  assert.match(video, /"submit"/);
  assert.match(video, /"poll"/);
  assert.doesNotMatch(video, /ikealiveLog\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(video, /ikealiveWarn\([^)]*process\.env\.FAL_KEY/);
});

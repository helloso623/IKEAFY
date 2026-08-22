import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { formatLogArgs, sanitizeLogValue } from "../client/src/log.js";
import { rendererConsoleText } from "../electron/log.js";
import { sanitizeLogValue as sanitizeServerLog } from "../server/lib/log.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const video = readFileSync(path.join(root, "server/lib/video.js"), "utf8");
const index = readFileSync(path.join(root, "server/index.js"), "utf8");
const electronMain = readFileSync(path.join(root, "electron/main.js"), "utf8");

test("sanitizeLogValue redacts keys and does not dump data URLs", () => {
  assert.equal(sanitizeLogValue({ fal_key: "fal-secret", FAL_KEY: "x" }).fal_key, "[set]");
  assert.equal(sanitizeLogValue({ authorization: "Key fal-secret" }).authorization, "[set]");
  assert.match(sanitizeLogValue("data:image/jpeg;base64,abc"), /^\[data \d+ chars\]$/);
  assert.equal(sanitizeLogValue({ videoUrl: "https://fal.media/files/demo.mp4" }).videoUrl, "https://fal.media/files/demo.mp4");
  assert.equal(sanitizeServerLog({ fal_key: "fal-secret" }).fal_key, "[set]");
});

test("renderer log lines stringify objects so Electron console-message keeps them", () => {
  const line = formatLogArgs(["render step", { runId: "run-1", step: 2, fal_key: "secret" }]);
  assert.match(line, /render step/);
  assert.match(line, /"runId":"run-1"/);
  assert.match(line, /"step":2/);
  assert.match(line, /"fal_key":"\[set\]"/);
  assert.doesNotMatch(line, /secret/);
});

test("Seedance renderer logs queue, poll, and missing FAL_KEY without interpolating the key", () => {
  assert.match(video, /\[ikealive:\$\{scope\}\]|ikealiveLog\("video"/);
  assert.match(video, /missing FAL_KEY/);
  assert.match(video, /"submit"/);
  assert.match(video, /"poll"/);
  assert.match(video, /keyed:\s*true|hasFal\(\)/);
  assert.doesNotMatch(video, /ikealiveLog\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(video, /ikealiveWarn\([^)]*process\.env\.FAL_KEY/);
});

test("server stdout uses ikealive video parse tavily and assembly prefixes", () => {
  assert.match(index, /ikealiveLog\("video"/);
  assert.match(index, /ikealiveLog\("parse"/);
  assert.match(index, /ikealiveLog\("tavily"/);
  assert.match(index, /ikealiveLog\("assembly"/);
  assert.match(index, /keyed:\s*hasFal\(\)/);
  assert.doesNotMatch(index, /process\.env\.FAL_KEY/);
});

test("Electron forwards renderer console-message events to stdout", () => {
  assert.match(electronMain, /console-message/);
  assert.match(electronMain, /process\.stdout\.write/);
  assert.match(electronMain, /attachRendererLogs/);
  assert.equal(rendererConsoleText({ message: "[ikealive:video] poll" }), "[ikealive:video] poll");
  assert.equal(rendererConsoleText({}, 1, "[ikealive:parse] plates"), "[ikealive:parse] plates");
  assert.equal(rendererConsoleText({}), "");
});

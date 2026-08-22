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
const image = readFileSync(path.join(root, "server/lib/image.js"), "utf8");
const scene = readFileSync(path.join(root, "server/lib/scene.js"), "utf8");
const index = readFileSync(path.join(root, "server/index.js"), "utf8");
const electronMain = readFileSync(path.join(root, "electron/main.js"), "utf8");

test("sanitizeLogValue redacts keys and does not dump data URLs", () => {
  assert.equal(sanitizeLogValue({ fal_key: "fal-secret", FAL_KEY: "x" }).fal_key, "[set]");
  assert.equal(sanitizeLogValue({ authorization: "Key fal-secret" }).authorization, "[set]");
  assert.match(sanitizeLogValue("data:image/jpeg;base64,abc"), /^\[data \d+ chars\]$/);
  assert.equal(sanitizeLogValue({ videoUrl: "https://fal.media/files/demo.mp4" }).videoUrl, "https://fal.media/files/demo.mp4");
  assert.equal(sanitizeLogValue({ imageUrl: "https://fal.media/files/demo.jpg" }).imageUrl, "https://fal.media/files/demo.jpg");
  assert.equal(sanitizeLogValue({ meshUrl: "https://fal.media/files/demo.glb" }).meshUrl, "https://fal.media/files/demo.glb");
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
  assert.match(video, /elapsedMs/);
  assert.match(video, /lastStatus/);
  assert.match(video, /promptChars/);
  assert.match(video, /keyed:\s*true|hasFal\(\)/);
  assert.doesNotMatch(video, /ikealiveLog\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(video, /ikealiveWarn\([^)]*process\.env\.FAL_KEY/);
});

test("Nano Banana 2 image logs submit, poll, and url without interpolating the key", () => {
  assert.match(image, /ikealiveLog\("image"/);
  assert.match(image, /fal-ai\/nano-banana-2/);
  assert.match(image, /missing FAL_KEY/);
  assert.match(image, /"submit"/);
  assert.match(image, /"poll"/);
  assert.match(image, /"url"/);
  assert.match(image, /promptChars/);
  assert.match(image, /model:\s*MODEL/);
  assert.doesNotMatch(image, /ikealiveLog\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(image, /ikealiveWarn\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(image, /base64/);
});

test("Tripo H3.1 scene logs model, submit, poll, and mesh URL without interpolating the key", () => {
  assert.match(scene, /ikealiveLog\("3d"/);
  assert.match(scene, /tripo3d\/h3\.1\/text-to-3d/);
  assert.match(scene, /missing FAL_KEY/);
  assert.match(scene, /"model"/);
  assert.match(scene, /"submit"/);
  assert.match(scene, /"poll"/);
  assert.match(scene, /"mesh"/);
  assert.match(scene, /meshUrl/);
  assert.match(scene, /promptChars/);
  assert.doesNotMatch(scene, /ikealiveLog\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(scene, /ikealiveWarn\([^)]*process\.env\.FAL_KEY/);
  assert.doesNotMatch(scene, /base64/);
});

test("server stdout uses ikealive video parse tavily assembly render and image prefixes", () => {
  assert.match(index, /ikealiveLog\("video"/);
  assert.match(index, /ikealiveLog\("parse"/);
  assert.match(index, /ikealiveLog\("tavily"/);
  assert.match(index, /ikealiveLog\("assembly"/);
  assert.match(index, /ikealiveLog\("render"/);
  assert.match(index, /ikealiveLog\("image"/);
  assert.match(index, /ikealiveLog\("3d"/);
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

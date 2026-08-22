import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  SCAN_VIDEO_MAX_BYTES,
  isAllowedOrigin,
  parseVideoUrl,
} from "../server/lib/scan-video.js";
import { scanVideoProxyUrl } from "../client/src/video-frames.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("scan video URLs must be http(s)", () => {
  assert.equal(parseVideoUrl("https://100.64.1.2:5173/clip.mp4"), "https://100.64.1.2:5173/clip.mp4");
  assert.throws(() => parseVideoUrl("file:///tmp/clip.mp4"), /http/);
  assert.throws(() => parseVideoUrl("ftp://example/clip.mp4"), /http/);
  assert.throws(() => parseVideoUrl(""), /Paste/);
  assert.throws(() => parseVideoUrl("not a url"), /not a URL/);
});

test("localhost, LAN and Tailscale origins may call the API", () => {
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("http://100.64.12.8:5173"), true);
  assert.equal(isAllowedOrigin("https://machine.ts.net"), true);
  assert.equal(isAllowedOrigin("http://192.168.1.20:5173"), true);
  assert.equal(isAllowedOrigin("null"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
});

test("the browser points the video element at the local proxy", () => {
  assert.equal(
    scanVideoProxyUrl("https://phone.ts.net/clip.mp4", ""),
    "/api/scan/video?url=https%3A%2F%2Fphone.ts.net%2Fclip.mp4",
  );
  assert.ok(SCAN_VIDEO_MAX_BYTES >= 8 * 1024 * 1024);
});

test("the API proxies scan video and Lab Scan accepts camera, URL, or frames", () => {
  const server = read("server/index.js");
  const html = read("client/index.html");
  const main = read("client/src/main.js");
  const house = read("client/src/house.js");
  assert.match(server, /\/api\/scan\/video/);
  assert.match(server, /parseVideoUrl/);
  assert.match(server, /isAllowedOrigin/);
  assert.match(html, /id="scan-video"/);
  assert.match(html, /id="scan-video-url"/);
  assert.match(html, /id="scan-camera-preview"/);
  assert.match(html, /id="scan-camera-capture"/);
  assert.doesNotMatch(html, /data-lab="ar"/);
  assert.match(html, /id="scan-scale-frame"/);
  assert.match(html, /Tap two points/);
  assert.match(html, /id="room-scale-kind"/);
  assert.match(main, /grabVideoFrames/);
  assert.match(main, /grabLiveFrames/);
  assert.match(main, /getUserMedia/);
  assert.match(main, /addReconstructedMesh/);
  assert.match(main, /resolveScanScale|scaleKind/);
  assert.match(house, /resolveRoomScale/);
  assert.match(house, /room-scale-kind/);
});

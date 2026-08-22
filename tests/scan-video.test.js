import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ROOM_VIDEO_MAX_SECONDS,
  SCAN_VIDEO_MAX_BYTES,
  classifyScanParts,
  decodeBase64Payload,
  inboxGetPayload,
  isAllowedOrigin,
  isPrivateLanHost,
  parseMultipartParts,
  parseVideoUrl,
  phoneUploadUrls,
  resetRoomVideo,
  resetScanInbox,
  roomVideoMeta,
  storeRoomVideo,
  storeScanFrames,
  storeScanVideo,
} from "../server/lib/scan-video.js";
import { scanVideoInboxUrl, scanVideoProxyUrl } from "../client/src/video-frames.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("scan video URLs must be http(s)", () => {
  assert.equal(parseVideoUrl("http://192.168.1.20:8787/clip.mp4"), "http://192.168.1.20:8787/clip.mp4");
  assert.throws(() => parseVideoUrl("file:///tmp/clip.mp4"), /http/);
  assert.throws(() => parseVideoUrl("ftp://example/clip.mp4"), /http/);
  assert.throws(() => parseVideoUrl(""), /Paste/);
  assert.throws(() => parseVideoUrl("not a url"), /not a URL/);
});

test("localhost and LAN origins may call the API", () => {
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("http://192.168.1.20:5173"), true);
  assert.equal(isAllowedOrigin("http://10.0.0.4:8787"), true);
  assert.equal(isAllowedOrigin("null"), true);
  assert.equal(isAllowedOrigin("https://203.0.113.8:5173"), false);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isPrivateLanHost("192.168.1.20"), true);
  assert.equal(isPrivateLanHost("203.0.113.8"), false);
});

test("the browser points the video element at the local proxy", () => {
  assert.equal(
    scanVideoProxyUrl("http://192.168.1.20/clip.mp4", ""),
    "/api/scan/video?url=http%3A%2F%2F192.168.1.20%2Fclip.mp4",
  );
  assert.equal(scanVideoInboxUrl(""), "/api/scan/video");
  assert.ok(SCAN_VIDEO_MAX_BYTES >= 8 * 1024 * 1024);
});

test("phone room video is a 30s LAN inbox", () => {
  resetRoomVideo();
  assert.equal(roomVideoMeta().ready, false);
  assert.equal(ROOM_VIDEO_MAX_SECONDS, 30);
  const stored = storeRoomVideo({ buffer: Buffer.from("fake-mp4"), contentType: "video/mp4", name: "room.mp4" });
  assert.equal(stored.ready, true);
  assert.equal(stored.maxSeconds, 30);
  assert.ok(stored.id);
  resetRoomVideo();
  const pack = phoneUploadUrls({ apiPort: 8787 });
  const urls = pack.urls || [];
  assert.ok(urls.length >= 1 || pack.url);
  for (const url of urls) {
    assert.match(url, /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/phone-upload$/);
    assert.equal(isPrivateLanHost(new URL(url).hostname), true);
  }
});

test("the API proxies scan video and stores it for a later pull", () => {
  const server = read("server/index.js");
  const phone = read("server/phone-upload.html");
  const vite = read("client/vite.config.js");
  assert.match(server, /\/api\/scan\/video/);
  assert.match(server, /\/phone-upload/);
  assert.match(vite, /\/phone-upload/);
  assert.match(server, /parseVideoUrl/);
  assert.match(server, /isAllowedOrigin/);
  assert.match(phone, /30s/);
  assert.match(phone, /\/api\/scan\/video/);
  assert.match(phone, /MAX_MS = 30_000/);
  assert.match(phone, /capture="environment"/);
  assert.match(phone, /occupancy.*auto-fit/i);
  assert.match(server, /app\.post\("\/api\/scan\/video"/);
});

test("POST stores video bytes and frames for a later GET inbox pull", () => {
  resetScanInbox();
  const png = decodeBase64Payload("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
  const stored = storeScanFrames([
    { name: "front.png", mime: "image/png", data: png.toString("base64") },
    { name: "side.png", mime: "image/png", buffer: png },
    { name: "top.png", mime: "image/png", data: png.toString("base64") },
  ]);
  assert.equal(stored.ok, true);
  assert.equal(stored.kind, "frames");
  assert.equal(stored.count, 3);
  const inbox = inboxGetPayload();
  assert.equal(inbox.kind, "frames");
  assert.equal(inbox.json.frames.length, 3);
  assert.ok(inbox.json.frames[0].data.length > 0);

  resetScanInbox();
  const video = storeScanVideo({ buffer: Buffer.from("ftypisom"), contentType: "video/mp4", name: "clip.mp4" });
  assert.equal(video.kind, "video");
  assert.equal(inboxGetPayload().kind, "video");
  assert.equal(inboxGetPayload().buffer.toString(), "ftypisom");
});

test("multipart scan posts split into a video part and image frames", () => {
  const boundary = "----IkealiveScan";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
    ),
    Buffer.from("VIDEO"),
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="front"; filename="front.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    Buffer.from("PNG"),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const parts = parseMultipartParts(body, `multipart/form-data; boundary=${boundary}`);
  const classified = classifyScanParts(parts);
  assert.equal(classified.video.buffer.toString(), "VIDEO");
  assert.equal(classified.frames.length, 1);
  assert.equal(classified.frames[0].name, "front.png");
});

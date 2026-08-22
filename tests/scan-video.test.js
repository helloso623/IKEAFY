import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ROOM_VIDEO_MAX_SECONDS,
  SCAN_VIDEO_MAX_BYTES,
  advertisedPhoneLink,
  classifyScanParts,
  decodeBase64Payload,
  inboxGetPayload,
  isAllowedOrigin,
  isPrivateLanHost,
  isTailscaleHost,
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
import {
  copyPhoneUrl,
  lanFallbackUrl,
  preferredPhoneUrl,
} from "../client/src/phone-link.js";
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
  assert.equal(isAllowedOrigin("https://ikealive.demo-tail.ts.net"), true);
  assert.equal(isAllowedOrigin("http://ikealive.demo-tail.ts.net"), false);
  assert.equal(isTailscaleHost("ikealive.demo-tail.ts.net"), true);
  assert.equal(isPrivateLanHost("192.168.1.20"), true);
  assert.equal(isPrivateLanHost("100.64.12.8"), true);
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

test("Tailscale phone link is selectable, copyable, QR-ready, with LAN fallback", async () => {
  const advertised = advertisedPhoneLink(
    {
      headers: {
        host: "127.0.0.1:8787",
        "x-forwarded-host": "ikealive.demo-tail.ts.net",
        "x-forwarded-proto": "https",
      },
    },
    { addresses: ["192.168.1.20"], clientPort: 5173, apiPort: 8787 },
  );
  assert.equal(advertised.url, "https://ikealive.demo-tail.ts.net/phone-upload");
  assert.equal(advertised.tailscaleUrl, advertised.url);
  assert.equal(advertised.lanUrl, "http://192.168.1.20:5173/phone-upload");
  assert.equal(preferredPhoneUrl(advertised), advertised.url);
  assert.equal(lanFallbackUrl(advertised), advertised.lanUrl);

  let copied = "";
  const input = { value: advertised.url };
  assert.equal(
    await copyPhoneUrl(input, {
      clipboard: { writeText: async (value) => { copied = value; } },
      documentRef: null,
    }),
    advertised.url,
  );
  assert.equal(copied, advertised.url);

  const html = read("client/index.html");
  const phone = read("server/phone-upload.html");
  const vite = read("client/vite.config.js");
  assert.match(html, /id="scan-phone-url"[^>]*readonly/);
  assert.match(html, /id="scan-phone-copy"[^>]*>Copy</);
  assert.match(html, /id="scan-phone-qr"/);
  assert.match(html, /id="scan-phone-lan-url"/);
  assert.equal((phone.match(/<button\b/g) || []).length, 1);
  assert.match(phone, />Record \/ Send ~30s video</);
  assert.match(vite, /allowedHosts:\s*\["\.ts\.net"\]/);
});

test("the API proxies scan video and Lab Scan accepts camera, URL, or frames", () => {
  const server = read("server/index.js");
  const html = read("client/index.html");
  const phone = read("server/phone-upload.html");
  const main = read("client/src/main.js");
  const house = read("client/src/house.js");
  const readme = read("README.md");
  const vite = read("client/vite.config.js");
  assert.match(server, /\/api\/scan\/video/);
  assert.match(server, /\/phone-upload/);
  assert.match(vite, /\/phone-upload/);
  assert.match(server, /parseVideoUrl/);
  assert.match(server, /isAllowedOrigin/);
  assert.match(html, /id="scan-video"/);
  assert.match(html, /id="scan-video-url"/);
  assert.match(html, /id="scan-camera-preview"/);
  assert.match(html, /id="scan-camera-capture"/);
  assert.match(html, /Send from phone/);
  assert.match(html, /id="scan-phone-link"/);
  assert.match(html, /id="scan-phone-url"/);
  assert.match(html, /id="scan-phone-qr"/);
  assert.doesNotMatch(html, /data-lab="ar"/);
  assert.match(html, /id="scan-scale-frame"/);
  assert.match(html, /Tap two points/);
  assert.match(html, /id="room-scale-kind"/);
  assert.match(html, /\/api\/scan\/video/);
  assert.match(phone, /30s/);
  assert.match(phone, /\/api\/scan\/video/);
  assert.match(phone, /MAX_MS = 30_000/);
  assert.match(phone, /capture="environment"/);
  assert.match(phone, /occupancy.*auto-fit/i);
  assert.match(main, /grabVideoFrames/);
  assert.match(main, /grabLiveFrames/);
  assert.match(main, /getUserMedia/);
  assert.match(main, /addReconstructedMesh/);
  assert.match(main, /resolveScanScale|scaleKind/);
  assert.match(house, /resolveRoomScale/);
  assert.match(house, /room-scale-kind/);
  assert.match(house, /applyRoomFrames/);
  assert.match(house, /scan-phone-url/);
  assert.match(readme, /Phone upload \(LAN\)/);
  assert.match(readme, /Send from phone/);
  assert.match(readme, /phone-upload/);
  assert.match(readme, /\/api\/scan\/video/);
  assert.match(readme, /occupancy.*auto-fit/i);
  assert.match(readme, /Finish \/ Find a way.*final table/i);
  assert.match(html, /occupancy cut and auto-fit into an IKEAlive plan/i);

  assert.match(server, /app\.post\("\/api\/scan\/video"/);
  assert.match(main, /pullScanInbox/);
  assert.match(main, /scanVideoPost/);
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

test("the phone QR encodes a LAN phone-upload URL", async () => {
  const { qrMatrix, qrSvg } = await import("../client/src/qr.js");
  const url = "http://192.168.1.20:5173/phone-upload";
  const matrix = qrMatrix(url);
  assert.ok(matrix.length >= 25 && matrix.length === matrix[0].length);
  const finder = (row, col) => {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const on = x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
        if (matrix[row + y][col + x] !== (on ? 1 : 0)) return false;
      }
    }
    return true;
  };
  assert.equal(finder(0, 0), true);
  assert.equal(finder(0, matrix.length - 7), true);
  assert.equal(finder(matrix.length - 7, 0), true);
  const svg = qrSvg(url);
  assert.match(svg, /<svg/);
  assert.match(svg, /fill="#111"/);
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

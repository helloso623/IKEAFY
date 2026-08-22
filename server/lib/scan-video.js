/**
 * Cheap scan-video helpers: URL checks, LAN origin allow-list, POST inbox,
 * and the phone-browser 30s room-video drop.
 * Frame extraction stays in the browser (video-frames.js). No ffmpeg, no paid model.
 */

import os from "node:os";

export function parseVideoUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Paste a video URL.");
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("That is not a URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use an http(s) video URL.");
  }
  return parsed.toString();
}

/** Localhost or RFC1918 only. */
export function isPrivateLanHost(host) {
  const name = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name === "127.0.0.1" || name === "::1") return true;
  if (/^10\./.test(name) || /^192\.168\./.test(name)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(name)) return true;
  return false;
}

/** Browser origin that may talk to this API (localhost or RFC1918 LAN only). */
export function isAllowedOrigin(origin) {
  if (!origin || origin === "null" || origin === "file://") return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return isPrivateLanHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function lanIPv4s() {
  const out = [];
  for (const rows of Object.values(os.networkInterfaces() || {})) {
    for (const row of rows || []) {
      const family = String(row.family);
      if (row.internal || (family !== "IPv4" && family !== "4")) continue;
      if (!isPrivateLanHost(row.address)) continue;
      out.push(row.address);
    }
  }
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function phoneUploadUrls({
  clientPort = Number(process.env.CLIENT_PORT || process.env.VITE_PORT || 5173),
  apiPort = Number(process.env.PORT || 8787),
  addresses = lanIPv4s(),
} = {}) {
  const ui = Number(clientPort) || 5173;
  const api = Number(apiPort) || 8787;
  const lanIp = addresses[0] || "127.0.0.1";
  const hosts = addresses.length ? addresses : [lanIp];
  const urls = [...new Set(hosts.flatMap((ip) => [`http://${ip}:${ui}/phone-upload`, `http://${ip}:${api}/phone-upload`]))];
  return {
    lanIp,
    url: `http://${lanIp}:${ui}/phone-upload`,
    apiUrl: `http://${lanIp}:${api}/phone-upload`,
    urls,
    clientPort: ui,
    apiPort: api,
  };
}

export function advertisedPhoneLink(req, extra = {}) {
  const pack = phoneUploadUrls(extra);
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req?.headers?.host || "").trim();
  let hostname = "";
  let advertisedHost = "";
  try {
    const parsedHost = new URL(`http://${host}`);
    hostname = parsedHost.hostname;
    advertisedHost = parsedHost.host;
  } catch {
    hostname = "";
  }
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const requestUrl =
    isPrivateLanHost(hostname) && advertisedHost
      ? `${forwardedProto === "https" ? "https" : "http"}://${advertisedHost}/phone-upload`
      : null;
  const lanUrl = requestUrl || pack.url;
  const urls = [...new Set([lanUrl, ...pack.urls, pack.apiUrl].filter(Boolean))];
  return {
    ok: true,
    ...pack,
    url: lanUrl,
    urls,
    lanUrl,
    maxSeconds: ROOM_VIDEO_MAX_SECONDS,
  };
}

export const SCAN_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const SCAN_VIDEO_TIMEOUT_MS = 20_000;
export const ROOM_VIDEO_MAX_SECONDS = 30;

function emptyInbox() {
  return { video: null, frames: [], id: 0, receivedAt: 0 };
}

let inbox = emptyInbox();

export function resetScanInbox() {
  inbox = emptyInbox();
  return inbox;
}

export function getScanInbox() {
  return inbox;
}

function inboxBytes() {
  let total = inbox.video?.buffer?.length || 0;
  for (const frame of inbox.frames) total += frame.buffer?.length || 0;
  return total;
}

function assertFits(extraBytes) {
  if (inboxBytes() + extraBytes > SCAN_VIDEO_MAX_BYTES) {
    const error = new Error("Video is too large for a local scan (80 MB).");
    error.status = 413;
    throw error;
  }
}

export function decodeBase64Payload(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Missing base64 data.");
  const trimmed = text.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const buffer = Buffer.from(trimmed, "base64");
  if (!buffer.length) throw new Error("Could not decode that payload.");
  return buffer;
}

export function serializeScanFrame(frame) {
  return {
    name: frame.name || "frame.png",
    mime: frame.mime || "image/png",
    bytes: frame.buffer?.length || 0,
    data: Buffer.from(frame.buffer || []).toString("base64"),
  };
}

export function storeScanVideo({ buffer, contentType, name } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) throw new Error("POST a video file or frames.");
  if (buf.length > SCAN_VIDEO_MAX_BYTES) {
    const error = new Error("Video is too large for a local scan (80 MB).");
    error.status = 413;
    throw error;
  }
  inbox.id += 1;
  inbox.receivedAt = Date.now();
  inbox.video = {
    buffer: buf,
    contentType: contentType || "video/mp4",
    name: name || "scan.mp4",
  };
  inbox.frames = [];
  return {
    ok: true,
    id: inbox.id,
    kind: "video",
    ready: true,
    bytes: buf.length,
    contentType: inbox.video.contentType,
    name: inbox.video.name,
    frames: 0,
    receivedAt: inbox.receivedAt,
    maxSeconds: ROOM_VIDEO_MAX_SECONDS,
  };
}

export function storeScanFrames(frames) {
  const list = [];
  for (const frame of Array.isArray(frames) ? frames : []) {
    const buffer = Buffer.isBuffer(frame.buffer)
      ? frame.buffer
      : frame.data
        ? decodeBase64Payload(frame.data)
        : Buffer.from(frame.buffer || []);
    if (!buffer.length) continue;
    list.push({
      name: String(frame.name || `frame-${list.length + 1}.png`),
      mime: String(frame.mime || "image/png"),
      buffer,
    });
  }
  if (!list.length) throw new Error("POST a video file or frames.");
  const extra = list.reduce((sum, frame) => sum + frame.buffer.length, 0);
  assertFits(extra);
  inbox.id += 1;
  inbox.receivedAt = Date.now();
  inbox.frames = list;
  return {
    ok: true,
    id: inbox.id,
    kind: "frames",
    ready: true,
    count: list.length,
    frames: list.map((frame) => ({ name: frame.name, mime: frame.mime, bytes: frame.buffer.length })),
    video: Boolean(inbox.video),
    receivedAt: inbox.receivedAt,
    maxSeconds: ROOM_VIDEO_MAX_SECONDS,
  };
}

export function getScanInboxMeta() {
  return {
    ok: true,
    id: inbox.id || 0,
    kind: inbox.frames.length ? "frames" : inbox.video ? "video" : null,
    ready: Boolean(inbox.video || inbox.frames.length),
    bytes: inboxBytes(),
    contentType: inbox.video?.contentType || null,
    name: inbox.video?.name || null,
    frames: inbox.frames.length,
    receivedAt: inbox.receivedAt || null,
    maxSeconds: ROOM_VIDEO_MAX_SECONDS,
  };
}

export function parseMultipartParts(buffer, contentType) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || "").trim();
  if (!boundary) throw new Error("Missing multipart boundary.");
  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(sep);
  while (start >= 0) {
    const after = start + sep.length;
    if (buffer[after] === 0x2d && buffer[after + 1] === 0x2d) break;
    const headerEnd = buffer.indexOf("\r\n\r\n", after);
    if (headerEnd < 0) break;
    const next = buffer.indexOf(sep, headerEnd);
    if (next < 0) break;
    const rawHeaders = buffer.slice(after, headerEnd).toString("utf8");
    let body = buffer.slice(headerEnd + 4, next);
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.slice(0, -2);
    }
    const name = (rawHeaders.match(/name="([^"]*)"/i) || [])[1] || "";
    const filename = (rawHeaders.match(/filename="([^"]*)"/i) || [])[1] || "";
    const mime = (rawHeaders.match(/content-type:\s*([^\r\n]+)/i) || [])[1]?.trim() || "";
    parts.push({ name, filename, mime, buffer: body });
    start = next;
  }
  return parts;
}

export function classifyScanParts(parts) {
  const frames = [];
  let video = null;
  for (const part of Array.isArray(parts) ? parts : []) {
    const mime = String(part.mime || "");
    const field = String(part.name || "");
    const filename = String(part.filename || field || "upload");
    const isVideo =
      mime.startsWith("video/") ||
      /\.(mp4|webm|mov|m4v|mkv)$/i.test(filename) ||
      /^(video|file|clip)$/i.test(field);
    const isImage =
      mime.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(filename) ||
      /^(frame|frames|front|side|top|image)/i.test(field);
    if (isVideo && part.buffer?.length) {
      video = { name: filename, mime: mime || "video/mp4", buffer: part.buffer };
    } else if (isImage && part.buffer?.length) {
      frames.push({ name: filename, mime: mime || "image/png", buffer: part.buffer });
    }
  }
  return { video, frames };
}

export function readLimitedBody(req, maxBytes = SCAN_VIDEO_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        cleanup();
        const error = new Error("Video is too large for a local scan (80 MB).");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onErr = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onErr);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onErr);
  });
}

export function inboxGetPayload() {
  if (inbox.frames.length) {
    return {
      kind: "frames",
      json: {
        ok: true,
        kind: "frames",
        count: inbox.frames.length,
        frames: inbox.frames.map(serializeScanFrame),
        video: Boolean(inbox.video),
      },
    };
  }
  if (inbox.video) {
    return {
      kind: "video",
      contentType: inbox.video.contentType,
      name: inbox.video.name,
      buffer: inbox.video.buffer,
    };
  }
  return null;
}

export function resetRoomVideo() {
  return resetScanInbox();
}

export function storeRoomVideo({ buffer, contentType, name } = {}) {
  return storeScanVideo({
    buffer,
    contentType,
    name: name || "room.mp4",
  });
}

export function roomVideoMeta() {
  return getScanInboxMeta();
}

export function roomVideoFile() {
  return inbox.video
    ? { ...inbox.video, id: inbox.id, bytes: inbox.video.buffer.length, receivedAt: inbox.receivedAt }
    : null;
}

/**
 * Pull stills from a local video file or a (proxied) video URL.
 * Browser-only — uses a hidden <video> + canvas. No ffmpeg, no paid model.
 */

import { assignScanViews, pickFrameTimes } from "./frame-scale.js";
import { apiRoot } from "./api.js";

export function scanVideoProxyUrl(rawUrl, apiOrigin = "") {
  const url = String(rawUrl || "").trim();
  if (!url) throw new Error("Paste a video URL.");
  const root = String(apiOrigin || "").replace(/\/+$/, "");
  return `${root}/api/scan/video?url=${encodeURIComponent(url)}`;
}

export function scanVideoInboxUrl(apiOrigin = "") {
  const root = String(apiOrigin || "").replace(/\/+$/, "");
  return `${root}/api/scan/video`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(raw) {
  const text = String(raw || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function filesFromPostedFrames(frames) {
  return (Array.isArray(frames) ? frames : [])
    .map((frame, index) => {
      const bytes = base64ToBytes(frame?.data);
      if (!bytes.length) return null;
      const mime = frame.mime || "image/png";
      const name = frame.name || `scan-frame-${index + 1}.png`;
      return new File([bytes], name, { type: mime });
    })
    .filter(Boolean);
}

export async function filesToPostedFrames(files) {
  const frames = [];
  for (const file of files || []) {
    if (!file) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    frames.push({
      name: file.name || `frame-${frames.length + 1}.png`,
      mime: file.type || "image/png",
      data: bytesToBase64(bytes),
    });
  }
  return frames;
}

export async function fetchScanInbox(apiOrigin = "") {
  const res = await fetch(scanVideoInboxUrl(apiOrigin));
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    let reason = "No posted scan yet.";
    try {
      const body = await res.json();
      reason = body?.reason || reason;
    } catch {
      // ignore
    }
    throw new Error(reason);
  }
  if (type.includes("application/json")) {
    const body = await res.json();
    return { ok: true, kind: body.kind || "frames", frames: body.frames || [], video: Boolean(body.video) };
  }
  const blob = await res.blob();
  return { ok: true, kind: "video", blob };
}

export async function canvasToFile(canvas, name = "frame.png") {
  const blob = await new Promise((resolve, reject) => {
    if (!canvas?.toBlob) {
      reject(new Error("This browser cannot capture a video frame."));
      return;
    }
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("Could not capture that frame."))), "image/png");
  });
  return new File([blob], name, { type: "image/png" });
}

function frameCanvas(video, maxSide) {
  const width = video?.videoWidth || 0;
  const height = video?.videoHeight || 0;
  if (!width || !height) throw new Error("That camera or video has no picture frames.");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(16, Math.round(width * scale));
  canvas.height = Math.max(16, Math.round(height * scale));
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Capture front / side / top stills from an already-playing camera preview.
 * The operator moves around the object between the short capture intervals.
 */
export async function grabLiveFrames(
  video,
  { count = 3, maxSide = 1024, intervalMs = 700, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    frames.push(await canvasToFile(frameCanvas(video, maxSide), `camera-view-${index + 1}.png`));
    if (index + 1 < count && intervalMs > 0) await wait(intervalMs);
  }
  return { files: frames, views: assignScanViews(frames) };
}

function waitForEvent(target, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading that video."));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Could not read that video."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

/**
 * Seek through `source` (blob URL or same-origin proxy URL) and return PNG files.
 */
export async function grabVideoFrames(source, { count = 3, maxSide = 1024, maxDurationSec } = {}) {
  const src = String(source || "").trim();
  if (!src) throw new Error("Choose a video or paste a URL.");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = src;
  try {
    video.load();
    if (video.readyState < 2) await waitForEvent(video, "loadeddata");
    const cap = Number(maxDurationSec);
    const duration =
      Number.isFinite(cap) && cap > 0 ? Math.min(video.duration || 0, cap) : video.duration;
    const times = pickFrameTimes(duration, count);
    const frames = [];
    for (let i = 0; i < times.length; i += 1) {
      video.currentTime = times[i];
      await waitForEvent(video, "seeked", 4000);
      frames.push(await canvasToFile(frameCanvas(video, maxSide), `scan-frame-${i + 1}.png`));
    }
    return { files: frames, views: assignScanViews(frames), duration: video.duration, times };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

export { assignScanViews, pickFrameTimes };

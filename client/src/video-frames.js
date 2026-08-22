/**
 * Pull stills from a local video file or a (proxied) video URL.
 * Browser-only — uses a hidden <video> + canvas. No ffmpeg, no paid model.
 */

import { assignScanViews, pickFrameTimes } from "./frame-scale.js";

export function scanVideoProxyUrl(rawUrl, apiOrigin = "") {
  const url = String(rawUrl || "").trim();
  if (!url) throw new Error("Paste a video URL.");
  const root = String(apiOrigin || "").replace(/\/+$/, "");
  return `${root}/api/scan/video?url=${encodeURIComponent(url)}`;
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
export async function grabVideoFrames(source, { count = 3, maxSide = 1024 } = {}) {
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
    const times = pickFrameTimes(video.duration, count);
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

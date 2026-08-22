/**
 * Cheap scan-video helpers: URL checks and Tailscale/LAN origin allow-list.
 * Frame extraction stays in the browser (video-frames.js). No ffmpeg, no paid model.
 */

const TAILSCALE_CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

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

function hostIsPrivateOrTailnet(host) {
  const name = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name === "127.0.0.1" || name === "::1") return true;
  if (name.endsWith(".ts.net") || name.endsWith(".tailscale.net")) return true;
  if (TAILSCALE_CGNAT.test(name)) return true;
  if (/^10\./.test(name) || /^192\.168\./.test(name)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(name)) return true;
  return false;
}

/** Browser origin that may talk to this API (localhost, LAN, Tailscale). */
export function isAllowedOrigin(origin) {
  if (!origin || origin === "null" || origin === "file://") return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return hostIsPrivateOrTailnet(parsed.hostname);
  } catch {
    return false;
  }
}

export const SCAN_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const SCAN_VIDEO_TIMEOUT_MS = 20_000;

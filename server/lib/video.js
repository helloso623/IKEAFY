import { storyboardForStep } from "./ikeafy.js";
import { composeStepPrompt, logSceneBible, sceneBibleFromGuide } from "./bible.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

export const MODEL = "bytedance/seedance-2.5/text-to-video";
export const PARTNER = "Seedance";
export const FAL_REQUIRED =
  "Set FAL_KEY for ByteDance Seedance 2.5 films. The watch reel is a live MP4, not a canvas storyboard.";
const MODEL_ROOT = "https://queue.fal.run/bytedance/seedance-2.5";
const QUEUE = `${MODEL_ROOT}/text-to-video`;
export const FAL_POLL_MS = 1500;
/** Seedance 2.5 often sits in queue 8–15+ minutes; 180s was cutting jobs off. */
export const DEFAULT_FAL_TIMEOUT_MS = 15 * 60 * 1000;

export function falTimeoutMs(env = process.env) {
  const n = Number(env.FAL_TIMEOUT_MS);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_FAL_TIMEOUT_MS;
}

function queuePollUrls(requestId) {
  return {
    statusUrl: `${MODEL_ROOT}/requests/${requestId}/status`,
    resultUrl: `${MODEL_ROOT}/requests/${requestId}`,
  };
}

export function hasFal() {
  return typeof process.env.FAL_KEY === "string" && process.env.FAL_KEY.trim().length > 0;
}

/** Kept so older health/tests still read as "is the fal key present". */
export function hasVeed() {
  return hasFal();
}

function videoUrlFrom(response) {
  return (
    response?.video?.url ||
    response?.video_url ||
    response?.data?.video?.url ||
    response?.data?.video_url ||
    response?.url ||
    null
  );
}

function falHeaders() {
  return {
    Authorization: `Key ${process.env.FAL_KEY}`,
    "Content-Type": "application/json",
  };
}

export function promptForStep(guide, stepNumber, extra = "", bible = null) {
  return composeStepPrompt({ kind: "video", guide, stepNumber, extra, bible });
}

async function falQueue(
  payload,
  {
    fetchFn = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => Date.now(),
  } = {},
) {
  const headers = falHeaders();
  const timeoutMs = falTimeoutMs();
  ikealiveLog("video", "submit", {
    queue: QUEUE,
    promptChars: String(payload?.prompt || "").length,
    resolution: payload?.resolution,
    duration: payload?.duration,
    timeoutMs,
  });
  const submitted = await fetchFn(QUEUE, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!submitted.ok) {
    const detail = await submitted.text().catch(() => "");
    ikealiveWarn("video", "submit failed", { status: submitted.status, detail: String(detail).slice(0, 180) });
    throw new Error(`fal submit ${submitted.status} ${detail.slice(0, 180)}`);
  }
  const ticket = await submitted.json();
  const immediate = videoUrlFrom(ticket);
  if (immediate) {
    ikealiveLog("video", "result", { requestId: ticket.request_id || null, videoUrl: immediate, immediate: true });
    return ticket;
  }

  const requestId = ticket.request_id;
  if (!requestId) throw new Error("fal submit returned no request_id");
  // Submit is /text-to-video; status/result live under /requests/$ID, never /text-to-video/requests/.
  const { statusUrl, resultUrl } = queuePollUrls(requestId);
  ikealiveLog("video", "queued", { requestId, statusUrl, resultUrl, timeoutMs });

  const started = now();
  const deadline = started + timeoutMs;
  let polls = 0;
  let lastState = "unknown";
  while (now() < deadline) {
    polls += 1;
    const elapsedMs = now() - started;
    const statusRes = await fetchFn(statusUrl, { headers });
    if (!statusRes.ok) {
      ikealiveWarn("video", "poll failed", { requestId, status: statusRes.status, polls, elapsedMs });
      throw new Error(`fal status ${statusRes.status}`);
    }
    const status = await statusRes.json();
    const state = String(status.status || "").toUpperCase();
    lastState = state || "unknown";
    ikealiveLog("video", "poll", {
      requestId,
      state: lastState,
      polls,
      elapsedMs,
      queuePosition: status.queue_position ?? null,
    });
    if (state === "COMPLETED") {
      const done = await fetchFn(resultUrl, { headers });
      if (!done.ok) {
        ikealiveWarn("video", "result failed", { requestId, status: done.status, elapsedMs });
        throw new Error(`fal result ${done.status}`);
      }
      const body = await done.json();
      ikealiveLog("video", "result", { requestId, videoUrl: videoUrlFrom(body), polls, elapsedMs });
      return body;
    }
    if (state === "FAILED" || state === "CANCELED") {
      ikealiveWarn("video", "job failed", { requestId, state: lastState, elapsedMs });
      throw new Error(`fal ${state.toLowerCase()}`);
    }
    await sleep(FAL_POLL_MS);
  }
  const elapsedMs = now() - started;
  ikealiveWarn("video", "timeout", { requestId, polls, elapsedMs, lastStatus: lastState });
  throw new Error(`fal timeout after ${elapsedMs}ms (last status: ${lastState})`);
}

export async function renderStepVideo(
  { guide, stepNumber, extra = "", bible = null, seed = null } = {},
  deps = {},
) {
  let frames = [];
  let theme = {
    setting: "birch workshop",
    light: "north window",
    material: "particleboard foil + steel inserts",
    accent: "#ffda1a",
  };

  try {
    frames = storyboardForStep(guide, stepNumber);
    theme = guide?.theme || theme;
  } catch {
    // An unusable guide still yields a safe local result.
  }

  const locked = bible || sceneBibleFromGuide(guide);
  const prompt = promptForStep(guide, stepNumber, extra, locked);
  logSceneBible({ bible: locked, seed, stepNumber, mode: "video" });
  const local = {
    ok: false,
    live: false,
    provider: "none",
    partner: PARTNER,
    model: MODEL,
    prompt,
    videoUrl: null,
    frames,
    continuous: true,
    theme,
    bible: locked,
    seed: Number.isInteger(seed) ? seed : null,
    reason: FAL_REQUIRED,
  };

  if (!hasFal()) {
    ikealiveWarn("video", "missing FAL_KEY — no Seedance film", { stepNumber });
    return local;
  }

  ikealiveLog("video", "render", { stepNumber, title: guide?.title || null, keyed: true, sku: locked.sku });
  const result = await falQueue(
    {
      prompt,
      resolution: "480p",
      duration: "5",
      aspect_ratio: "16:9",
      generate_audio: true,
      bitrate_mode: "standard",
    },
    deps,
  );
  const videoUrl = videoUrlFrom(result);
  if (!videoUrl) throw new Error("fal returned no video url");
  return {
    ...local,
    ok: true,
    live: true,
    provider: "seedance-2.5",
    videoUrl,
    reason: null,
  };
}

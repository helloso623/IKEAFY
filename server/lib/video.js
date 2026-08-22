import { storyboardForStep } from "./ikeafy.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

export const MODEL = "bytedance/seedance-2.5/text-to-video";
export const PARTNER = "Seedance";
export const FAL_REQUIRED =
  "Set FAL_KEY for ByteDance Seedance 2.5 films. The watch reel is a live MP4, not a canvas storyboard.";
const MODEL_ROOT = "https://queue.fal.run/bytedance/seedance-2.5";
const QUEUE = `${MODEL_ROOT}/text-to-video`;
const POLL_MS = 1500;
const DEADLINE_MS = 180_000;

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

export function promptForStep(guide, stepNumber, extra = "") {
  const step =
    guide?.steps?.find((s) => Number(s.number) === Number(stepNumber)) || guide?.steps?.[0] || {};
  const theme = guide?.theme || {};
  const title = guide?.title || "this build";
  const body = String(step.body || "").trim();
  const parts = (step.partsUsed || []).join(", ") || "the parts named in the instruction";
  const tool = step.toolRequired ? `Use a ${step.toolRequired}.` : "Hands only.";
  return [
    "Photoreal IKEA-style assembly tutorial, one continuous shot.",
    `Setting: ${theme.setting || "birch workshop"}, ${theme.light || "soft north window light"}, ${
      theme.material || "particleboard foil and steel fittings"
    }, yellow #ffda1a accent.`,
    "Same workshop, same materials, same lighting as the rest of this film.",
    "No on-screen text, no logos, no subtitles, no brand marks.",
    "Show adult hands performing one clear assembly move at IKEA-manual pace.",
    `This is step ${step.number || stepNumber || 1} of "${title}": ${body || "Follow the plate."}`,
    `Parts in this shot: ${parts}. ${tool}`,
    extra ? `Additional direction from the builder: ${String(extra).slice(0, 400)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function falQueue(payload, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const headers = falHeaders();
  ikealiveLog("video", "submit", { queue: QUEUE, promptChars: String(payload?.prompt || "").length, resolution: payload?.resolution, duration: payload?.duration });
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
  const statusUrl = ticket.status_url || `${MODEL_ROOT}/requests/${requestId}/status`;
  const resultUrl = ticket.response_url || `${MODEL_ROOT}/requests/${requestId}`;
  ikealiveLog("video", "queued", { requestId, statusUrl, resultUrl });

  const deadline = Date.now() + DEADLINE_MS;
  let polls = 0;
  while (Date.now() < deadline) {
    polls += 1;
    const statusRes = await fetchFn(statusUrl, { headers });
    if (!statusRes.ok) {
      ikealiveWarn("video", "poll failed", { requestId, status: statusRes.status, polls });
      throw new Error(`fal status ${statusRes.status}`);
    }
    const status = await statusRes.json();
    const state = String(status.status || "").toUpperCase();
    ikealiveLog("video", "poll", { requestId, state, polls });
    if (state === "COMPLETED") {
      const done = await fetchFn(resultUrl, { headers });
      if (!done.ok) {
        ikealiveWarn("video", "result failed", { requestId, status: done.status });
        throw new Error(`fal result ${done.status}`);
      }
      const body = await done.json();
      ikealiveLog("video", "result", { requestId, videoUrl: videoUrlFrom(body), polls });
      return body;
    }
    if (state === "FAILED" || state === "CANCELED") {
      ikealiveWarn("video", "job failed", { requestId, state });
      throw new Error(`fal ${state.toLowerCase()}`);
    }
    await sleep(POLL_MS);
  }
  ikealiveWarn("video", "timeout", { requestId, polls });
  throw new Error("fal timeout");
}

export async function renderStepVideo(
  { guide, stepNumber, extra = "" } = {},
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

  const prompt = promptForStep(guide, stepNumber, extra);
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
    reason: FAL_REQUIRED,
  };

  if (!hasFal()) {
    ikealiveWarn("video", "missing FAL_KEY — no Seedance film", { stepNumber });
    return local;
  }

  ikealiveLog("video", "render", { stepNumber, title: guide?.title || null, keyed: true });
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

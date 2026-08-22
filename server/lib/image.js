import { composeStepPrompt, logSceneBible, sceneBibleFromGuide } from "./bible.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";
import { hasFal } from "./video.js";

export { hasFal };

export const MODEL = "fal-ai/nano-banana-2";
export const PARTNER = "Nano Banana 2";
export const FAL_IMAGE_REQUIRED =
  "Set FAL_KEY for Nano Banana 2 instruction stills. Image mode is a live plate, not a canvas table drawing.";
const MODEL_ROOT = "https://queue.fal.run/fal-ai/nano-banana-2";
const QUEUE = MODEL_ROOT;
export const FAL_IMAGE_POLL_MS = 1000;
/** Nano Banana 2 is fast; 3 minutes is plenty even when queued. */
export const DEFAULT_FAL_IMAGE_TIMEOUT_MS = 3 * 60 * 1000;

export function falImageTimeoutMs(env = process.env) {
  const n = Number(env.FAL_IMAGE_TIMEOUT_MS || env.FAL_TIMEOUT_MS);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_FAL_IMAGE_TIMEOUT_MS;
}

function queuePollUrls(requestId) {
  return {
    statusUrl: `${MODEL_ROOT}/requests/${requestId}/status`,
    resultUrl: `${MODEL_ROOT}/requests/${requestId}`,
  };
}

function imageUrlFrom(response) {
  return (
    response?.images?.[0]?.url ||
    response?.image?.url ||
    response?.data?.images?.[0]?.url ||
    response?.data?.image?.url ||
    response?.image_url ||
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

export function promptForStepImage(guide, stepNumber, extra = "", bible = null) {
  return composeStepPrompt({ kind: "image", guide, stepNumber, extra, bible });
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
  const timeoutMs = falImageTimeoutMs();
  ikealiveLog("image", "submit", {
    queue: QUEUE,
    model: MODEL,
    promptChars: String(payload?.prompt || "").length,
    aspectRatio: payload?.aspect_ratio,
    resolution: payload?.resolution,
    timeoutMs,
  });
  const submitted = await fetchFn(QUEUE, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!submitted.ok) {
    const detail = await submitted.text().catch(() => "");
    ikealiveWarn("image", "submit failed", { status: submitted.status, detail: String(detail).slice(0, 180) });
    throw new Error(`fal submit ${submitted.status} ${detail.slice(0, 180)}`);
  }
  const ticket = await submitted.json();
  const immediate = imageUrlFrom(ticket);
  if (immediate) {
    ikealiveLog("image", "url", { requestId: ticket.request_id || null, imageUrl: immediate, immediate: true });
    return ticket;
  }

  const requestId = ticket.request_id;
  if (!requestId) throw new Error("fal submit returned no request_id");
  const { statusUrl, resultUrl } = queuePollUrls(requestId);
  ikealiveLog("image", "queued", { requestId, statusUrl, resultUrl, timeoutMs });

  const started = now();
  const deadline = started + timeoutMs;
  let polls = 0;
  let lastState = "unknown";
  while (now() < deadline) {
    polls += 1;
    const elapsedMs = now() - started;
    const statusRes = await fetchFn(statusUrl, { headers });
    if (!statusRes.ok) {
      ikealiveWarn("image", "poll failed", { requestId, status: statusRes.status, polls, elapsedMs });
      throw new Error(`fal status ${statusRes.status}`);
    }
    const status = await statusRes.json();
    const state = String(status.status || "").toUpperCase();
    lastState = state || "unknown";
    ikealiveLog("image", "poll", {
      requestId,
      state: lastState,
      polls,
      elapsedMs,
      queuePosition: status.queue_position ?? null,
    });
    if (state === "COMPLETED") {
      const done = await fetchFn(resultUrl, { headers });
      if (!done.ok) {
        ikealiveWarn("image", "result failed", { requestId, status: done.status, elapsedMs });
        throw new Error(`fal result ${done.status}`);
      }
      const body = await done.json();
      ikealiveLog("image", "url", { requestId, imageUrl: imageUrlFrom(body), polls, elapsedMs });
      return body;
    }
    if (state === "FAILED" || state === "CANCELED") {
      ikealiveWarn("image", "job failed", { requestId, state: lastState, elapsedMs });
      throw new Error(`fal ${state.toLowerCase()}`);
    }
    await sleep(FAL_IMAGE_POLL_MS);
  }
  const elapsedMs = now() - started;
  ikealiveWarn("image", "timeout", { requestId, polls, elapsedMs, lastStatus: lastState });
  throw new Error(`fal timeout after ${elapsedMs}ms (last status: ${lastState})`);
}

export async function renderStepImage({ guide, stepNumber, extra = "", bible = null, seed = null } = {}, deps = {}) {
  const locked = bible || sceneBibleFromGuide(guide);
  const lockedSeed = Number.isInteger(seed) ? seed : null;
  const prompt = promptForStepImage(guide, stepNumber, extra, locked);
  logSceneBible({ bible: locked, seed: lockedSeed, stepNumber, mode: "images" });
  const local = {
    ok: false,
    live: false,
    provider: "none",
    partner: PARTNER,
    model: MODEL,
    prompt,
    imageUrl: null,
    bible: locked,
    seed: lockedSeed,
    reason: FAL_IMAGE_REQUIRED,
  };

  if (!hasFal()) {
    ikealiveWarn("image", "missing FAL_KEY — no Nano Banana still", { stepNumber });
    return local;
  }

  ikealiveLog("image", "render", {
    stepNumber,
    title: guide?.title || null,
    keyed: true,
    model: MODEL,
    sku: locked.sku,
    seed: lockedSeed,
  });
  const payload = {
    prompt,
    num_images: 1,
    aspect_ratio: "16:9",
    output_format: "png",
    resolution: "1K",
    limit_generations: true,
  };
  if (lockedSeed != null) payload.seed = lockedSeed;
  const result = await falQueue(payload, deps);
  const imageUrl = imageUrlFrom(result);
  if (!imageUrl) throw new Error("fal returned no image url");
  ikealiveLog("image", "url", { stepNumber, imageUrl, provider: "nano-banana-2", model: MODEL });
  return {
    ...local,
    ok: true,
    live: true,
    provider: "nano-banana-2",
    imageUrl,
    reason: null,
  };
}

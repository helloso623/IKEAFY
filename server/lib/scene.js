import { composeStepPrompt, logSceneBible, sceneBibleFromGuide } from "./bible.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";
import { hasFal } from "./video.js";

export { hasFal };

export const MODEL = "tripo3d/h3.1/text-to-3d";
export const PARTNER = "Tripo H3.1";
/** Submit lives under /text-to-3d; status/result use the app root (same pattern as Seedance). */
const MODEL_ROOT = "https://queue.fal.run/tripo3d/h3.1";
export const QUEUE = `${MODEL_ROOT}/text-to-3d`;
export const FAL_SCENE_REQUIRED =
  "Set FAL_KEY for Tripo H3.1 instruction meshes. 3D mode loads a live GLB in the workshop, not a catalog LACK table.";
export const FAL_SCENE_POLL_MS = 2000;
/** Tripo H3.1 often spends a few minutes in queue; 10 minutes covers slow jobs. */
export const DEFAULT_FAL_SCENE_TIMEOUT_MS = 10 * 60 * 1000;

export function falSceneTimeoutMs(env = process.env) {
  const n = Number(env.FAL_SCENE_TIMEOUT_MS || env.FAL_TIMEOUT_MS);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_FAL_SCENE_TIMEOUT_MS;
}

function queuePollUrls(requestId) {
  // Never poll under the submit path — fal returns HTTP 405 Method Not Allowed there.
  return {
    statusUrl: `${MODEL_ROOT}/requests/${requestId}/status`,
    resultUrl: `${MODEL_ROOT}/requests/${requestId}`,
  };
}

function fileUrl(file) {
  if (!file) return null;
  if (typeof file === "string" && file.trim()) return file.trim();
  const url = file.url || file.href || null;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function looksLikeFbx(file, url) {
  const name = String(file?.file_name || file?.fileName || url || "").toLowerCase();
  const type = String(file?.content_type || file?.contentType || "").toLowerCase();
  return /\.fbx(\?|$)/.test(name) || type.includes("fbx");
}

/** Prefer a GLB/OBJ mesh URL from Tripo output. */
export function meshUrlFrom(response) {
  const data = response?.data && typeof response.data === "object" ? response.data : response;
  const urls = data?.model_urls || data?.modelUrls || {};
  const ranked = [urls.glb, urls.obj, data?.model_mesh, data?.modelMesh, urls.pbr_model, urls.base_model];
  for (const item of ranked) {
    const url = fileUrl(item);
    if (!url || looksLikeFbx(item, url)) continue;
    return url;
  }
  const fallback = fileUrl(data?.model_mesh) || fileUrl(urls.glb) || fileUrl(data?.mesh_url) || fileUrl(data?.url);
  return fallback || null;
}

function falHeaders() {
  return {
    Authorization: `Key ${process.env.FAL_KEY}`,
    "Content-Type": "application/json",
  };
}

export function promptForStepScene(guide, stepNumber, extra = "", bible = null) {
  return composeStepPrompt({ kind: "scene", guide, stepNumber, extra, bible });
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
  const timeoutMs = falSceneTimeoutMs();
  ikealiveLog("3d", "model", { model: MODEL, queue: QUEUE });
  ikealiveLog("3d", "submit", {
    queue: QUEUE,
    promptChars: String(payload?.prompt || "").length,
    timeoutMs,
  });
  const submitted = await fetchFn(QUEUE, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!submitted.ok) {
    const detail = await submitted.text().catch(() => "");
    ikealiveWarn("3d", "submit failed", { status: submitted.status, detail: String(detail).slice(0, 180) });
    throw new Error(`fal submit ${submitted.status} ${detail.slice(0, 180)}`);
  }
  const ticket = await submitted.json();
  const immediate = meshUrlFrom(ticket);
  if (immediate) {
    ikealiveLog("3d", "mesh", { requestId: ticket.request_id || null, meshUrl: immediate, immediate: true });
    return ticket;
  }

  const requestId = ticket.request_id;
  if (!requestId) throw new Error("fal submit returned no request_id");
  // Submit path vs status/result: poll app-root /requests/$ID only (endpoint-scoped URLs 405).
  const { statusUrl, resultUrl } = queuePollUrls(requestId);
  ikealiveLog("3d", "queued", { requestId, statusUrl, resultUrl, timeoutMs });

  const started = now();
  const deadline = started + timeoutMs;
  let polls = 0;
  let lastState = "unknown";
  const pollHeaders = { Authorization: headers.Authorization };
  while (now() < deadline) {
    polls += 1;
    const elapsedMs = now() - started;
    const statusRes = await fetchFn(statusUrl, { method: "GET", headers: pollHeaders });
    if (!statusRes.ok) {
      ikealiveWarn("3d", "poll failed", { requestId, status: statusRes.status, polls, elapsedMs });
      throw new Error(`fal status ${statusRes.status}`);
    }
    const status = await statusRes.json();
    const state = String(status.status || "").toUpperCase();
    lastState = state || "unknown";
    ikealiveLog("3d", "poll", {
      requestId,
      state: lastState,
      polls,
      elapsedMs,
      queuePosition: status.queue_position ?? null,
    });
    if (state === "COMPLETED") {
      const done = await fetchFn(resultUrl, { method: "GET", headers: pollHeaders });
      if (!done.ok) {
        ikealiveWarn("3d", "result failed", { requestId, status: done.status, elapsedMs });
        throw new Error(`fal result ${done.status}`);
      }
      const body = await done.json();
      ikealiveLog("3d", "mesh", { requestId, meshUrl: meshUrlFrom(body), polls, elapsedMs });
      return body;
    }
    if (state === "FAILED" || state === "CANCELED") {
      ikealiveWarn("3d", "job failed", { requestId, state: lastState, elapsedMs });
      throw new Error(`fal ${state.toLowerCase()}`);
    }
    await sleep(FAL_SCENE_POLL_MS);
  }
  const elapsedMs = now() - started;
  ikealiveWarn("3d", "timeout", { requestId, polls, elapsedMs, lastStatus: lastState });
  throw new Error(`fal timeout after ${elapsedMs}ms (last status: ${lastState})`);
}

export async function renderStepScene({ guide, stepNumber, extra = "", bible = null, seed = null } = {}, deps = {}) {
  const locked = bible || sceneBibleFromGuide(guide);
  const lockedSeed = Number.isInteger(seed) ? seed : null;
  const prompt = promptForStepScene(guide, stepNumber, extra, locked);
  logSceneBible({ bible: locked, seed: lockedSeed, stepNumber, mode: "scene" });
  const local = {
    ok: false,
    live: false,
    provider: "none",
    partner: PARTNER,
    model: MODEL,
    prompt,
    meshUrl: null,
    bible: locked,
    seed: lockedSeed,
    reason: FAL_SCENE_REQUIRED,
  };

  if (!hasFal()) {
    ikealiveWarn("3d", "missing FAL_KEY — no Tripo mesh", { stepNumber, model: MODEL });
    return local;
  }

  ikealiveLog("3d", "render", {
    stepNumber,
    title: guide?.title || null,
    keyed: true,
    model: MODEL,
    sku: locked.sku,
    seed: lockedSeed,
  });
  const payload = {
    prompt,
    texture: true,
    pbr: true,
    texture_quality: "standard",
    geometry_quality: "standard",
    quad: false,
  };
  if (lockedSeed != null) {
    payload.model_seed = lockedSeed;
    payload.image_seed = lockedSeed;
    payload.texture_seed = lockedSeed;
  }
  const result = await falQueue(payload, deps);
  const meshUrl = meshUrlFrom(result);
  if (!meshUrl) throw new Error("fal returned no mesh url");
  ikealiveLog("3d", "mesh", { stepNumber, meshUrl, provider: "tripo-h3.1", model: MODEL });
  return {
    ...local,
    ok: true,
    live: true,
    provider: "tripo-h3.1",
    meshUrl,
    reason: null,
  };
}

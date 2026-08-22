/** Short interactive calls (health, chat, confirm). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/**
 * Seedance waits on the server up to DEFAULT_FAL_TIMEOUT_MS (15 min).
 * Keep the browser fetch at least that long, plus slack for HTTP overhead,
 * so the UI cannot show "AI request timed out" while fal is still polling.
 */
export const FAL_VIDEO_REQUEST_TIMEOUT_MS = 16 * 60 * 1000;

export function apiRoot(loc = globalThis.location) {
  const explicit = String(globalThis.__IKEALIVE_API_ORIGIN__ || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  if (loc?.protocol === "file:") {
    const queryPort = Number(new URLSearchParams(loc.search || "").get("apiPort"));
    const port = queryPort || Number(globalThis.__IKEALIVE_API_PORT__) || 8787;
    return `http://127.0.0.1:${port}`;
  }
  return "";
}

async function req(url, opts = {}) {
  const { headers, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: externalSignal, ...requestOptions } = opts;
  // Caller-owned signals (e.g. cancel parse) skip the default abort timer.
  const controller = externalSignal ? null : new AbortController();
  const ms = Number(timeoutMs);
  const applyTimeout = Boolean(controller) && Number.isFinite(ms) && ms > 0;
  const timeout = applyTimeout ? setTimeout(() => controller.abort(), ms) : null;
  try {
    const res = await fetch(`${apiRoot()}${url}`, {
      ...requestOptions,
      signal: externalSignal || controller?.signal,
      headers: { "Content-Type": "application/json", ...headers },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { ok: false, reason: text };
    }
    if (!res.ok) {
      // A refusal from the step gate is data, not a crash: 409/423 carry the reason.
      if (body && (res.status === 409 || res.status === 423 || res.status === 400)) return body;
      const error = new Error(body?.reason || body?.error || text || res.statusText);
      error.status = res.status;
      error.body = body;
      throw error;
    }
    return body;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The AI request timed out. Please try again.");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const post = (url, body, opts = {}) =>
  req(url, { ...opts, method: "POST", body: JSON.stringify(body || {}) });

async function postChat(body) {
  try {
    return await post("/api/chat", body);
  } catch (error) {
    // Older local servers exposed only this path. Keep Electron builds from
    // becoming unusable while the UI and bundled server are upgraded.
    if (error?.status === 404) return post("/api/agents/chat", body);
    throw error;
  }
}

export const api = {
  health: () => req("/api/health"),
  catalog: (q = {}) => {
    const p = new URLSearchParams(q);
    return req(`/api/catalog?${p}`);
  },
  project: () => req("/api/project"),
  diyCurrent: (model = []) => post("/api/project/diy", { model }),
  seed: () => post("/api/project/seed", { empty: true }),
  startFinishProject: (model = []) => post("/api/project/finish", { model }),
  finishJob: (id) => req(`/api/project/finish/${encodeURIComponent(id)}`),
  add: (partId, pose) => post("/api/project/add", { partId, pose }),
  remove: (id) => post("/api/project/remove", { id }),
  move: (body) => post("/api/project/move", body),
  duplicate: (id, offset) => post("/api/project/duplicate", { id, offset }),
  joint: (body) => post("/api/project/joint", body),
  checkpoint: (clientEdit) => post("/api/project/checkpoint", { clientEdit }),
  undo: () => post("/api/project/undo"),
  redo: () => post("/api/project/redo"),
  tape: (tapeId, pieceIds) => post("/api/project/tape", { tapeId, pieceIds }),
  cable: (body) => post("/api/project/cable", body),
  isolate: (pieceIds, label) => post("/api/project/isolate", { pieceIds, label }),
  label: (id, label) => post("/api/project/label", { id, label }),
  functions: () => req("/api/project/functions"),
  simStart: () => post("/api/project/sim/start"),
  simReset: () => post("/api/project/sim/reset"),
  simBehavior: (body) => post("/api/project/sim/behavior", body),
  physics: (body) => post("/api/physics/run", body),
  system: (body) => post("/api/physics/system", body),
  simRun: (body) => post("/api/physics/sim", body),
  bundle: (style) => post("/api/cables/bundle", { style }),

  // Guides: the official sheet is read-only, a pasted guide is yours to edit.
  official: (article) => req(`/api/ikeafy/official${article ? `?article=${encodeURIComponent(article)}` : ""}`),
  officialProducts: () => req("/api/ikeafy/official/products"),
  parseGuide: (guide, instructions, extra = {}) =>
    post("/api/ikeafy/parse", { guide, instructions, ...extra }),
  defaultGuide: () => req("/api/ikeafy/default"),
  expand: (step, note) => post("/api/ikeafy/expand", { step, note }),
  video: (body = {}) => post("/api/ikeafy/video", body),
  renderVideo: (body = {}, opts = {}) =>
    post("/api/ikeafy/video/render", body, { timeoutMs: FAL_VIDEO_REQUEST_TIMEOUT_MS, ...opts }),
  renderReel: (body = {}, opts = {}) =>
    post("/api/ikeafy/video/reel", body, { timeoutMs: FAL_VIDEO_REQUEST_TIMEOUT_MS, ...opts }),
  renderImage: (body = {}) => post("/api/ikeafy/image/render", body),
  renderScene: (body = {}) => post("/api/ikeafy/scene/render", body),
  render: (body = {}) => post("/api/ikeafy/render", body),
  colorize: (step) => post("/api/ikeafy/colorize", { step }),
  reviews: () => req("/api/ikeafy/reviews"),
  broken: (step, note, photoName = "broken.jpg") =>
    post("/api/ikeafy/broken", { step, note, photoName }),
  shopping: () => req("/api/ikeafy/shopping"),
  lookupManual: (productName) => post("/api/ikeafy/manual", { productName }),

  // Assembly runs — the server owns the cursor, so these are the only way forward.
  runStart: (body = {}, opts = {}) => post("/api/assembly/start", body, opts),
  runView: (id) => req(`/api/assembly/${id}`),
  runPeek: (id, step) => req(`/api/assembly/${id}/step/${step}`),
  runConfirm: (id, body = {}) => post(`/api/assembly/${id}/confirm`, body),
  runBack: (id, step) => post(`/api/assembly/${id}/back`, { step }),
  runSkip: (id, step) => post(`/api/assembly/${id}/skip`, { step }),
  runEdit: (id, step, patch = {}) => post(`/api/assembly/${id}/edit`, { step, ...patch }),
  runStuck: (id, note) => post(`/api/assembly/${id}/stuck`, { note }),

  fittings: () => req("/api/spares/fittings"),
  spare: (body = {}) => post("/api/spares/request", body),

  agents: () => req("/api/agents"),
  chat: (message, extra = {}) => postChat({ message, ...extra }),
  print: () => post("/api/export/print"),
  flash: (functions) => post("/api/firmware/generate", { functions }),
  runFw: (buttonDown) => post("/api/firmware/run", { buttonDown }),
  adapt: (body) => post("/api/adaptation/plan", body),
  scan: (body) => post("/api/adaptation/scan", body),
  scanPlan: (body) => post("/api/ikeafy/scan-plan", body),
  scanVideoUrl: (url) => `/api/scan/video?url=${encodeURIComponent(url)}`,
  scanVideoPost: (body) => post("/api/scan/video", body),
  phoneLink: () => req("/api/scan/phone-link"),
  scanInbox: () => req("/api/scan/inbox"),
  lan: () => req("/api/scan/phone-link"),
  roomVideoMeta: () => req("/api/scan/inbox"),
  roomVideoFile: async () => {
    const res = await fetch(`${apiRoot()}/api/phone/room-video/file`);
    if (!res.ok) {
      let reason = "No room video yet.";
      try {
        const body = await res.json();
        reason = body?.reason || reason;
      } catch {
        // ignore
      }
      throw new Error(reason);
    }
    return res.blob();
  },
};

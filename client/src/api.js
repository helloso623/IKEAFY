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
  const controller = opts.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 30_000) : null;
  const { headers, ...requestOptions } = opts;
  try {
    const res = await fetch(`${apiRoot()}${url}`, {
      ...requestOptions,
      signal: opts.signal || controller?.signal,
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

const post = (url, body) => req(url, { method: "POST", body: JSON.stringify(body || {}) });

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
  seed: () => post("/api/project/seed", { empty: true }),
  finishProject: () => post("/api/project/finish"),
  add: (partId, pose) => post("/api/project/add", { partId, pose }),
  remove: (id) => post("/api/project/remove", { id }),
  move: (body) => post("/api/project/move", body),
  duplicate: (id, offset) => post("/api/project/duplicate", { id, offset }),
  joint: (body) => post("/api/project/joint", body),
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
  renderVideo: (body = {}) => post("/api/ikeafy/video/render", body),
  renderReel: (body = {}) => post("/api/ikeafy/video/reel", body),
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
  runStart: (body = {}) => post("/api/assembly/start", body),
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

async function req(url, opts) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
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
}

const post = (url, body) => req(url, { method: "POST", body: JSON.stringify(body || {}) });

export const api = {
  health: () => req("/api/health"),
  catalog: (q = {}) => {
    const p = new URLSearchParams(q);
    return req(`/api/catalog?${p}`);
  },
  project: () => req("/api/project"),
  seed: (empty = false) => post("/api/project/seed", { empty }),
  add: (partId, pose) => post("/api/project/add", { partId, pose }),
  remove: (id) => post("/api/project/remove", { id }),
  move: (body) => post("/api/project/move", body),
  tape: (tapeId, pieceIds) => post("/api/project/tape", { tapeId, pieceIds }),
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
  colorize: (step) => post("/api/ikeafy/colorize", { step }),
  reviews: () => req("/api/ikeafy/reviews"),
  broken: (step, note, photoName = "broken.jpg") =>
    post("/api/ikeafy/broken", { step, note, photoName }),
  shopping: () => req("/api/ikeafy/shopping"),

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
  chat: (message, extra = {}) => post("/api/agents/chat", { message, ...extra }),
  print: () => post("/api/export/print"),
  flash: (functions) => post("/api/firmware/generate", { functions }),
  runFw: (buttonDown) => post("/api/firmware/run", { buttonDown }),
  adapt: (body) => post("/api/adaptation/plan", body),
};

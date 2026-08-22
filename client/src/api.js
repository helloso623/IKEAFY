async function req(url, opts) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const api = {
  health: () => req("/api/health"),
  catalog: (q = {}) => {
    const p = new URLSearchParams(q);
    return req(`/api/catalog?${p}`);
  },
  project: () => req("/api/project"),
  seed: (empty = false) => req("/api/project/seed", { method: "POST", body: JSON.stringify({ empty }) }),
  add: (partId, pose) => req("/api/project/add", { method: "POST", body: JSON.stringify({ partId, pose }) }),
  move: (body) => req("/api/project/move", { method: "POST", body: JSON.stringify(body) }),
  tape: (tapeId, pieceIds) =>
    req("/api/project/tape", { method: "POST", body: JSON.stringify({ tapeId, pieceIds }) }),
  isolate: (pieceIds, label) =>
    req("/api/project/isolate", { method: "POST", body: JSON.stringify({ pieceIds, label }) }),
  label: (id, label) => req("/api/project/label", { method: "POST", body: JSON.stringify({ id, label }) }),
  simStart: () => req("/api/project/sim/start", { method: "POST" }),
  simReset: () => req("/api/project/sim/reset", { method: "POST" }),
  physics: (body) => req("/api/physics/run", { method: "POST", body: JSON.stringify(body) }),
  system: (body) => req("/api/physics/system", { method: "POST", body: JSON.stringify(body) }),
  bundle: (style) => req("/api/cables/bundle", { method: "POST", body: JSON.stringify({ style }) }),
  parseGuide: (guide, instructions) =>
    req("/api/ikeafy/parse", { method: "POST", body: JSON.stringify({ guide, instructions }) }),
  defaultGuide: () => req("/api/ikeafy/default"),
  expand: (step, note) => req("/api/ikeafy/expand", { method: "POST", body: JSON.stringify({ step, note }) }),
  video: () => req("/api/ikeafy/video", { method: "POST", body: "{}" }),
  colorize: (step) => req("/api/ikeafy/colorize", { method: "POST", body: JSON.stringify({ step }) }),
  reviews: () => req("/api/ikeafy/reviews"),
  broken: (step, note) =>
    req("/api/ikeafy/broken", { method: "POST", body: JSON.stringify({ step, note, photoName: "broken.jpg" }) }),
  shopping: () => req("/api/ikeafy/shopping"),
  agents: () => req("/api/agents"),
  chat: (message, extra = {}) =>
    req("/api/agents/chat", { method: "POST", body: JSON.stringify({ message, ...extra }) }),
  print: () => req("/api/export/print", { method: "POST", body: "{}" }),
  flash: (functions) => req("/api/firmware/generate", { method: "POST", body: JSON.stringify({ functions }) }),
  runFw: (buttonDown) =>
    req("/api/firmware/run", { method: "POST", body: JSON.stringify({ buttonDown }) }),
  adapt: (body) => req("/api/adaptation/plan", { method: "POST", body: JSON.stringify(body) }),
};

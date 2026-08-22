import { api } from "./api.js";
import { createWorkshop } from "./workshop.js";
import { initStudio } from "./studio.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const shop = createWorkshop(view);
const partsById = {};
let project = { pieces: [], cables: [], tapes: [], chrome: null };
let selectedIds = [];
let costBarrier = "";
let studio = null;

function hud(text) {
  $("hud").textContent = text;
}

function inspect(text) {
  $("inspect").textContent = text;
}

/**
 * A table with four legs has no ports, no nets and no firmware. The server tells
 * us what is on the bench, and the electronics chrome is simply not drawn.
 */
function applyChrome(chrome) {
  const electronics = Boolean(chrome?.electronics);
  for (const node of document.querySelectorAll(".electronics-chrome")) {
    node.classList.toggle("hidden", !electronics);
  }
  const cables = $("cables-panel");
  if (cables) cables.classList.toggle("hidden", !chrome?.show?.cablesPanel);
  if (!electronics && chrome) hudChromeNote(chrome);
}

let lastChromeNote = "";
function hudChromeNote(chrome) {
  if (chrome.note === lastChromeNote) return;
  lastChromeNote = chrome.note;
}

async function refreshProject() {
  project = await api.project();
  shop.sync(project, partsById);
  applyChrome(project.chrome);
  $("cables").innerHTML = project.cables
    .map(
      (c) =>
        `<div class="item"><span>${c.fromPort} → ${c.toPort}</span><small>${c.locked ? "locked" : "loose"}</small></div>`,
    )
    .join("");
  renderBenchPieces();
}

function renderBenchPieces() {
  const list = $("bench-pieces");
  if (!list) return;
  if (!project.pieces.length) {
    list.innerHTML = `<p class="hint">Nothing on the bench. Add a piece from the shelf.</p>`;
    return;
  }
  list.innerHTML = project.pieces
    .map((piece) => {
      const part = partsById[piece.partId];
      return `<div class="item" data-piece="${piece.id}"><span>${part?.name || piece.partId}</span><small data-drop="${piece.id}">remove</small></div>`;
    })
    .join("");
}

async function loadCatalog() {
  const q = { q: $("search").value || "" };
  if ($("cost").value) q.maxCost = $("cost").value;
  const parts = await api.catalog(q);
  for (const p of parts) partsById[p.id] = p;
  const count = $("catalog-count");
  if (count) count.textContent = String(parts.length);
  $("catalog").innerHTML = parts
    .map(
      (p) =>
        `<div class="item" data-add="${p.id}"><span>${p.name}</span><small>$${p.cost} · ${p.dimsMm.x}×${p.dimsMm.z} mm · ${p.store}</small></div>`,
    )
    .join("");
}

$("catalog").addEventListener("click", async (ev) => {
  const item = ev.target.closest("[data-add]");
  const id = item?.dataset.add;
  if (!id) return;
  await api.add(id, { x: 0.25, y: 0.28, z: 0.1 });
  await refreshProject();
  hud(`Added ${partsById[id]?.name || id}`);
  (item.nextElementSibling || item)?.scrollIntoView({ block: "nearest" });
});

$("bench-pieces")?.addEventListener("click", async (ev) => {
  const drop = ev.target.closest("[data-drop]")?.dataset.drop;
  if (drop) {
    await removePiece(drop);
    return;
  }
  const id = ev.target.closest("[data-piece]")?.dataset.piece;
  if (id) {
    selectedIds = [id];
    const piece = project.pieces.find((p) => p.id === id);
    const part = partsById[piece?.partId];
    if (part) showPart(part, piece);
  }
});

$("search").addEventListener("input", loadCatalog);
$("cost").addEventListener("change", () => {
  costBarrier = $("cost").value;
  loadCatalog();
});

function isElectronics(part) {
  return part?.category === "electronics" || Boolean(part?.firmwareRole);
}

function showPart(part, piece) {
  const lines = [
    part.name,
    part.sku,
    `${part.dimsMm.x}×${part.dimsMm.y}×${part.dimsMm.z} mm · ${part.massG} g`,
    `$${part.cost} at ${part.store}`,
  ];
  if (isElectronics(part)) {
    lines.push(piece?.functionLabel ? `function: ${piece.functionLabel}` : "unlabeled");
    lines.push(`ports: ${(part.ports || []).map((x) => `${x.id}/${x.lock}`).join(", ") || "none"}`);
    if (part.firmwareRole) lines.push(`firmware: ${part.firmwareRole}`);
  }
  inspect(lines.join("\n"));
}

shop.onSelect((data) => {
  if (!data?.piece) return;
  selectedIds = [data.piece.id];
  showPart(data.part, data.piece);
});

$("lab-btns").addEventListener("click", async (ev) => {
  const test = ev.target.dataset.test;
  if (!test) return;
  const piece = shop.getSelected();
  const partId = piece?.part?.id || "lack-top";
  const report = await api.physics({
    partId,
    tapeId: "tape-gaffer",
    forceN: test === "speed" ? 12 : 180,
    rain: $("rain").checked,
    tempC: Number($("temp").value),
    aeroMs: 8,
    flowMs: 2,
  });
  const row = report.tests[test] || report.tests.strength;
  inspect(`${test.toUpperCase()}\n${row.note}\nfailed: ${report.failed.join(", ") || "none"}`);
  shop.setSim(true, {
    rain: test === "weather" && $("rain").checked,
    heat: Number($("temp").value) > 40,
    force: ["strength", "pressure", "speed", "aero"].includes(test),
  });
  $("sim-toggle").checked = true;
  hud(row.note);
});

$("sim-toggle").addEventListener("change", async (ev) => {
  if (ev.target.checked) {
    await api.simStart();
    shop.setSim(true, { force: true });
    hud("Simulation on — drag pieces, then Reset to restore.");
  } else {
    shop.setSim(false);
  }
});

$("reset-sim").addEventListener("click", async () => {
  await api.simReset();
  await refreshProject();
  shop.setSim(false);
  $("sim-toggle").checked = false;
  hud("Bench restored.");
});

async function applyTape(id) {
  const ids = selectedIds.length ? selectedIds : project.pieces.slice(0, 2).map((p) => p.id);
  await api.tape(id, ids);
  await refreshProject();
  hud(`Wrapped ${id} on the joint.`);
}
$("tape-elec").addEventListener("click", () => applyTape("tape-electrical"));
$("tape-gaff").addEventListener("click", () => applyTape("tape-gaffer"));

$("isolate-btn").addEventListener("click", async () => {
  const ids = project.pieces
    .filter((p) => isElectronics(partsById[p.partId]))
    .map((p) => p.id);
  if (!ids.length) return hud("Nothing electronic to isolate.");
  await api.isolate(ids, "lamp-board");
  hud("Electronics isolated as lamp-board.");
});

$("label-btn").addEventListener("click", async () => {
  const sel = shop.getSelected();
  if (!sel) return;
  const label =
    sel.part.firmwareRole === "led" ? "light" : sel.part.firmwareRole === "button" ? "sense" : "control";
  await api.label(sel.piece.id, label);
  inspect(`Labeled ${sel.part.name} as ${label}`);
});

$("bundle-loose").addEventListener("click", async () => hud((await api.bundle("loose")).note));
$("bundle-zip").addEventListener("click", async () => hud((await api.bundle("bundled")).note));
$("bundle-race").addEventListener("click", async () => hud((await api.bundle("channeled")).note));

$("print-btn").addEventListener("click", async () => {
  const job = await api.print();
  inspect(job.note + "\n" + job.jobs.map((j) => `${j.name} · ${j.minutes} min · ${j.material}`).join("\n"));
  hud(job.note);
});

$("flash-btn").addEventListener("click", async () => {
  const sketch = await api.flash(["light", "sense"]);
  const run = await api.runFw(false);
  inspect(sketch.source + "\n\nLED frames: " + run.frames.map((f) => (f.led ? "■" : "□")).join(" "));
  let i = 0;
  const timer = setInterval(() => {
    shop.setLed(run.frames[i % run.frames.length].led);
    i += 1;
    if (i > 16) clearInterval(timer);
  }, 200);
});

async function removePiece(id) {
  if (!id) return;
  const result = await api.remove(id);
  if (result?.ok === false) {
    hud(result.error || "Could not remove that piece.");
    return;
  }
  selectedIds = selectedIds.filter((x) => x !== id);
  inspect("");
  await refreshProject();
  hud(`Removed ${partsById[result.removed?.partId]?.name || "piece"}.`);
}

$("delete-piece").addEventListener("click", () => {
  const id = selectedIds[0] || shop.getSelected()?.piece?.id;
  if (!id) return hud("Pick a piece on the bench first.");
  removePiece(id);
});

function setMode(mode) {
  const app = $("app");
  app.dataset.mode = mode;
  app.classList.remove("mode-bench", "mode-ikeafy", "mode-house");
  app.classList.add(`mode-${mode}`);
  for (const btn of document.querySelectorAll("#modes button")) {
    btn.classList.toggle("on", btn.dataset.mode === mode);
  }
  for (const pane of document.querySelectorAll("[data-pane]")) {
    pane.classList.toggle("hidden", pane.dataset.pane !== mode);
  }
  for (const node of document.querySelectorAll(".bench-only")) {
    node.classList.toggle("hidden", mode !== "bench");
  }
  $("film").classList.toggle("hidden", mode !== "ikeafy");
  $("ar-photo").classList.toggle("hidden", mode !== "house");
  if (mode === "bench") applyChrome(project.chrome);
  shop.resize();
}

for (const btn of document.querySelectorAll("#modes button")) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}

$("adapt-btn").addEventListener("click", async () => {
  const plan = await api.adapt({
    widthM: Number($("room-w").value),
    depthM: Number($("room-d").value),
    budget: Number($("room-budget").value),
    want: "table",
    photoName: "room.jpg",
  });
  $("adapt-out").textContent = [
    `Pick: ${plan.pick.name} $${plan.pick.cost} (${plan.pick.store})`,
    `Place at ${plan.ordered[0].x.toFixed(2)} × ${plan.ordered[0].z.toFixed(2)} m`,
    plan.ordered[0].why,
    "",
    "CHEAPER FITS",
    ...plan.cheaper.map((c) => `• ${c.name} $${c.cost} save $${c.saved}`),
    "",
    plan.note,
  ].join("\n");
  drawRoom(plan);
});

$("room-photo").addEventListener("change", (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const c = $("ar-photo");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    c.classList.remove("hidden");
  };
  img.src = URL.createObjectURL(file);
});

function drawRoom(plan) {
  const c = $("ar-photo");
  const ctx = c.getContext("2d");
  if (!c.width) {
    c.width = 900;
    c.height = 560;
  }
  ctx.fillStyle = "#8a9aaa";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#d8c7a1";
  ctx.beginPath();
  ctx.moveTo(40, 520);
  ctx.lineTo(420, 300);
  ctx.lineTo(860, 520);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f3efe6";
  const x = 200 + plan.ordered[0].x * 80;
  const y = 360 + plan.ordered[0].z * 20;
  ctx.fillRect(x, y, 90, 12);
  ctx.fillStyle = "#e6d7bc";
  ctx.fillRect(x + 8, y + 12, 10, 40);
  ctx.fillRect(x + 72, y + 12, 10, 40);
  c.classList.remove("hidden");
}

$("chat-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const message = $("chat-in").value.trim();
  if (!message) return;
  $("chat-in").value = "";
  $("chat-log").innerHTML += `<div class="me">you: ${message}</div>`;
  const reply = await api.chat(message, {
    costBarrier,
    step: studio?.state?.run?.cursor,
    partId: shop.getSelected()?.part?.id,
  });
  $("chat-log").innerHTML += `<div><strong>${reply.agent.name}</strong> · ${reply.backend}<br>${reply.text}</div>`;
  $("chat-log").scrollTop = 9999;
  for (const action of reply.actions || []) {
    if (action.type === "camera") shop.setCamera(action);
    if (action.type === "adaptation") $("adapt-out").textContent = action.plan.note;
    if (action.type === "firmware") inspect(action.source);
  }
  await refreshProject();
});

window.addEventListener("keydown", (ev) => {
  const tag = ev.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
  if (ev.key === "g") shop.setMode("translate");
  if (ev.key === "r") shop.setMode("rotate");
  if (ev.key === "s" && ev.shiftKey) shop.setMode("scale");
  if (ev.key === "Backspace" || ev.key === "Delete") {
    ev.preventDefault();
    removePiece(selectedIds[0] || shop.getSelected()?.piece?.id);
  }
});

async function boot() {
  const [health, agents, all] = await Promise.all([api.health(), api.agents(), api.catalog({})]);
  for (const p of all) partsById[p.id] = p;
  const roster = agents.roster.map((a) => `<span class="${a.role}">${a.name} · ${a.model}</span>`).join("");
  $("agent-bar").innerHTML = roster;
  const studioBar = $("ikea-agent-bar");
  if (studioBar) studioBar.innerHTML = roster;

  studio = initStudio({ api, hud });
  window.__ikeafyStudio = studio;

  await loadCatalog();
  await refreshProject();
  setMode("ikeafy");
  hud(
    health.video?.live
      ? "Studio ready — step films render through Veed Fabric on fal.ai."
      : "Studio ready — official IKEA steps, one plate at a time. Films play as a local storyboard.",
  );
}

boot().catch((err) => {
  hud(String(err.message || err));
});

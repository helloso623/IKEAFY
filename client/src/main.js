import { api } from "./api.js";
import { createWorkshop } from "./workshop.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const shop = createWorkshop(view);
const partsById = {};
let project = { pieces: [], cables: [], tapes: [] };
let guide = null;
let videoPlan = null;
let stepIndex = 0;
let frameIndex = 0;
let selectedIds = [];
let costBarrier = "";

function hud(text) {
  $("hud").textContent = text;
}

function inspect(html) {
  $("inspect").innerHTML = html;
}

async function refreshProject() {
  project = await api.project();
  shop.sync(project, partsById);
  $("cables").innerHTML = project.cables
    .map(
      (c) =>
        `<div class="item"><span>${c.fromPort} → ${c.toPort}</span><small>${c.locked ? "locked" : "loose"}</small></div>`,
    )
    .join("");
}

async function loadCatalog() {
  const q = { q: $("search").value || "" };
  if ($("cost").value) q.maxCost = $("cost").value;
  const parts = await api.catalog(q);
  for (const p of parts) partsById[p.id] = p;
  $("catalog").innerHTML = parts
    .map(
      (p) =>
        `<div class="item" data-add="${p.id}"><span>${p.name}</span><small>$${p.cost} · ${p.dimsMm.x}×${p.dimsMm.z} mm · ${p.store}</small></div>`,
    )
    .join("");
}

$("catalog").addEventListener("click", async (ev) => {
  const id = ev.target.closest("[data-add]")?.dataset.add;
  if (!id) return;
  await api.add(id, { x: 0.25, y: 0.28, z: 0.1 });
  await refreshProject();
  hud(`Added ${partsById[id]?.name || id}`);
});

$("search").addEventListener("input", loadCatalog);
$("cost").addEventListener("change", () => {
  costBarrier = $("cost").value;
  loadCatalog();
});

shop.onSelect((data) => {
  if (!data?.piece) return;
  selectedIds = [data.piece.id];
  const p = data.part;
  inspect(
    `<strong>${p.name}</strong>\n${p.sku}\n${p.dimsMm.x}×${p.dimsMm.y}×${p.dimsMm.z} mm · ${p.massG} g\n$${p.cost} at ${p.store}\n${p.functionLabel ? `function: ${data.piece.functionLabel}` : "unlabeled"}\nports: ${(p.ports || []).map((x) => x.id + "/" + x.lock).join(", ") || "none"}`,
  );
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
    force: test === "strength" || test === "pressure" || test === "speed" || test === "aero",
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
  const ids = project.pieces.filter((p) => partsById[p.partId]?.category === "electronics").map((p) => p.id);
  await api.isolate(ids, "lamp-board");
  hud("Electronics isolated as lamp-board.");
});

$("label-btn").addEventListener("click", async () => {
  const sel = shop.getSelected();
  if (!sel) return;
  const label = sel.part.firmwareRole === "led" ? "light" : sel.part.firmwareRole === "button" ? "sense" : "control";
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

document.querySelectorAll("#modes button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#modes button").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    const mode = btn.dataset.mode;
    document.querySelectorAll("[data-pane]").forEach((p) => {
      p.classList.toggle("hidden", p.dataset.pane !== mode);
    });
    $("film").classList.toggle("hidden", mode !== "ikeafy");
    $("ar-photo").classList.toggle("hidden", mode !== "house");
  });
});

function renderGuide() {
  if (!guide) return;
  $("steps").innerHTML = guide.steps
    .map(
      (s) =>
        `<div class="item" data-step="${s.number}"><span>${s.number}. ${s.action} — ${s.body}</span><small>${s.toolRequired || "hands"}</small></div>`,
    )
    .join("");
  $("bom").textContent = [
    "INCLUDED",
    ...guide.bom.included.map((l) => `• ${l.qty}× ${l.name}`),
    "",
    "GET EXTRA",
    ...guide.bom.extra.map((l) => `• ${l.qty}× ${l.name} — ${l.store} ${l.storeUrl}`),
    `Total list $${guide.bom.total}`,
  ].join("\n");
}

function drawFilmFrame(frame) {
  const c = $("film-frame");
  const ctx = c.getContext("2d");
  c.width = 720;
  c.height = 220;
  ctx.fillStyle = "#d8c7a1";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#6b4b2a";
  ctx.fillRect(0, 170, c.width, 50);
  ctx.fillStyle = "#f3efe6";
  ctx.fillRect(260, 70 - frame.explode * 80, 200, 18);
  ctx.fillStyle = "#e6d7bc";
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(280 + i * 40, 90, 16, 70);
  }
  ctx.fillStyle = "#1b1914";
  ctx.font = "22px Newsreader, serif";
  ctx.fillText(frame.caption.slice(0, 70), 24, 36);
  ctx.fillStyle = "#ffda1a";
  ctx.fillRect(0, 0, 8, c.height);
}

async function playStep(n) {
  stepIndex = n;
  const step = videoPlan?.steps?.[n - 1];
  if (!step) return;
  $("film").classList.remove("hidden");
  frameIndex = 0;
  const run = () => {
    const frame = step.frames[frameIndex];
    if (!frame) return;
    drawFilmFrame(frame);
    $("film-caption").textContent = frame.caption;
    shop.setCamera(frame.camera);
    shop.explode(frame.explode);
    frameIndex += 1;
    if (frameIndex < step.frames.length) setTimeout(run, frame.durationMs);
    else hud("Waiting on you before the next plate.");
  };
  run();
}

$("parse-guide").addEventListener("click", async () => {
  guide = await api.parseGuide($("guide-in").value, $("guide-notes").value);
  videoPlan = await api.video();
  renderGuide();
  $("reviews").innerHTML = (await api.reviews())
    .map((r) =>
      r.reviews
        .map((rev) => `<div><strong>Step ${r.step}</strong> · ${rev.stars}★ ${rev.difficulty}<br>${rev.text}</div>`)
        .join(""),
    )
    .join("");
  playStep(1);
});

$("steps").addEventListener("click", (ev) => {
  const n = Number(ev.target.closest("[data-step]")?.dataset.step);
  if (n) playStep(n);
});

$("film-wait").addEventListener("click", () => playStep(stepIndex + 1));
$("film-back").addEventListener("click", () => playStep(Math.max(1, stepIndex - 1)));
$("film-stuck").addEventListener("click", async () => {
  const exp = await api.expand(stepIndex, "I cannot do this step");
  inspect(exp.step?.detail || "No expand");
  hud("Expanded the plate. Spare + review fix are in inspect.");
});

$("colorize").addEventListener("click", async () => {
  const plate = await api.colorize(stepIndex || 1);
  inspect("COLORIZED PLATE\n" + plate.fills.map((f) => `${f.name} ${f.color} ${f.texture}`).join("\n"));
  hud(plate.note);
});

$("broken-btn").addEventListener("click", async () => {
  const result = await api.broken(stepIndex || 4, $("broken-note").value);
  inspect(
    `BREAK on step ${result.step}\n${result.identified}\nFIX: ${result.fix}\nSPARE: ${result.spare?.name} $${result.spare?.cost} @ ${result.spare?.store}\n${result.spare?.storeUrl || ""}`,
  );
});

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
  const reply = await api.chat(message, { costBarrier, step: stepIndex, partId: shop.getSelected()?.part?.id });
  $("chat-log").innerHTML += `<div><strong>${reply.agent.name}</strong> · ${reply.backend}<br>${reply.text}</div>`;
  $("chat-log").scrollTop = 9999;
  for (const action of reply.actions || []) {
    if (action.type === "camera") shop.setCamera(action);
    if (action.type === "ikeafy") {
      guide = action.guide;
      renderGuide();
    }
    if (action.type === "adaptation") $("adapt-out").textContent = action.plan.note;
    if (action.type === "firmware") inspect(action.source);
  }
  await refreshProject();
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "g") shop.setMode("translate");
  if (ev.key === "r") shop.setMode("rotate");
  if (ev.key === "s" && ev.shiftKey) shop.setMode("scale");
});

async function boot() {
  const [health, agents, all] = await Promise.all([api.health(), api.agents(), api.catalog({})]);
  for (const p of all) partsById[p.id] = p;
  $("agent-bar").innerHTML = agents.roster
    .map((a) => `<span class="${a.role}">${a.name} · ${a.model}</span>`)
    .join("");
  guide = await api.defaultGuide();
  $("guide-in").value = guide.raw;
  $("guide-notes").value = guide.instructions || "";
  videoPlan = await api.video();
  renderGuide();
  $("reviews").innerHTML = (await api.reviews())
    .flatMap((r) => r.reviews.map((rev) => `<div>Step ${r.step}: ${rev.difficulty}</div>`))
    .join("");
  await loadCatalog();
  await refreshProject();
  hud(
    health.hostedAgents
      ? "Hosted agents ready. Local steward still on the bench."
      : "Local steward is driving all 10 agents. Drop a piece or parse the LACK guide.",
  );
}

boot().catch((err) => {
  hud(String(err.message || err));
});

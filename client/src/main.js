import { api } from "./api.js";
import { bindOmnibox, catalogNeedle, ensureOmnibox, parseBudget } from "./omnibox.js";
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

const EMPTY_INSPECT = "Nothing selected.";

function inspect(text) {
  $("inspect").textContent = text;
}

function showEmptyInspect() {
  inspect(EMPTY_INSPECT);
}

function selectedPieceId() {
  const id = selectedIds[0] || shop.getSelected()?.piece?.id;
  if (id && project.pieces.some((p) => p.id === id)) return id;
  return "";
}

function syncDeleteButton() {
  const btn = $("delete-piece");
  if (!btn) return;
  const available = Boolean(selectedPieceId());
  btn.disabled = !available;
  btn.classList.toggle("refuses", !available);
  btn.title = available ? "Delete this piece" : "Pick a piece, then Delete.";
}

function money(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "";
  return `$${value % 1 ? value.toFixed(2) : value}`;
}

function sizePlain(part) {
  const d = part?.dimsMm;
  if (!d) return "";
  const sides = [d.x, d.y, d.z]
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  if (!sides.length) return "";
  const cm = (mm) => Math.max(1, Math.round(mm / 10));
  return `About ${cm(sides[0])} × ${cm(sides[1] || sides[0])} cm`;
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

applyChrome(project.chrome);
showEmptyInspect();
syncDeleteButton();

let lastChromeNote = "";
function hudChromeNote(chrome) {
  // Server chrome notes talk about ports and firmware. Keep them off the HUD.
  if (!chrome || chrome.electronics) return;
  lastChromeNote = chrome.note || lastChromeNote;
}

async function refreshProject() {
  project = await api.project();
  shop.sync(project, partsById);
  applyChrome(project.chrome);
  const still = selectedIds.filter((id) => project.pieces.some((p) => p.id === id));
  const lostSelection = selectedIds.length > 0 && still.length === 0;
  selectedIds = still;
  if (lostSelection) showEmptyInspect();
  syncDeleteButton();
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
      return `<div class="item" data-piece="${piece.id}"><span>${part?.name || piece.partId}</span><small data-drop="${piece.id}">Delete</small></div>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function searchBoxes() {
  return [$("omnibox"), $("search")].filter(Boolean);
}

function activeQuery() {
  const focused = searchBoxes().find((node) => node === document.activeElement);
  return String(focused?.value ?? $("omnibox")?.value ?? $("search")?.value ?? "");
}

function catalogEmptyHtml(typed, budget) {
  const query = escapeHtml(String(typed || "").trim());
  const cap = budget ? ` under $${escapeHtml(budget)}` : "";
  if (query) {
    return `<div class="hint empty-catalog">Nothing on the shelf matches “${query}”${cap}. Try a shorter name, or <button type="button" class="quiet" data-ask="${query}">Ask the shop</button>.</div>`;
  }
  return `<p class="hint empty-catalog">Nothing on the shelf${cap}. Raise the budget or clear the filter.</p>`;
}

function updateCatalogHint(parts, typed) {
  const hint = $("catalog-hint");
  const query = String(typed || "").trim();
  const count = parts.length;
  if (!hint) {
    const node = $("catalog-count");
    if (node) node.textContent = String(count);
    return;
  }
  if (query && !count) {
    hint.innerHTML = `No matches for “${escapeHtml(query)}”. Ask, or try “table” or “lack”.`;
  } else if (query) {
    hint.innerHTML = `<span id="catalog-count">${count}</span> match${count === 1 ? "" : "es"} for “${escapeHtml(query)}”.`;
  } else {
    hint.innerHTML = `The shelf scrolls — <span id="catalog-count">${count}</span> parts in the catalogue.`;
  }
}

async function loadCatalog(raw) {
  const typed = raw == null ? activeQuery() : String(raw);
  const q = { q: catalogNeedle(typed) };
  const budget = $("cost")?.value || parseBudget(typed);
  if (budget) q.maxCost = budget;
  const parts = await api.catalog(q);
  for (const p of parts) partsById[p.id] = p;
  updateCatalogHint(parts, typed);
  const shelf = $("catalog");
  if (!shelf) return;
  shelf.innerHTML = parts.length
    ? parts
        .map(
          (p) =>
            `<div class="item" data-add="${p.id}"><span>${p.name}</span><small>${money(p.cost)}${p.store ? ` · ${p.store}` : ""}</small></div>`,
        )
        .join("")
    : catalogEmptyHtml(typed, budget);
}

function appendChat(who, text, backend) {
  const line =
    who === "you"
      ? `<div class="me">you: ${escapeHtml(text)}</div>`
      : `<div><strong>${escapeHtml(who)}</strong>${backend ? ` · ${escapeHtml(backend)}` : ""}<br>${escapeHtml(text)}</div>`;
  for (const id of ["chat-log", "ikea-chat-log"]) {
    const log = $(id);
    if (!log) continue;
    log.insertAdjacentHTML("beforeend", line);
    log.scrollTop = log.scrollHeight;
  }
}

async function askShop(message) {
  const text = String(message || "").trim();
  if (!text) return;
  appendChat("you", text);
  hud("Asking the shop…");
  try {
    const reply = await api.chat(text, {
      costBarrier: $("cost")?.value || parseBudget(text) || costBarrier,
      step: studio?.state?.run?.cursor,
      partId: shop.getSelected()?.part?.id,
    });
    appendChat(reply.agent?.name || "Shop", reply.text || "", reply.backend);
    for (const action of reply.actions || []) {
      if (action.type === "camera") shop.setCamera(action);
      if (action.type === "adaptation" && $("adapt-out")) $("adapt-out").textContent = action.plan.note;
      if (action.type === "firmware" && isElectronics(shop.getSelected()?.part)) {
        inspect("The board is programmed.");
      }
    }
    await refreshProject();
    hud(reply.agent?.name ? `${reply.agent.name} answered.` : "Shop answered.");
  } catch (err) {
    appendChat("shop", err.message || "The shop could not answer.");
    hud("The shop could not answer.");
  }
}

const omnibox = ensureOmnibox();
bindOmnibox({
  boxes: searchBoxes(),
  form: omnibox.form || $("omnibox-form"),
  askButton: omnibox.ask || $("omnibox-ask"),
  onFilter: (query) => loadCatalog(query),
  onAsk: (query) => {
    loadCatalog(query);
    askShop(query);
  },
});

$("catalog").addEventListener("click", async (ev) => {
  const ask = ev.target.closest("[data-ask]");
  if (ask) {
    askShop(ask.dataset.ask || activeQuery());
    return;
  }
  const item = ev.target.closest("[data-add]");
  const id = item?.dataset.add;
  if (!id) return;
  const added = await api.add(id, { x: 0.25, y: 0.28, z: 0.1 });
  await refreshProject();
  const piece = added?.id ? project.pieces.find((p) => p.id === added.id) : project.pieces.at(-1);
  const part = partsById[id];
  if (piece && part) {
    selectedIds = [piece.id];
    showPart(part, piece);
  }
  hud(`Added ${part?.name || id}.`);
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
    else syncDeleteButton();
  }
});

$("cost")?.addEventListener("change", () => {
  costBarrier = $("cost").value;
  loadCatalog(activeQuery());
});

function isElectronics(part) {
  return part?.category === "electronics" || Boolean(part?.firmwareRole);
}

function showPart(part, piece) {
  const lines = [part.name];
  const size = sizePlain(part);
  const price = money(part.cost);
  const shopLine = [size, price && part.store ? `${price} at ${part.store}` : price].filter(Boolean).join(" · ");
  if (shopLine) lines.push(shopLine);
  if (isElectronics(part)) {
    if (piece?.functionLabel) lines.push(`Job: ${piece.functionLabel}`);
    const plugs = (part.ports || []).map((x) => x.id);
    if (plugs.length) lines.push(`Plugs: ${plugs.join(", ")}`);
  }
  lines.push("Delete takes this off the bench.");
  inspect(lines.join("\n"));
  syncDeleteButton();
}

shop.onSelect((data) => {
  if (!data?.piece) {
    selectedIds = [];
    showEmptyInspect();
    syncDeleteButton();
    return;
  }
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
  const testName = ev.target.textContent.trim() || test;
  inspect(
    `${testName}\n${row.note}\n${report.failed?.length ? "That one did not hold." : "Still in one piece."}`,
  );
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
    hud("Play is on. Drag things around. Reset puts them back.");
  } else {
    shop.setSim(false);
  }
});

$("reset-sim").addEventListener("click", async () => {
  await api.simReset();
  await refreshProject();
  shop.setSim(false);
  $("sim-toggle").checked = false;
  hud("Back as it was.");
});

async function applyTape(id) {
  const ids = selectedIds.length ? selectedIds : project.pieces.slice(0, 2).map((p) => p.id);
  await api.tape(id, ids);
  await refreshProject();
  hud(id === "tape-electrical" ? "Wrapped electrical tape on the join." : "Wrapped gaffer tape on the join.");
}
$("tape-elec").addEventListener("click", () => applyTape("tape-electrical"));
$("tape-gaff").addEventListener("click", () => applyTape("tape-gaffer"));

$("isolate-btn").addEventListener("click", async () => {
  const ids = project.pieces
    .filter((p) => isElectronics(partsById[p.partId]))
    .map((p) => p.id);
  if (!ids.length) return hud("No lights or boards to group.");
  await api.isolate(ids, "lamp-board");
  hud("Grouped the electrics as one board.");
});

$("label-btn").addEventListener("click", async () => {
  const sel = shop.getSelected();
  if (!sel) return;
  const label =
    sel.part.firmwareRole === "led" ? "light" : sel.part.firmwareRole === "button" ? "sense" : "control";
  await api.label(sel.piece.id, label);
  inspect(`${sel.part.name} is now the ${label}.`);
});

$("bundle-loose").addEventListener("click", async () => hud((await api.bundle("loose")).note));
$("bundle-zip").addEventListener("click", async () => hud((await api.bundle("bundled")).note));
$("bundle-race").addEventListener("click", async () => hud((await api.bundle("channeled")).note));

$("print-btn").addEventListener("click", async () => {
  const job = await api.print();
  const jobs = job.jobs || [];
  inspect(
    jobs.length
      ? ["Ready to print.", ...jobs.map((j) => `${j.name} · about ${j.minutes} min`)].join("\n")
      : "Nothing here is ready to print.",
  );
  hud(jobs.length ? "Ready to print." : "Nothing here is ready to print.");
});

$("flash-btn").addEventListener("click", async () => {
  await api.flash(["light", "sense"]);
  const run = await api.runFw(false);
  const sel = shop.getSelected();
  if (isElectronics(sel?.part)) {
    inspect(`The light blinks.\n${run.frames.map((f) => (f.led ? "■" : "□")).join(" ")}`);
  }
  hud("The light blinks.");
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
    hud(result.error || "Could not delete that piece.");
    return;
  }
  const wasSelected = selectedIds.includes(id);
  selectedIds = selectedIds.filter((x) => x !== id);
  if (wasSelected) showEmptyInspect();
  syncDeleteButton();
  await refreshProject();
  hud(`Deleted ${partsById[result.removed?.partId]?.name || "that piece"}.`);
}

$("delete-piece").addEventListener("click", () => {
  const id = selectedPieceId();
  if (!id) return hud("Pick a piece, then Delete.");
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
  for (const rail of document.querySelectorAll(".rail")) {
    rail.classList.remove("hidden");
  }
  for (const pane of document.querySelectorAll("[data-pane]")) {
    pane.classList.toggle("hidden", pane.dataset.pane !== mode);
  }
  for (const node of document.querySelectorAll(".bench-only")) {
    node.classList.toggle("hidden", mode !== "bench");
  }
  $("film").classList.toggle("hidden", mode !== "ikeafy");
  $("ar-photo").classList.toggle("hidden", mode !== "house");
  if (mode === "bench") {
    applyChrome(project.chrome);
    hud(project.pieces.length ? "Pick a piece, move it, or Delete it." : "Add a piece from the shelf.");
  }
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

$("chat-form")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const message = $("chat-in").value.trim();
  if (!message) return;
  $("chat-in").value = "";
  await askShop(message);
});

window.addEventListener("keydown", (ev) => {
  const tag = ev.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
  if (ev.key === "g") shop.setMode("translate");
  if (ev.key === "r") shop.setMode("rotate");
  if (ev.key === "s" && ev.shiftKey) shop.setMode("scale");
  if (ev.key === "Backspace" || ev.key === "Delete") {
    ev.preventDefault();
    const id = selectedPieceId();
    if (!id) return hud("Pick a piece, then Delete.");
    removePiece(id);
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
      ? "Drop an IKEA PDF — Veed Fabric will build the reel."
      : "Drop an IKEA PDF — the reel plays as a local storyboard until FAL_KEY is set.",
  );
}

boot().catch((err) => {
  hud(String(err.message || err));
});

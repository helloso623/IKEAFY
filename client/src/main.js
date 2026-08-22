import { api } from "./api.js";
import { bindOmnibox, catalogNeedle, ensureOmnibox, parseBudget } from "./omnibox.js";
import { initHouse } from "./house.js";
import { initLabStrip } from "./lab.js";
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
let house = null;

function hud(text) {
  $("hud").textContent = text;
}

const EMPTY_INSPECT = "Nothing selected.";
const PIECE_FUNCTIONS = ["support", "light", "sense", "control", "decorate"];
const ELECTRONICS_FUNCTIONS = ["light", "sense", "control"];
let ledTimer = null;

function inspect(text) {
  $("inspect").textContent = text;
}

function showEmptyInspect() {
  inspect(EMPTY_INSPECT);
  syncFunctionStrip();
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

house = initHouse({ api, hud });
applyChrome(project.chrome);
showEmptyInspect();
syncDeleteButton();
syncFunctionStrip();

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
  syncFunctionStrip();
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
      const job = piece.functionLabel ? ` · ${piece.functionLabel}` : "";
      return `<div class="item" data-piece="${piece.id}"><span>${part?.name || piece.partId}${job}</span><small data-drop="${piece.id}">Delete</small></div>`;
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

async function applyShopActions(actions) {
  const added = [];
  for (const action of actions || []) {
    if (!action) continue;
    if (action.type === "add" || action.type === "add_part") {
      if (action.applied && action.piece?.id) {
        added.push(action.piece);
        continue;
      }
      if (!action.partId) continue;
      const piece = await api.add(action.partId, action.pose || {});
      added.push(piece);
    } else if (action.type === "camera") {
      shop.setCamera(action);
    } else if (action.type === "label") {
      if (action.applied) continue;
      const id = action.id || added.find((p) => p.partId === action.partId)?.id;
      if (id && action.label) await api.label(id, action.label);
    } else if (action.type === "isolate") {
      if (action.applied) continue;
      const ids = action.pieceIds?.length ? action.pieceIds : added.map((p) => p.id).filter(Boolean);
      if (ids.length) await api.isolate(ids, action.label || "board");
    } else if (action.type === "adaptation" && action.plan) {
      setMode("lab");
      house?.applyPlan(action.plan);
    } else if (action.type === "firmware" && isElectronics(shop.getSelected()?.part)) {
      inspect("The board is programmed.");
    }
  }
  return added;
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
    await applyShopActions(reply.actions);
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

function suggestFunction(part) {
  if (part?.firmwareRole === "led") return "light";
  if (part?.firmwareRole === "button") return "sense";
  if (part?.firmwareRole === "mcu") return "control";
  if (part?.category === "electronics") return "control";
  if (part?.shape === "post" || /leg/.test(part?.id || "")) return "support";
  if (part?.category === "furniture") return "support";
  return "decorate";
}

function selectedPiece() {
  const id = selectedPieceId();
  if (!id) return null;
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  return { piece, part: partsById[piece.partId] };
}

function syncFunctionStrip() {
  const picked = selectedPiece();
  const hint = $("fn-hint");
  if (hint) {
    hint.textContent = picked
      ? picked.piece.functionLabel
        ? `${picked.part?.name || "This piece"} is ${picked.piece.functionLabel}.`
        : `Assign a job to ${picked.part?.name || "this piece"}.`
      : "Pick a piece, then assign a job.";
  }
  const row = $("fn-btns");
  if (!row) return;
  for (const btn of row.querySelectorAll("[data-fn]")) {
    const fn = btn.dataset.fn;
    btn.disabled = !picked;
    btn.classList.toggle("on", Boolean(picked && picked.piece.functionLabel === fn));
  }
}

function playLedFrames(run) {
  if (ledTimer) clearInterval(ledTimer);
  if (!run?.frames?.length) return;
  let i = 0;
  ledTimer = setInterval(() => {
    shop.setLed(run.frames[i % run.frames.length].led);
    i += 1;
    if (i > 16) {
      clearInterval(ledTimer);
      ledTimer = null;
    }
  }, 200);
}

function showPart(part, piece) {
  const lines = [part.name];
  const size = sizePlain(part);
  const price = money(part.cost);
  const shopLine = [size, price && part.store ? `${price} at ${part.store}` : price].filter(Boolean).join(" · ");
  if (shopLine) lines.push(shopLine);
  if (piece?.functionLabel) lines.push(`Job: ${piece.functionLabel}`);
  if (isElectronics(part)) {
    const plugs = (part.ports || []).map((x) => x.id);
    if (plugs.length) lines.push(`Plugs: ${plugs.join(", ")}`);
  }
  lines.push("Delete takes this off the bench.");
  inspect(lines.join("\n"));
  syncDeleteButton();
  syncFunctionStrip();
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

$("fn-btns").addEventListener("click", async (ev) => {
  const fn = ev.target.closest("[data-fn]")?.dataset.fn;
  if (!fn || !PIECE_FUNCTIONS.includes(fn)) return;
  const picked = selectedPiece() || shop.getSelected();
  if (!picked?.piece) return hud("Pick a piece, then assign a job.");
  await api.label(picked.piece.id, fn);
  await refreshProject();
  const piece = project.pieces.find((p) => p.id === picked.piece.id);
  const part = partsById[piece?.partId] || picked.part;
  if (part && piece) showPart(part, piece);
  hud(`${part?.name || "Piece"} is now ${fn}.`);
});

$("sim-behavior").addEventListener("click", async () => {
  const rain = Boolean($("rain")?.checked);
  const tempC = Number($("temp")?.value || 22);
  hud("Running the behavior suite…");
  const result = await api.simBehavior({
    rain,
    tempC,
    tapeId: "tape-gaffer",
    forceN: 180,
    aeroMs: 8,
    flowMs: 2,
  });
  const notes = result.notes?.length ? result.notes : ["Behavior suite finished."];
  inspect(notes.join("\n"));
  hud(notes[0]);
  shop.setSim(true, {
    rain,
    heat: tempC > 40,
    force: true,
  });
  $("sim-toggle").checked = true;
  const fwFns = result.functions || [];
  if (fwFns.some((fn) => ELECTRONICS_FUNCTIONS.includes(fn))) {
    await api.flash(fwFns);
    const run = result.firmware || (await api.runFw(false));
    playLedFrames(run);
  }
});

$("label-btn").addEventListener("click", async () => {
  const sel = selectedPiece() || shop.getSelected();
  if (!sel?.piece) return hud("Pick a piece, then assign a job.");
  const label = suggestFunction(sel.part);
  await api.label(sel.piece.id, label);
  await refreshProject();
  const piece = project.pieces.find((p) => p.id === sel.piece.id);
  const part = partsById[piece?.partId] || sel.part;
  if (part && piece) showPart(part, piece);
  hud(`${part?.name || "Piece"} is now ${label}.`);
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
  const labeled = project.pieces.map((p) => p.functionLabel).filter((fn) => ELECTRONICS_FUNCTIONS.includes(fn));
  const functions = labeled.length ? [...new Set(labeled)] : ["light", "sense"];
  await api.flash(functions);
  const run = await api.runFw(false);
  const sel = shop.getSelected();
  if (isElectronics(sel?.part)) {
    inspect(`The light blinks.\n${run.frames.map((f) => (f.led ? "■" : "□")).join(" ")}`);
  }
  hud("The light blinks.");
  playLedFrames(run);
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
  if (mode === "lab" || mode === "house" || mode === "bench") mode = "lab";
  else mode = "ikeafy";
  const app = $("app");
  const inLab = mode === "lab";
  app.dataset.mode = mode;
  app.classList.remove("mode-bench", "mode-ikeafy", "mode-house", "mode-lab");
  app.classList.add(`mode-${mode}`);
  app.classList.toggle("lab-open", inLab);
  for (const btn of document.querySelectorAll("#modes button")) {
    btn.classList.toggle("on", btn.dataset.mode === mode);
  }
  for (const rail of document.querySelectorAll(".rail")) {
    rail.classList.remove("hidden");
  }
  const visiblePanes = inLab ? new Set(["bench", "house", "lab"]) : new Set(["ikeafy"]);
  for (const pane of document.querySelectorAll("[data-pane]")) {
    pane.classList.toggle("hidden", !visiblePanes.has(pane.dataset.pane));
  }
  for (const node of document.querySelectorAll(".bench-only, .lab-only")) {
    node.classList.toggle("hidden", !inLab);
  }
  $("film").classList.toggle("hidden", inLab);
  house?.setActive(inLab);
  if (inLab) {
    applyChrome(project.chrome);
    hud(
      project.pieces.length
        ? "Pick a piece on the bench, or fit it in the room."
        : "Add a piece from the shelf, or fit a table in the room.",
    );
  }
  shop.resize();
}

for (const btn of document.querySelectorAll("#modes button")) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}

$("back-ikealive")?.addEventListener("click", (ev) => {
  ev.preventDefault();
  setMode("ikeafy");
});

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
  initLabStrip({ api, shop, hud, getProject: () => project, partsById, refreshProject });
  setMode("ikeafy");
  hud(
    health.video?.live
      ? "Drop an IKEA PDF — Seedance 2.5 will build the reel."
      : "Drop an IKEA PDF. Set FAL_KEY for Seedance 2.5 films — the reel is a live MP4, not a table drawing.",
  );
}

boot().catch((err) => {
  hud(String(err.message || err));
});

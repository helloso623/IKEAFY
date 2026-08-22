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
let project = { pieces: [], cables: [], tapes: [], chrome: null, netlist: null, erc: null };
let selectedIds = [];
let costBarrier = "";
let studio = null;
let house = null;
// KiCad bench: half-drawn wire and the net lit up from the netlist panel.
let pendingPort = null;
let highlightedNet = null;

function hud(text) {
  $("hud").textContent = text;
}

const EMPTY_INSPECT = "Nothing selected.";
const PIECE_FUNCTIONS = ["support", "light", "sense", "control", "decorate"];

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
  syncEditButtons();
}

function poseHint(piece) {
  if (!piece) return "Click a piece to move it. Q select, G move, R rotate, S scale.";
  const mm = (n) => Math.round((Number(n) || 0) * 1000);
  const deg = (n) => Math.round(((Number(n) || 0) * 180) / Math.PI);
  return `${mm(piece.x)} × ${mm(piece.z)} mm · ${deg(piece.ry)}° · ×${Number(piece.sx || 1).toFixed(1)}`;
}

function syncEditButtons() {
  const available = Boolean(selectedPieceId());
  const edit = project.edit || {};
  const deleteBtn = $("delete-piece");
  if (deleteBtn) {
    deleteBtn.disabled = !available;
    deleteBtn.classList.toggle("refuses", !available);
    deleteBtn.title = available ? "Delete this piece" : "Pick a piece, then Delete.";
  }
  const dup = $("duplicate-piece");
  if (dup) {
    dup.disabled = !available;
    dup.title = available ? "Duplicate this piece" : "Pick a piece, then Duplicate.";
  }
  const undoBtn = $("undo-edit");
  if (undoBtn) undoBtn.disabled = !edit.canUndo;
  const redoBtn = $("redo-edit");
  if (redoBtn) redoBtn.disabled = !edit.canRedo;
  for (const btn of document.querySelectorAll("[data-undo]")) btn.disabled = !edit.canUndo;
  for (const btn of document.querySelectorAll("[data-redo]")) btn.disabled = !edit.canRedo;
  for (const btn of document.querySelectorAll("[data-duplicate]")) btn.disabled = !available;
  const pose = $("edit-pose");
  if (pose) {
    const picked = selectedPiece();
    pose.textContent = available
      ? `${poseHint(picked?.piece || shop.getSelectedPose())}. Delete / Ctrl+D / Ctrl+Z.`
      : "Click a piece to move it. Q select, G move, R rotate, S scale.";
  }
  const mode = shop.getMode?.() || "translate";
  for (const btn of document.querySelectorAll("[data-edit]")) {
    btn.classList.toggle("on", btn.dataset.edit === mode);
  }
  const modeFlag = $("lab-mode-flag");
  if (modeFlag) {
    const toolNames = { select: "Select", translate: "Move", rotate: "Rotate", scale: "Scale" };
    modeFlag.textContent = `Tool · ${toolNames[mode] || "Move"}`;
  }
  const snapOn = shop.getSnap?.() !== false;
  const snapBtn = $("edit-snap");
  if (snapBtn) {
    snapBtn.classList.toggle("on", snapOn);
    snapBtn.setAttribute("aria-pressed", snapOn ? "true" : "false");
  }
  for (const btn of document.querySelectorAll("[data-snap]")) {
    btn.classList.toggle("on", snapOn);
    btn.setAttribute("aria-pressed", snapOn ? "true" : "false");
  }
  const flag = $("snap-flag");
  if (flag) flag.textContent = snapOn ? "Snap on" : "Snap off";
  renderProps();
}

/* Properties N-panel: Location (mm), Rotation (deg), Scale, and Dimensions
   (mm, part dims × scale) for the selected body. Edits land as api.move. */
function renderProps() {
  const box = $("lab-props");
  if (!box) return;
  const picked = selectedPiece();
  const piece = picked?.piece;
  const dims = picked?.part?.dimsMm;
  for (const input of box.querySelectorAll("input")) {
    const prop = input.dataset.prop;
    const dim = input.dataset.dim;
    const off = !piece || (dim && !dims);
    input.disabled = off;
    if (document.activeElement === input) continue;
    if (off) {
      input.value = "";
      continue;
    }
    if (prop) {
      const raw = Number(piece[prop] ?? (prop[0] === "s" ? 1 : 0));
      if (prop === "x" || prop === "y" || prop === "z") input.value = String(Math.round(raw * 1000));
      else if (prop[0] === "r") input.value = String(Math.round((raw * 180) / Math.PI));
      else input.value = (raw || 1).toFixed(2);
    } else if (dim) {
      const scale = Number(piece[`s${dim}`] ?? 1) || 1;
      input.value = String(Math.max(1, Math.round((Number(dims[dim]) || 0) * scale)));
    }
  }
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
 * The server decides what the bench shows. Furniture keeps the EDA chrome
 * hidden; electronics on the bench flip the sheet to KiCad — net strip over
 * the viewport, netlist + ERC in the inspector, isolate-as-board in reach.
 * chrome.electronics is the only gate: never behind "more tools".
 */
function applyChrome(chrome) {
  const electronics = Boolean(chrome?.electronics);
  const inLab = $("app")?.dataset.mode === "lab";
  for (const node of document.querySelectorAll(".electronics-chrome")) {
    const benchOnly = node.classList.contains("bench-only");
    node.classList.toggle("hidden", !electronics || (benchOnly && !inLab));
  }
  const noNets = $("no-nets-hint");
  if (noNets) noNets.classList.toggle("hidden", electronics);
  shop.setEda?.(electronics && inLab);
  if (!electronics) {
    pendingPort = null;
    highlightedNet = null;
    shop.setPendingPort?.(null);
    shop.highlightNet?.(null);
  }
  renderNetlist();
  renderErc();
  renderNetStrip();
  if (chrome) hudChromeNote(chrome);
}

async function addPartToBench(partId, pose = { x: 0.25, y: 0.28, z: 0.1 }) {
  const added = await api.add(partId, pose);
  await refreshProject();
  const piece = added?.id ? project.pieces.find((p) => p.id === added.id) : project.pieces.at(-1);
  const part = partsById[partId];
  if (piece && part) {
    selectedIds = [piece.id];
    shop.select(piece.id);
    showPart(part, piece);
  }
  hud(`Added ${part?.name || partId}.`);
  return piece;
}

house = initHouse({
  api,
  hud,
  onPhoto() {
    if (isLab()) setLabSpace("ar");
  },
  onPlan() {
    if (isLab()) setLabSpace("ar");
  },
  getSelectedPart: () => selectedPiece()?.part || null,
  onAdd: (partId) => addPartToBench(partId),
});
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
  else if (selectedIds[0]) shop.select(selectedIds[0]);
  syncEditButtons();
  renderBenchPieces();
  syncFunctionStrip();
}

function renderBenchPieces() {
  const list = $("bench-pieces");
  if (!list) return;
  const count = $("lab-count");
  if (count) count.textContent = `${project.pieces.length} ${project.pieces.length === 1 ? "body" : "bodies"}`;
  if (!project.pieces.length) {
    list.innerHTML = `<p class="hint lab-hint">Nothing on the bench. Add a piece from the catalog.</p>`;
    return;
  }
  const current = selectedPieceId();
  list.innerHTML = project.pieces
    .map((piece) => {
      const part = partsById[piece.partId];
      const ref = piece.ref ? `${piece.ref} · ` : "";
      const job = piece.functionLabel ? ` · ${piece.functionLabel}` : "";
      const on = piece.id === current ? " on" : "";
      return `<div class="item${on}" data-piece="${piece.id}"><span class="lab-node-name"><i class="lab-node-ico" aria-hidden="true">▦</i>${ref}${part?.name || piece.partId}${job}</span><small data-drop="${piece.id}" title="Delete this body">✕</small></div>`;
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

/* ------------------------------------------------------------------ Lab EDA
   The netlist panel, ERC report and net strip all read the same server
   payload: project.netlist (named nets over the cables) and project.erc.
   Clicking a row or a chip lights the net in 3D; clicking two gold pads
   asks the server for a wire, which ERC may refuse with a reason. */

function pieceRefName(pieceId) {
  const piece = project.pieces.find((p) => p.id === pieceId);
  if (!piece) return pieceId;
  return piece.ref || partsById[piece.partId]?.name || piece.partId;
}

function padName(pieceId, portId) {
  return `${pieceRefName(pieceId)}.${portId}`;
}

function netClass(name) {
  return project.netlist?.nets?.find((n) => n.name === name)?.class || "signal";
}

function renderNetlist() {
  const list = $("netlist");
  if (!list) return;
  const cables = (project.cables || []).filter((c) => c.ok !== false);
  if (!cables.length) {
    list.innerHTML = `<p class="hint lab-hint">No wires yet. Click one gold pad, then another.</p>`;
    return;
  }
  const cableNets = project.netlist?.cableNets || {};
  list.innerHTML = cables
    .map((c) => {
      const net = cableNets[c.id] || c.net || "N$?";
      const on = net === highlightedNet ? " on" : "";
      const from = escapeHtml(padName(c.fromPiece, c.fromPort));
      const to = escapeHtml(padName(c.toPiece, c.toPort));
      return `<div class="item net-row${on}" data-net="${escapeHtml(net)}"><span class="net-ends"><i class="net-dot net-${netClass(net)}"></i>${from} → ${to}</span><small>${escapeHtml(net)} · ${c.locked ? "locked" : "loose"}</small></div>`;
    })
    .join("");
}

function renderErc() {
  const box = $("erc-report");
  if (!box) return;
  const erc = project.erc;
  if (!erc || !project.chrome?.electronics) {
    box.innerHTML = "";
    return;
  }
  const tone = erc.errors?.length ? "erc-bad" : erc.warnings?.length ? "erc-warn" : "erc-ok";
  const rows = (erc.findings || [])
    .map((f) => `<p class="erc-line erc-${f.level}">${escapeHtml(f.text)}</p>`)
    .join("");
  box.innerHTML = `<p class="erc-note ${tone}">${escapeHtml(erc.note || "")}</p>${rows}`;
}

function renderNetStrip() {
  const strip = $("net-strip");
  if (!strip) return;
  if (!project.chrome?.electronics) {
    strip.innerHTML = "";
    return;
  }
  const nets = project.netlist?.nets || [];
  const chips = nets
    .map((net) => {
      const on = net.name === highlightedNet ? " on" : "";
      return `<button type="button" class="net-chip net-${net.class}${on}" data-net="${escapeHtml(net.name)}">${escapeHtml(net.name)}<i>${net.members.length}</i></button>`;
    })
    .join("");
  const erc = project.erc;
  const badge = erc
    ? `<span class="erc-chip ${erc.errors?.length ? "erc-bad" : erc.warnings?.length ? "erc-warn" : "erc-ok"}">ERC · ${erc.errors?.length || 0}E ${erc.warnings?.length || 0}W</span>`
    : "";
  strip.innerHTML = `<span class="net-strip-title">Nets</span>${chips || `<span class="net-strip-empty">Click two gold pads to wire the first net.</span>`}${badge}`;
}

function setHighlightedNet(name, toggle = true) {
  highlightedNet = toggle && highlightedNet === name ? null : name || null;
  const net = project.netlist?.nets?.find((n) => n.name === highlightedNet);
  if (!net) highlightedNet = null;
  shop.highlightNet?.(
    net?.name || null,
    (net?.members || []).map((m) => `${m.pieceId}::${m.portId}`),
  );
  renderNetlist();
  renderNetStrip();
  if (net) hud(`${net.name} — ${net.members.map((m) => padName(m.pieceId, m.portId)).join(", ")}.`);
}

function clearPendingWire(quiet = false) {
  pendingPort = null;
  shop.setPendingPort?.(null);
  if (!quiet) hud("Wire dropped.");
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
  const parts = (await api.catalog(q)).filter((p) => p.category !== "electronics" && p.category !== "cable");
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
      setLabSpace("ar");
      house?.applyPlan(action.plan);
    } else if (action.type === "firmware") {
      continue;
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
  await addPartToBench(id);
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
    shop.select(id);
    const piece = project.pieces.find((p) => p.id === id);
    const part = partsById[piece?.partId];
    if (part) showPart(part, piece);
    else syncEditButtons();
  }
});

$("cost")?.addEventListener("change", () => {
  costBarrier = $("cost").value;
  loadCatalog(activeQuery());
});

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

function showPart(part, piece) {
  const lines = [piece?.ref ? `${piece.ref} · ${part.name}` : part.name];
  const size = sizePlain(part);
  const price = money(part.cost);
  const shopLine = [size, price && part.store ? `${price} at ${part.store}` : price].filter(Boolean).join(" · ");
  if (shopLine) lines.push(shopLine);
  if (piece?.functionLabel) lines.push(`Job: ${piece.functionLabel}`);
  if (piece && project.chrome?.electronics) {
    const mine = Object.entries(project.netlist?.ports || {})
      .filter(([key]) => key.startsWith(`${piece.id}::`))
      .map(([key, net]) => `${key.split("::")[1]} on ${net}`);
    if (mine.length) lines.push(`Nets: ${mine.join(", ")}`);
  }
  lines.push("G move · R rotate · S scale · Ctrl+D duplicate · Ctrl+Z undo.");
  inspect(lines.join("\n"));
  syncEditButtons();
  syncFunctionStrip();
}

shop.onSelect((data) => {
  if (!data?.piece) {
    selectedIds = [];
    showEmptyInspect();
    syncEditButtons();
    renderBenchPieces();
    return;
  }
  selectedIds = [data.piece.id];
  showPart(data.part, data.piece);
  renderBenchPieces();
});

shop.onPoseCommit((pose) => {
  commitPose(pose);
});

// Lab CAD: a committed sketch-extrude becomes a real piece through api.add;
// a joint mate lands as api.move (plus a joint record) so undo covers both.
shop.onSketch?.(async ({ partId, pose, label }) => {
  try {
    const piece = await api.add(partId, pose);
    await refreshProject();
    if (piece?.id) {
      selectedIds = [piece.id];
      shop.select(piece.id);
      const part = partsById[partId];
      if (part) showPart(part, piece);
    }
    hud(`${label}. Ctrl+Z undoes it.`);
  } catch (err) {
    hud(err.message || "The lab could not build that body.");
  }
});

shop.onJoint?.(async ({ moves, joint, label }) => {
  try {
    for (const move of moves) await api.move({ id: move.id, ...move.pose, snap: false });
    if (joint) await api.joint(joint);
    await refreshProject();
    hud(`${label}.`);
  } catch (err) {
    hud(err.message || "The joint did not take.");
  }
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

$("netlist")?.addEventListener("click", (ev) => {
  const net = ev.target.closest("[data-net]")?.dataset.net;
  if (net) setHighlightedNet(net);
});

$("net-strip")?.addEventListener("click", (ev) => {
  const net = ev.target.closest("[data-net]")?.dataset.net;
  if (net) setHighlightedNet(net);
});

$("isolate-btn")?.addEventListener("click", async () => {
  const electronic = project.pieces.filter((p) => {
    const part = partsById[p.partId];
    return part && (part.category === "electronics" || part.firmwareRole);
  });
  const ids = selectedIds.length ? selectedIds : electronic.map((p) => p.id);
  if (!ids.length) return hud("Nothing electronic to isolate.");
  await api.isolate(ids, "board");
  await refreshProject();
  hud("Isolated as a board — the substrate is drawn under it.");
});

// Wire-by-click: the first pad arms the wire, the second asks the server.
// An ERC refusal comes back as data and lands on the HUD, not as a wire.
shop.onPortClick?.(async (port) => {
  if (!project.chrome?.electronics) return;
  if (!pendingPort) {
    pendingPort = port;
    shop.setPendingPort?.(`${port.pieceId}::${port.portId}`);
    hud(`${padName(port.pieceId, port.portId)} — click the other pad. Esc drops the wire.`);
    return;
  }
  if (pendingPort.pieceId === port.pieceId && pendingPort.portId === port.portId) {
    clearPendingWire();
    return;
  }
  const from = pendingPort;
  clearPendingWire(true);
  const result = await api.cable({
    fromPiece: from.pieceId,
    fromPort: from.portId,
    toPiece: port.pieceId,
    toPort: port.portId,
  });
  if (result?.refused || result?.ok === false) {
    hud(result?.reason || "ERC refused that wire.");
    return;
  }
  await refreshProject();
  if (result?.net) setHighlightedNet(result.net, false);
  hud(
    `${padName(result.fromPiece, result.fromPort)} → ${padName(result.toPiece, result.toPort)}${
      result.net ? ` joined ${result.net}` : ""
    } · ${result.locked ? "locked" : "loose"}.`,
  );
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
  const notes = (result.notes || []).filter((n) => !/firmware|arduino|sketch/i.test(n));
  inspect((notes.length ? notes : ["Behavior suite finished."]).join("\n"));
  hud(notes[0] || "Behavior suite finished.");
  shop.setSim(true, {
    rain,
    heat: tempC > 40,
    force: true,
  });
  $("sim-toggle").checked = true;
});

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

async function commitPose(pose, snap = shop.getSnap()) {
  if (!pose?.id) return;
  const result = await api.move({ ...pose, snap });
  if (result?.ok === false) {
    hud(result.error || "Could not move that piece.");
    return;
  }
  const piece = project.pieces.find((p) => p.id === pose.id);
  if (piece && result.piece) Object.assign(piece, result.piece);
  project.edit = result.edit || project.edit;
  if (result.piece) shop.applyPose(result.piece);
  syncEditButtons();
  hud("Placed.");
}

function setEditMode(mode) {
  shop.setMode(mode);
  syncEditButtons();
  hud(
    mode === "select"
      ? "Select — click a piece, the gizmo stays away."
      : mode === "rotate"
        ? "Rotate the piece."
        : mode === "scale"
          ? "Scale the piece."
          : "Move the piece.",
  );
}

function setSnap(on) {
  shop.setSnap(on);
  syncEditButtons();
  hud(on ? "Snap to 10 mm / 15°." : "Snap off.");
}

async function duplicateSelected() {
  const id = selectedPieceId();
  if (!id) return hud("Pick a piece, then Duplicate.");
  const result = await api.duplicate(id);
  if (result?.ok === false) return hud(result.error || "Could not duplicate that piece.");
  await refreshProject();
  if (result.piece?.id) {
    selectedIds = [result.piece.id];
    shop.select(result.piece.id);
    const part = partsById[result.piece.partId];
    if (part) showPart(part, result.piece);
  }
  hud(`Duplicated ${partsById[result.piece?.partId]?.name || "that piece"}.`);
}

async function undoLastEdit() {
  const result = await api.undo();
  if (result?.ok === false) return hud(result.error || "Nothing to undo.");
  shop.noteHistory?.("undo");
  selectedIds = result.selection ? [result.selection] : selectedIds;
  await refreshProject();
  hud("Undid the last edit.");
}

async function redoLastEdit() {
  const result = await api.redo();
  if (result?.ok === false) return hud(result.error || "Nothing to redo.");
  shop.noteHistory?.("redo");
  selectedIds = result.selection ? [result.selection] : selectedIds;
  await refreshProject();
  hud("Redid the last edit.");
}

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

$("duplicate-piece")?.addEventListener("click", () => duplicateSelected());
$("undo-edit")?.addEventListener("click", () => undoLastEdit());
$("redo-edit")?.addEventListener("click", () => redoLastEdit());
$("edit-snap")?.addEventListener("click", () => setSnap(!shop.getSnap()));
$("edit-bar")?.addEventListener("click", (ev) => {
  const mode = ev.target.closest("[data-edit]")?.dataset.edit;
  if (mode) setEditMode(mode);
});
$("edit-tools")?.addEventListener("click", (ev) => {
  const mode = ev.target.closest("[data-edit]")?.dataset.edit;
  if (mode) setEditMode(mode);
  if (ev.target.closest("[data-snap]")) setSnap(!shop.getSnap());
  if (ev.target.closest("[data-duplicate]")) duplicateSelected();
  if (ev.target.closest("[data-undo]")) undoLastEdit();
  if (ev.target.closest("[data-redo]")) redoLastEdit();
});

// Typed transforms: a changed field becomes one exact api.move, no snap.
$("lab-props")?.addEventListener("change", async (ev) => {
  const input = ev.target.closest("input");
  if (!input) return;
  const picked = selectedPiece();
  if (!picked) return renderProps();
  const piece = picked.piece;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return renderProps();
  const pose = {
    id: piece.id,
    x: piece.x,
    y: piece.y,
    z: piece.z,
    rx: piece.rx || 0,
    ry: piece.ry || 0,
    rz: piece.rz || 0,
    sx: piece.sx || 1,
    sy: piece.sy || 1,
    sz: piece.sz || 1,
  };
  const prop = input.dataset.prop;
  const dim = input.dataset.dim;
  if (prop === "x" || prop === "y" || prop === "z") pose[prop] = value / 1000;
  else if (prop === "rx" || prop === "ry" || prop === "rz") pose[prop] = (value * Math.PI) / 180;
  else if (prop === "sx" || prop === "sy" || prop === "sz") pose[prop] = Math.max(value, 0.05);
  else if (dim) {
    const base = Number(picked.part?.dimsMm?.[dim]);
    if (!base) return renderProps();
    pose[`s${dim}`] = Math.max(value / base, 0.05);
  } else return;
  await commitPose(pose, false);
  renderProps();
});

// Navigation gizmo: the axis orbs snap the camera, ⌂ frames the bench.
const GIZMO_VIEWS = {
  x: { az: 0, el: 0 },
  "-x": { az: 180, el: 0 },
  y: { az: 90, el: 0 },
  "-y": { az: -90, el: 0 },
  z: { az: -90, el: 88 },
  "-z": { az: -90, el: -88 },
};

$("lab-gizmo")?.addEventListener("click", (ev) => {
  const view = ev.target.closest("[data-view]")?.dataset.view;
  if (!view) return;
  if (view === "home") {
    if (!shop.frameSelected()) shop.setCamera({ az: 42, el: 28, zoom: 1 });
    hud("Framed the bench.");
    return;
  }
  const pose = GIZMO_VIEWS[view];
  if (!pose) return;
  shop.setCamera({ ...pose, zoom: 1 });
  const names = { x: "Right", "-x": "Left", y: "Front", "-y": "Back", z: "Top", "-z": "Bottom" };
  hud(`${names[view]} view.`);
});

function isLab() {
  return $("app")?.dataset.mode === "lab";
}

function labHud(space) {
  if (space === "ar") return "AR — the room camera. Drop a photo or place a table.";
  if (space === "house") return "House sits with the bench. Measure the room, then open AR for the overlay.";
  return project.pieces.length
    ? "Desk — pick a piece on the bench, or fit it in the room."
    : "Desk — add a piece from the shelf, or measure the room below.";
}

function setLabSpace(space) {
  if (space !== "house" && space !== "ar") space = "desk";
  const app = $("app");
  if (!app) return;
  app.dataset.lab = space;
  app.classList.toggle("lab-desk", space === "desk");
  app.classList.toggle("lab-house", space === "house");
  app.classList.toggle("lab-ar", space === "ar");
  for (const btn of document.querySelectorAll("#lab-spaces [data-lab]")) {
    btn.classList.toggle("on", btn.dataset.lab === space);
  }
  const room = $("lab-room");
  if (room && space === "house") room.open = true;
  house?.setActive(space === "ar");
  if (isLab()) hud(labHud(space));
  shop.resize();
}

function setMode(mode) {
  if (mode === "lab" || mode === "house" || mode === "bench" || mode === "ar" || mode === "desk") {
    mode = "lab";
  } else {
    mode = "ikeafy";
  }
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
  const visiblePanes = inLab ? new Set(["lab"]) : new Set(["ikeafy"]);
  for (const pane of document.querySelectorAll("[data-pane]")) {
    pane.classList.toggle("hidden", !visiblePanes.has(pane.dataset.pane));
  }
  for (const node of document.querySelectorAll(".bench-only, .lab-only")) {
    node.classList.toggle("hidden", !inLab);
  }
  $("film").classList.toggle("hidden", inLab);
  if (inLab) {
    applyChrome(project.chrome);
    setLabSpace(app.dataset.lab || "desk");
  } else {
    house?.setActive(false);
  }
  shop.resize();
}

for (const btn of document.querySelectorAll("#modes button")) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}

for (const btn of document.querySelectorAll("#lab-spaces [data-lab]")) {
  btn.addEventListener("click", () => {
    setMode("lab");
    setLabSpace(btn.dataset.lab);
  });
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
  if (ev.key === "Escape") {
    if (pendingPort) clearPendingWire();
    else if (highlightedNet) setHighlightedNet(null, false);
    return;
  }
  const key = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && key === "z") {
    ev.preventDefault();
    if (ev.shiftKey) redoLastEdit();
    else undoLastEdit();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && key === "y") {
    ev.preventDefault();
    redoLastEdit();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && key === "d") {
    ev.preventDefault();
    duplicateSelected();
    return;
  }
  if (key === "q") setEditMode("select");
  if (key === "g") setEditMode("translate");
  if (key === "r") setEditMode("rotate");
  if (key === "s") setEditMode("scale");
  if (key === "n") setSnap(!shop.getSnap());
  if (key === "f") shop.frameSelected?.();
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
      ? "Drop an IKEA PDF — Veed Fabric will build the reel."
      : "Drop an IKEA PDF — the reel plays as a local storyboard until FAL_KEY is set.",
  );
}

boot().catch((err) => {
  hud(String(err.message || err));
});

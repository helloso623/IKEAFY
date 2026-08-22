import { api } from "./api.js";
import { bindAiDock, buildSceneContext, captureViewThumb, renderCommandHistory } from "./ai-dock.js";
import { catalogNeedle, parseBudget } from "./omnibox.js";
import { sceneContext } from "./scene-context.js";
import { initHouse } from "./house.js";
import { initLabStrip } from "./lab.js";
import { initLabLayout } from "./lab-layout.js";
import { drawSilhouettePreview, reconstructFromFiles } from "./scan-reconstruct.js";
import { createWorkshop } from "./workshop.js";
import { initStudio } from "./studio.js";
import { bindVoice } from "./voice.js";
import { ikealiveLog } from "./log.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const shop = createWorkshop(view);
const partsById = {};
let project = { pieces: [], cables: [], tapes: [], chrome: null, netlist: null, erc: null };
let selectedIds = [];
let costBarrier = "";
let studio = null;
let house = null;
let aiDock = null;
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
  if (
    id &&
    (project.pieces.some((p) => p.id === id) || shop.getReconstructed?.().some((entry) => entry.piece.id === id))
  ) {
    return id;
  }
  return "";
}

function syncDeleteButton() {
  syncEditButtons();
}

function poseHint(piece) {
  if (!piece) return "Click a piece to move it. G move, R rotate, S scale.";
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
      : "Click a piece to move it. G move, R rotate, S scale.";
  }
  const mode = shop.getMode?.() || "translate";
  for (const btn of document.querySelectorAll("[data-edit]")) {
    btn.classList.toggle("on", btn.dataset.edit === mode);
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

 * Lab is furniture/hardware by default. Electronics chrome (Arduino, nets,
 * isolate) stays off the panel. Boards only land on the shelf when #search /
 * shop chat asks for them, or the Show electronics toggle is on.

 */
function applyChrome(chrome) {
  void chrome?.electronics;
  for (const node of document.querySelectorAll(".electronics-chrome")) {
    node.classList.add("hidden");
  }
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
  onScene() {
    setMode("lab");
    setLabSpace("ar");
  },
  getSelectedPart: () => selectedPiece()?.part || null,
  // The 3D house places everything on the bench: catalog pieces by their
  // footprints, scanned reconstructions by their actual triangle meshes.
  getPieces: () => {
    const catalogPieces = project.pieces.map((piece) => {
      const part = partsById[piece.partId];
      return {
        id: piece.id,
        name: part?.name || piece.partId,
        dimsMm: part?.dimsMm,
        color: part?.color,
        shape: part?.shape,
      };
    });
    const scanned = (shop.getReconstructed?.() || []).map(({ piece, part, positions }) => ({
      id: piece.id,
      name: part?.name || "Scanned object",
      dimsMm: part?.dimsMm,
      color: piece.color,
      shape: "scan",
      positions,
    }));
    return [...catalogPieces, ...scanned];
  },
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
  const scanIds = new Set(shop.getReconstructed?.().map((entry) => entry.piece.id) || []);
  const still = selectedIds.filter((id) => project.pieces.some((p) => p.id === id) || scanIds.has(id));
  const lostSelection = selectedIds.length > 0 && still.length === 0;
  selectedIds = still;
  if (lostSelection) showEmptyInspect();
  else if (selectedIds[0]) shop.select(selectedIds[0]);
  syncEditButtons();
  renderBenchPieces();
  syncFunctionStrip();
  aiDock?.refreshScene();
}

function renderBenchPieces() {
  const list = $("bench-pieces");
  if (!list) return;
  const scanBodies = shop.getReconstructed?.() || [];
  if (!project.pieces.length && !scanBodies.length) {
    list.innerHTML = `<p class="hint">Nothing on the bench. Scan, sketch, or ask the shop.</p>`;
    return;
  }
  const current = selectedPieceId();

  const regular = project.pieces.map((piece) => ({ piece, part: partsById[piece.partId] }));
  list.innerHTML = [...regular, ...scanBodies]
    .map(({ piece, part: entryPart }) => {
      const part = entryPart || partsById[piece.partId];
      const job = piece.functionLabel ? ` · ${piece.functionLabel}` : "";
      const on = piece.id === current ? " on" : "";
      const scan = piece.reconstructed ? ` · ${part?.dimsMm ? `${Math.round(part.dimsMm.x)}×${Math.round(part.dimsMm.y)}×${Math.round(part.dimsMm.z)} mm` : "mesh"}` : "";
      return `<div class="item${on}" data-piece="${piece.id}"><span>${part?.name || piece.partId}${job}${scan}</span><small data-drop="${piece.id}">Delete</small></div>`;

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
  return [$("chat-in"), $("search")].filter(Boolean);
}

function activeQuery() {
  const focused = searchBoxes().find((node) => node === document.activeElement);
  return String(focused?.value ?? $("chat-in")?.value ?? $("search")?.value ?? "");
}

function currentScene() {
  const app = $("app");
  const picked = selectedPiece() || shop.getSelected?.();
  const pieces = (project.pieces || []).map((piece) => ({
    id: piece.id,
    partId: piece.partId,
    name: partsById[piece.partId]?.name || piece.partId,
  }));
  return sceneContext({
    mode: app?.dataset.mode || "ikeafy",
    interfaceName: app?.dataset.interface || "upload",
    lab: app?.dataset.lab || "desk",
    product: studio?.state?.guide?.product || $("product-name")?.value || "",
    step: studio?.state?.run?.cursor || studio?.state?.step?.number,
    partId: picked?.part?.id || picked?.piece?.partId || "",
    partName: picked?.part?.name || "",
    pieceCount: pieces.length,
    pieces,
    room: {
      widthM: Number($("room-w")?.value),
      depthM: Number($("room-d")?.value),
      budget: Number($("room-budget")?.value),
    },
    costBarrier: $("cost")?.value || costBarrier,
  });
}

function updateCatalogHint(parts) {
  const node = $("catalog-count");
  if (node) node.textContent = String(parts.length);
}

function isLabShelfPart(part) {
  if (!part) return false;
  if (part.category === "electronics" || part.category === "cable") return false;
  if (/^(arduino-nano|esp32-dev|led-5mm|ws2812-strip|tactile-btn|breadboard|resistor-220|psu-5v2a|jumper-m2m|usb-mini-cable|soldering-iron|multimeter|enclosure-print)$/.test(part.id)) {
    return false;
  }
  if (part.firmwareRole) return false;
  return true;
}

const ELECTRONICS_SEARCH =
  /\b(arduino|leds?|nano|esp(?:32)?|resistors?|breadboards?|jumpers?|solder(?:ing)?)\b/i;

function isElectronicsQuery(query) {
  return ELECTRONICS_SEARCH.test(String(query || ""));
}

function showElectronicsOn() {
  return Boolean($("show-electronics")?.checked);
}

function filterLabCatalog(parts, typed) {
  if (showElectronicsOn() || isElectronicsQuery(typed)) return parts;
  return parts.filter(isLabShelfPart);
}

async function loadCatalog(raw) {
  const typed = raw == null ? activeQuery() : String(raw);
  const q = { q: catalogNeedle(typed) };
  const budget = $("cost")?.value || parseBudget(typed);
  if (budget) q.maxCost = budget;

  if (showElectronicsOn()) q.electronics = "1";
  const parts = filterLabCatalog(await api.catalog(q), typed);

  for (const p of parts) partsById[p.id] = p;
  updateCatalogHint(parts);
  const shelf = $("catalog");
  if (shelf) shelf.replaceChildren();
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

function currentLabSpace() {
  const space = $("app")?.dataset.lab;
  return space === "house" || space === "ar" ? space : "desk";
}

function scenePieces() {
  const scan = shop.getReconstructed?.() || [];
  const regular = (project.pieces || []).map((piece) => {
    const part = partsById[piece.partId];
    return {
      id: piece.id,
      name: part?.name || piece.partId,
      partId: piece.partId,
      dimsMm: part?.dimsMm || null,
      reconstructed: Boolean(piece.reconstructed),
    };
  });
  const scanned = scan.map(({ piece, part }) => ({
    id: piece.id,
    name: part?.name || piece.partId || "Scanned object",
    partId: piece.partId,
    dimsMm: part?.dimsMm || null,
    reconstructed: true,
  }));
  return [...regular, ...scanned];
}

function labScenePayload() {
  const picked = selectedPiece();
  const part = picked?.part;
  const piece = picked?.piece;
  const thumb = isLab() ? captureViewThumb($("view")) : "";
  const selected = piece
    ? {
        id: piece.id,
        name: part?.name || piece.partId,
        partId: piece.partId,
        dimsMm: part?.dimsMm || null,
        reconstructed: Boolean(piece.reconstructed),
      }
    : null;
  return {
    scene: buildSceneContext({
      lab: currentLabSpace(),
      mode: isLab() ? "lab" : "ikeafy",
      pieces: scenePieces(),
      selected,
      hasViewportStill: Boolean(thumb),
    }),
    photoName: thumb ? "view.jpg" : "",
    viewThumb: thumb || undefined,
  };
}

function openScanPanel() {
  setMode("lab");
  setLabSpace("desk");
  const panel = $("scan-object-panel");
  if (panel) {
    panel.open = true;
    panel.scrollIntoView({ block: "nearest" });
  }
}

const commandHistory = [];

function recordCommand(command, result) {
  commandHistory.unshift({ command, result: String(result || "").trim() });
  if (commandHistory.length > 24) commandHistory.length = 24;
  renderCommandHistory($("ai-history"), commandHistory);
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
    } else if (action.type === "move") {
      if (action.applied && action.piece) {
        shop.applyPose?.(action.piece);
        continue;
      }
      const id = action.id || selectedPieceId();
      if (!id) continue;
      const result = await api.move({
        id,
        x: action.x,
        y: action.y,
        z: action.z,
        rx: action.rx,
        ry: action.ry,
        rz: action.rz,
        sx: action.sx,
        sy: action.sy,
        sz: action.sz,
        snap: shop.getSnap(),
      });
      if (result?.piece) shop.applyPose(result.piece);
    } else if (action.type === "scan") {
      openScanPanel();
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
    } else if (action.type === "studio") {
      await window.__ikeafyStudio?.applyActions?.([action]);
    }
  }
  return added;
}

async function askShop(message) {
  const text = String(message || "").trim();
  if (!text) return;

  void loadCatalog(text);
  aiDock?.open?.();

  appendChat("you", text);
  aiDock?.remember(text);
  aiDock?.setOpen(true);
  hud("Asking the shop…");
  try {

    const extra = labScenePayload();
    const scene = { ...currentScene(), ...extra.scene };
    const reply = await api.chat(text, {
      costBarrier: $("cost")?.value || parseBudget(text) || scene.costBarrier || costBarrier,
      step: scene.step || studio?.state?.run?.cursor,
      partId: scene.partId || shop.getSelected()?.part?.id || extra.scene.selected?.partId,
      room: scene.room || {
        widthM: Number($("room-w")?.value) || undefined,
        depthM: Number($("room-d")?.value) || undefined,
      },
      scene: extra.scene,
      photoName: extra.photoName,

    });
    appendChat(reply.agent?.name || "Shop", reply.text || "", reply.backend);
    await applyShopActions(reply.actions);
    await refreshProject();

    aiDock?.refreshScene();
    recordCommand(text, reply.text || "Done.");

    hud(reply.agent?.name ? `${reply.agent.name} answered.` : "Shop answered.");
  } catch (err) {
    const failed = err.message || "The shop could not answer.";
    appendChat("shop", failed);
    recordCommand(text, failed);
    hud("The shop could not answer.");
  }
}

aiDock = bindAiDock({
  orb: $("ai-orb"),
  dock: $("ai-dock"),
  close: $("ai-dock-close"),
  sceneNode: $("ai-scene"),
  historyNode: $("ai-history"),
  input: $("chat-in"),
  getScene: () => currentScene(),
  onReplay: (query) => {
    loadCatalog(query);
    askShop(query);
  },
});


bindVoice({
  button: $("ai-mic") || $("lab-voice"),
  status: $("ai-status") || $("lab-voice-status"),
  input: $("chat-in"),
  onHear: (heard) => {
    $("chat-in").value = "";
    askShop(heard);
  },
});

$("catalog")?.addEventListener("click", async (ev) => {

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

    const picked = selectedPiece();
    if (picked?.part) showPart(picked.part, picked.piece);
    else {
      const piece = project.pieces.find((p) => p.id === id);
      const part = partsById[piece?.partId];
      if (part) showPart(part, piece);
    }
    syncEditButtons();
  }
});

$("cost")?.addEventListener("change", () => {
  costBarrier = $("cost").value;
  loadCatalog(activeQuery());
});

$("show-electronics")?.addEventListener("change", () => {
  loadCatalog(activeQuery());
});

for (const box of searchBoxes()) {
  box.addEventListener("input", () => loadCatalog(box.value));
}

function selectedPiece() {
  const id = selectedPieceId();
  if (!id) return null;
  const scan = shop.getReconstructed?.().find((entry) => entry.piece.id === id);
  if (scan) return scan;
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  return { piece, part: partsById[piece.partId] };
}

function syncFunctionStrip() {
  const picked = selectedPiece();
  const hint = $("fn-hint");
  if (hint) {
    hint.textContent = picked?.piece.reconstructed
      ? "Scanned meshes can be moved, scaled, duplicated, or deleted locally."
      : picked
        ? picked.piece.functionLabel
        ? `${picked.part?.name || "This piece"} is ${picked.piece.functionLabel}.`
        : `Assign a job to ${picked.part?.name || "this piece"}.`
        : "Pick a piece, then assign a job.";
  }
  const row = $("fn-btns");
  if (!row) return;
  for (const btn of row.querySelectorAll("[data-fn]")) {
    const fn = btn.dataset.fn;
    btn.disabled = !picked || Boolean(picked.piece.reconstructed);
    btn.classList.toggle("on", Boolean(picked && picked.piece.functionLabel === fn));
  }
}

function showPart(part, piece) {
  const lines = [part.name];
  const size = sizePlain(part);
  const price = money(part.cost);
  const shopLine = [size, price && part.store ? `${price} at ${part.store}` : price].filter(Boolean).join(" · ");
  if (shopLine) lines.push(shopLine);
  if (piece?.functionLabel) lines.push(`Job: ${piece.functionLabel}`);

  if (piece?.reconstructed) lines.push("Locally reconstructed triangle mesh · part id scan-mesh.");

  lines.push("G move · R rotate · S scale · Ctrl+D duplicate · Ctrl+Z undo.");
  inspect(lines.join("\n"));
  syncEditButtons();
  syncFunctionStrip();
  aiDock?.refreshScene();
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

async function commitPose(pose) {
  if (!pose?.id) return;

  if (shop.updateReconstructedPose?.(pose)) {
    renderBenchPieces();
    hud("Placed scanned mesh locally.");
    return;
  }

  const result = await api.move({ ...pose, snap: shop.getSnap() });
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
  hud(mode === "rotate" ? "Rotate the piece." : mode === "scale" ? "Scale the piece." : "Move the piece.");
}

function setSnap(on) {
  shop.setSnap(on);
  syncEditButtons();
  hud(on ? "Snap to 10 mm / 15°." : "Snap off.");
}

async function duplicateSelected() {
  const id = selectedPieceId();
  if (!id) return hud("Pick a piece, then Duplicate.");

  const scanCopy = shop.duplicateReconstructed?.(id);
  if (scanCopy) {
    selectedIds = [scanCopy.piece.id];
    renderBenchPieces();
    showPart(scanCopy.part, scanCopy.piece);
    hud("Duplicated the scanned mesh locally.");
    return;
  }

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
  if (shop.removeReconstructed?.(id)) {
    selectedIds = selectedIds.filter((pieceId) => pieceId !== id);
    showEmptyInspect();
    renderBenchPieces();
    syncDeleteButton();
    hud("Deleted scanned object.");
    return;
  }
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

function isLab() {
  return $("app")?.dataset.mode === "lab";
}

function labHud(space) {
  if (space === "ar") return "AR — the room camera. Drop a photo or place a table.";
  if (space === "house") return "House sits with the bench. Measure the room, then open AR for the overlay.";
  return project.pieces.length

    ? "Bench — pick a piece, or fit it in the room."
    : "Bench — scan, sketch, ask the shop, or measure the room below.";

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

  if (isLab()) ikealiveLog("lab", "space", space);
  aiDock?.refreshScene();

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
    aiDock?.close?.();
  }
  shop.resize();
  ikealiveLog("lab", inLab ? "open" : "closed", { space: app.dataset.lab || "desk" });
  aiDock?.refreshScene();
}

for (const btn of document.querySelectorAll("#modes button")) {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "lab" && isLab()) {
      setMode("ikeafy");
      return;
    }
    setMode(btn.dataset.mode);
  });
}

for (const btn of document.querySelectorAll("#lab-spaces [data-lab]")) {
  btn.addEventListener("click", () => {
    setMode("lab");
    setLabSpace(btn.dataset.lab);
  });
}

for (const btn of document.querySelectorAll("#lab-spaces [data-lab]")) {
  btn.addEventListener("click", () => {
    setMode("lab");
    setLabSpace(btn.dataset.lab);
  });
}

let scanSequence = 0;
$("scan-btn")?.addEventListener("click", () => {
  setMode("lab");
  setLabSpace("desk");
  const panel = $("scan-object-panel");
  if (panel) {
    panel.open = true;
    panel.scrollIntoView({ block: "nearest" });
  }
  hud("Scan object — add aligned front, side and top photos, then enter its scale.");
});

$("scan-reconstruct")?.addEventListener("click", async () => {
  const button = $("scan-reconstruct");
  const output = $("scan-reconstruct-out");
  const files = {
    front: $("scan-front")?.files?.[0],
    side: $("scan-side")?.files?.[0],
    top: $("scan-top")?.files?.[0],
  };
  if (!files.front || !files.side || !files.top) {
    const message = "Choose front, side and top photos first.";
    if (output) output.textContent = message;
    hud(message);
    return;
  }
  button.disabled = true;
  if (output) output.textContent = "Segmenting silhouettes and carving a binary visual hull…";
  hud("Reconstructing locally from three silhouettes…");
  try {
    // Let the busy label paint before the CPU-only voxel pass starts.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const result = await reconstructFromFiles(files, {
      scaleMm: Number($("scan-scale-mm")?.value),
      scaleKind: $("scan-scale-kind")?.value || "circumference",
      resolution: 28,
    });
    for (const viewName of ["front", "side", "top"]) {
      drawSilhouettePreview($(`scan-${viewName}-preview`), result.masks[viewName]);
    }
    scanSequence += 1;
    let id = `scan-mesh-${scanSequence}`;
    const used = new Set(shop.getReconstructed?.().map((entry) => entry.piece.id) || []);
    while (used.has(id)) id = `scan-mesh-${++scanSequence}`;
    const added = shop.addReconstructedMesh({
      id,
      name: `Scanned object ${scanSequence}`,
      positions: result.positions,
      dimensionsMm: result.dimensionsMm,
      voxelCount: result.voxelCount,
      triangleCount: result.triangleCount,
    });
    selectedIds = [id];
    renderBenchPieces();
    showPart(added.part, added.piece);
    shop.frameSelected?.();
    const dims = result.dimensionsMm;
    const summary =
      `Binary hull: ${result.voxelCount.toLocaleString()} occupied voxels. ` +
      `Mesh: ${result.triangleCount.toLocaleString()} triangles / ${(result.positions.length / 3).toLocaleString()} vertices. ` +
      `Size: ${Math.round(dims.x)} × ${Math.round(dims.y)} × ${Math.round(dims.z)} mm.`;
    if (output) output.textContent = summary;
    hud("Reconstructed a real triangle mesh and added it to Bodies.");
  } catch (err) {
    const message = err?.message || "Could not reconstruct those photos.";
    if (output) output.textContent = message;
    hud(message);
  } finally {
    button.disabled = false;
  }
});

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

bindVoice({
  button: $("lab-voice"),
  status: $("lab-voice-status"),
  input: $("chat-in"),
  onHear: (text) => askShop(text),
});

window.__ikeafyApplyShop = applyShopActions;

window.addEventListener("keydown", (ev) => {
  const tag = ev.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
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
  for (const p of filterLabCatalog(all, "")) partsById[p.id] = p;
  const roster = agents.roster.map((a) => `<span class="${a.role}">${a.name} · ${a.model}</span>`).join("");
  $("agent-bar").innerHTML = roster;
  const studioBar = $("ikea-agent-bar");
  if (studioBar) studioBar.innerHTML = roster;

  studio = initStudio({ api, hud });
  window.__ikeafyStudio = studio;

  await loadCatalog();
  await refreshProject();
  initLabStrip({ api, shop, hud, getProject: () => project, partsById, refreshProject });
  initLabLayout({
    root: $("app"),
    isLab,
    onChange() {
      shop.resize();
    },
  });
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

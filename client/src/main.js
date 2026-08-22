import { api } from "./api.js";
import { bindAiDock, buildSceneContext, captureViewThumb, renderCommandHistory } from "./ai-dock.js";
import { catalogNeedle, parseBudget } from "./omnibox.js";
import { sceneContext } from "./scene-context.js";
import { initHouse } from "./house.js";
import { initLabStrip } from "./lab.js";
import { initLabLayout } from "./lab-layout.js";
import { drawSilhouettePreview, reconstructFromFiles } from "./scan-reconstruct.js";
import { knownObject } from "./frame-scale.js";
import { grabVideoFrames, scanVideoProxyUrl } from "./video-frames.js";
import { createWorkshop } from "./workshop.js";
import { initStudio } from "./studio.js";
import { bindVoice } from "./voice.js";
import { ikealiveLog } from "./log.js";
import "./motion.js";

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

function inspect(text) {
  $("inspect").textContent = text;
}

function showEmptyInspect() {
  inspect(EMPTY_INSPECT);
  syncMaterialPanel();
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

function syncEditButtons() {
  const available = Boolean(selectedPieceId());
  const edit = project.edit || {};
  for (const btn of document.querySelectorAll("[data-undo]")) btn.disabled = !edit.canUndo;
  for (const btn of document.querySelectorAll("[data-redo]")) btn.disabled = !edit.canRedo;
  for (const btn of document.querySelectorAll("[data-duplicate]")) btn.disabled = !available;
  for (const btn of document.querySelectorAll("[data-delete]")) {
    btn.disabled = !available;
    btn.title = available ? "Delete this piece" : "Pick a piece, then Delete.";
  }
  const mode = shop.getMode?.() || "translate";
  for (const btn of document.querySelectorAll("[data-edit]")) {
    btn.classList.toggle("on", btn.dataset.edit === mode);
  }
  const snapOn = shop.getSnap?.() !== false;
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
  if (house?.hasScene?.()) house.rebuildHouse3d?.();
  return piece;
}

house = initHouse({
  api,
  hud,
  onPhoto() {
    // Fresh photos mean a fresh 3D room — jump straight into it.
    if (isLab()) setLabSpace("house");
  },
  onPlan() {
    if (isLab()) setLabSpace("house");
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
  syncMaterialPanel();
  aiDock?.refreshScene();
}

function renderBenchPieces() {
  const list = $("bench-pieces");
  if (!list) return;
  const scanBodies = shop.getReconstructed?.() || [];
  if (!project.pieces.length && !scanBodies.length) {
    list.innerHTML = `<p class="hint">Nothing on the bench. Scan, sketch, or ask AI.</p>`;
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

function filterLabCatalog(parts, typed) {
  if (isElectronicsQuery(typed)) return parts;
  return parts.filter(isLabShelfPart);
}

async function loadCatalog(raw) {
  const typed = raw == null ? activeQuery() : String(raw);
  const q = { q: catalogNeedle(typed) };
  const budget = $("cost")?.value || parseBudget(typed);
  if (budget) q.maxCost = budget;

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

const CHAT_HISTORY_KEY = "ikealive.chat.history.v1";
const COMMAND_HISTORY_KEY = "ikealive.command.history.v1";

function storedList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function persistList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // History is a convenience; private browsing must not break chat.
  }
}

const conversationHistory = storedList(CHAT_HISTORY_KEY)
  .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant") && entry.content)
  .slice(-24);

function rememberConversation(role, content, extra = {}) {
  conversationHistory.push({ role, content: String(content || "").trim(), ...extra });
  if (conversationHistory.length > 24) conversationHistory.splice(0, conversationHistory.length - 24);
  persistList(CHAT_HISTORY_KEY, conversationHistory);
}

function restoreConversation() {
  for (const entry of conversationHistory) {
    appendChat(entry.role === "user" ? "you" : entry.agent || "AI", entry.content, entry.backend);
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

const commandHistory = storedList(COMMAND_HISTORY_KEY)
  .filter((entry) => entry && entry.command)
  .slice(0, 24);

function recordCommand(command, result) {
  commandHistory.unshift({ command, result: String(result || "").trim() });
  if (commandHistory.length > 24) commandHistory.length = 24;
  persistList(COMMAND_HISTORY_KEY, commandHistory);
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
    } else if (action.type === "room" && action.room) {
      setMode("lab");
      setLabSpace("house");
      house?.createRoom?.(action.room);
    } else if (action.type === "adaptation" && action.plan) {
      setMode("lab");
      setLabSpace("house");
      house?.applyPlan(action.plan);
    } else if (action.type === "firmware") {
      continue;
    } else if (action.type === "studio") {
      await window.__ikeafyStudio?.applyActions?.([action]);
    }
  }
  return added;
}

let chatQueue = Promise.resolve();

function askShop(message) {
  const run = () => askShopOnce(message);
  chatQueue = chatQueue.then(run, run);
  return chatQueue;
}

async function askShopOnce(message) {
  const text = String(message || "").trim();
  if (!text) return;

  void loadCatalog(text);
  aiDock?.open?.();

  const priorHistory = conversationHistory
    .slice(-12)
    .map(({ role, content }) => ({ role, content }));
  appendChat("you", text);
  rememberConversation("user", text);
  aiDock?.remember(text);
  aiDock?.setOpen(true);
  hud("AI is thinking…");
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
      history: priorHistory,

    });
    const agentName = reply.agent?.name || "AI";
    appendChat(agentName, reply.text || "", reply.backend);
    rememberConversation("assistant", reply.text || "", {
      agent: agentName,
      backend: reply.backend || "",
    });
    await applyShopActions(reply.actions);
    await refreshProject();
    if (house?.hasScene?.() && (reply.actions || []).some((action) => action?.type === "add" || action?.type === "room")) {
      house.rebuildHouse3d?.();
    }

    aiDock?.refreshScene();
    recordCommand(text, reply.text || "Done.");

    hud(reply.agent?.name ? `${reply.agent.name} answered.` : "AI answered.");
  } catch (err) {
    const failed = err.message || "AI could not answer.";
    appendChat("AI", failed);
    rememberConversation("assistant", failed, { agent: "AI" });
    recordCommand(text, failed);
    hud("AI could not answer.");
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
restoreConversation();
renderCommandHistory($("ai-history"), commandHistory);


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


/* ---- Materials: color, roughness, finish presets on the selected piece ---- */

const MAT_FINISH_TEXTURES = { foil: "birch-foil", wood: "oak-open", metal: "metal" };

function syncMaterialPanel() {
  const picked = selectedPiece();
  const current = picked ? shop.getPieceMaterial?.(picked.piece.id) : null;
  const disabled = !picked;
  const colorInput = $("mat-color");
  if (colorInput) {
    colorInput.disabled = disabled;
    if (current?.color) colorInput.value = current.color;
  }
  const rough = $("mat-rough");
  if (rough) {
    rough.disabled = disabled;
    if (current) rough.value = String(Math.round((current.roughness ?? 0.6) * 100));
  }
  const roughOut = $("mat-rough-out");
  if (roughOut) roughOut.textContent = ((Number(rough?.value) || 0) / 100).toFixed(2);
  for (const btn of document.querySelectorAll("[data-mat-color]")) btn.disabled = disabled;
  for (const btn of document.querySelectorAll("[data-mat-finish]")) {
    btn.disabled = disabled || Boolean(picked?.piece.reconstructed);
    btn.classList.toggle(
      "on",
      Boolean(picked) && MAT_FINISH_TEXTURES[btn.dataset.matFinish] === current?.texture,
    );
  }
  const hint = $("mat-hint");
  if (hint) {
    hint.textContent = picked
      ? picked.piece.reconstructed
        ? `Scanned mesh — color and roughness apply, finishes need a flat surface.`
        : `Material on ${picked.part?.name || "this piece"}.`
      : "Pick a piece, then set its material.";
  }
}

async function applyMaterial(patch) {
  const picked = selectedPiece();
  if (!picked?.piece) return hud("Pick a piece, then set its material.");
  const id = picked.piece.id;
  if (patch.roughness != null || patch.color) {
    shop.setPieceMaterial?.(id, { roughness: patch.roughness, color: patch.color });
  }
  if (!picked.piece.reconstructed && (patch.color || patch.texture) && patch.persist !== false) {
    const result = await api.move({ id, color: patch.color, texture: patch.texture, snap: false });
    if (result?.ok === false) return hud(result.error || "Could not change that material.");
    await refreshProject();
  }
  syncMaterialPanel();
  if (patch.texture) {
    const finish = Object.entries(MAT_FINISH_TEXTURES).find(([, tex]) => tex === patch.texture)?.[0];
    hud(`${picked.part?.name || "Piece"} refinished as ${finish || patch.texture}.`);
  } else if (patch.color) {
    hud(`Painted ${picked.part?.name || "the piece"} ${patch.color}.`);
  }
}

$("mat-color")?.addEventListener("input", (ev) => {
  applyMaterial({ color: ev.target.value, persist: false });
});
$("mat-color")?.addEventListener("change", (ev) => {
  applyMaterial({ color: ev.target.value });
});
$("mat-rough")?.addEventListener("input", (ev) => {
  const roughness = Math.min(1, Math.max(0, Number(ev.target.value) / 100));
  const out = $("mat-rough-out");
  if (out) out.textContent = roughness.toFixed(2);
  applyMaterial({ roughness });
});
$("mat-swatches")?.addEventListener("click", (ev) => {
  const hex = ev.target.closest("[data-mat-color]")?.dataset.matColor;
  if (!hex) return;
  const colorInput = $("mat-color");
  if (colorInput) colorInput.value = hex;
  applyMaterial({ color: hex });
});
$("mat-finish")?.addEventListener("click", (ev) => {
  const finish = ev.target.closest("[data-mat-finish]")?.dataset.matFinish;
  const texture = MAT_FINISH_TEXTURES[finish];
  if (texture) applyMaterial({ texture });
});

function showPart(part, piece) {
  const lines = [part.name];
  const size = sizePlain(part);
  const price = money(part.cost);
  const shopLine = [size, price && part.store ? `${price} at ${part.store}` : price].filter(Boolean).join(" · ");
  if (shopLine) lines.push(shopLine);
  if (piece?.functionLabel) lines.push(`Job: ${piece.functionLabel}`);

  if (piece?.reconstructed) lines.push("Locally reconstructed triangle mesh · part id scan-mesh.");

  inspect(lines.join("\n"));
  syncEditButtons();
  syncMaterialPanel();
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

function deleteSelected() {
  const id = selectedPieceId();
  if (!id) return hud("Pick a piece, then Delete.");
  removePiece(id);
}

$("edit-tools")?.addEventListener("click", (ev) => {
  const mode = ev.target.closest("[data-edit]")?.dataset.edit;
  if (mode) setEditMode(mode);
  if (ev.target.closest("[data-snap]")) setSnap(!shop.getSnap());
  if (ev.target.closest("[data-duplicate]")) duplicateSelected();
  if (ev.target.closest("[data-delete]")) deleteSelected();
  if (ev.target.closest("[data-undo]")) undoLastEdit();
  if (ev.target.closest("[data-redo]")) redoLastEdit();
});

function isLab() {
  return $("app")?.dataset.mode === "lab";
}

function labHud(space) {
  if (space === "ar") return "AR — the room camera. Drop a photo or place a table.";
  if (space === "house") return "House — the room photos rebuilt in 3D. Drag to orbit, scroll to zoom.";
  return project.pieces.length

    ? "Bench — pick a piece, or fit it in the room."
    : "Bench — scan, sketch, ask AI, or measure the room below.";

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
  house?.setSpace(space);
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
    house?.setSpace("desk");
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
let scanTaps = [];
let scanTapImage = null;

function setFileInput(input, file) {
  if (!input || !file || typeof DataTransfer !== "function") return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

function scanScaleKind() {
  return $("scan-scale-kind")?.value || "circumference";
}

function syncScanScaleUi() {
  const kind = scanScaleKind();
  $("scan-scale-box")?.setAttribute("data-scale-kind", kind);
  const hint = $("scan-scale-hint");
  const canvas = $("scan-scale-frame");
  const tapping = kind === "taps" || kind === "known";
  if (canvas) canvas.classList.toggle("is-live", tapping && canvas.width > 0);
  if (!hint) return;
  if (kind === "taps") {
    hint.textContent =
      scanTaps.length < 2
        ? "Tap two points on the frame that are 1 m apart."
        : `1 m across ${Math.round(Math.hypot(scanTaps[1].x - scanTaps[0].x, scanTaps[1].y - scanTaps[0].y))} px. Reconstruct when the three views are ready.`;
  } else if (kind === "known") {
    const spec = knownObject($("scan-known-object")?.value) || knownObject("credit-card");
    hint.textContent = `The silhouette is a ${spec.name} (${Math.round(spec.wMm)} mm). Or tap its ends on the frame.`;
  } else if (kind === "vanishing") {
    hint.textContent = "The wall/floor vanishing line and a 1.5 m eye-level camera size the object. No paid depth model.";
  } else if (kind === "length") {
    hint.textContent = "Type the object's longest millimetre length.";
  } else {
    hint.textContent = "Type the circumference in millimetres, or switch to tap / known object / vanishing.";
  }
}

function drawScanTapFrame() {
  const canvas = $("scan-scale-frame");
  if (!canvas || !scanTapImage) return;
  const width = scanTapImage.videoWidth || scanTapImage.naturalWidth || scanTapImage.width;
  const height = scanTapImage.videoHeight || scanTapImage.naturalHeight || scanTapImage.height;
  if (!width || !height) return;
  const scale = Math.min(1, 480 / Math.max(width, height));
  canvas.width = Math.max(16, Math.round(width * scale));
  canvas.height = Math.max(16, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(scanTapImage, 0, 0, canvas.width, canvas.height);
  if (scanTaps.length) {
    ctx.strokeStyle = "#7ac7b7";
    ctx.fillStyle = "#7ac7b7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const point of scanTaps) ctx.lineTo(point.x, point.y);
    if (scanTaps.length > 1) ctx.stroke();
    for (const point of scanTaps) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  canvas.classList.add("is-live");
  syncScanScaleUi();
}

async function showScanTapSource(file) {
  if (!file || !file.type?.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);
  scanTapImage = img;
  drawScanTapFrame();
}

async function pullScanVideo(source) {
  const output = $("scan-reconstruct-out");
  if (output) output.textContent = "Pulling stills from the video locally…";
  hud("Pulling scan frames from the video…");
  const grabbed = await grabVideoFrames(source, { count: 3 });
  const views = grabbed.views;
  setFileInput($("scan-front"), views.front);
  setFileInput($("scan-side"), views.side);
  setFileInput($("scan-top"), views.top);
  if (views.front) await showScanTapSource(views.front);
  const message = `Pulled ${grabbed.files.length} frames for front, side and top. Scale is still local — tap 1 m, a known object, or vanishing.`;
  if (output) output.textContent = message;
  hud(message);
  ikealiveLog("scan", "video frames", { count: grabbed.files.length });
}

$("scan-scale-kind")?.addEventListener("change", syncScanScaleUi);
$("scan-known-object")?.addEventListener("change", syncScanScaleUi);
$("scan-scale-frame")?.addEventListener("click", (ev) => {
  const kind = scanScaleKind();
  if (kind !== "taps" && kind !== "known") return;
  const canvas = $("scan-scale-frame");
  if (!canvas?.width) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
  const y = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
  scanTaps = [...scanTaps, { x, y }].slice(-2);
  drawScanTapFrame();
});
$("scan-front")?.addEventListener("change", () => showScanTapSource($("scan-front")?.files?.[0]));
$("scan-video")?.addEventListener("change", async () => {
  const files = [...($("scan-video")?.files || [])];
  if (!files.length) return;
  const video = files.find((file) => file.type.startsWith("video/"));
  const images = files.filter((file) => file.type.startsWith("image/"));
  try {
    if (video) {
      const url = URL.createObjectURL(video);
      try {
        await pullScanVideo(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else if (images.length) {
      setFileInput($("scan-front"), images[0]);
      setFileInput($("scan-side"), images[1] || images[0]);
      setFileInput($("scan-top"), images[2] || images[0]);
      await showScanTapSource(images[0]);
      hud(`Loaded ${images.length} still${images.length === 1 ? "" : "s"} into front / side / top.`);
    }
  } catch (err) {
    const message = err?.message || "Could not read those frames.";
    const output = $("scan-reconstruct-out");
    if (output) output.textContent = message;
    hud(message);
  }
});
$("scan-load-video")?.addEventListener("click", async () => {
  const raw = $("scan-video-url")?.value?.trim();
  if (!raw) {
    hud("Paste a video URL, then pull frames.");
    return;
  }
  try {
    await pullScanVideo(scanVideoProxyUrl(raw, ""));
  } catch (err) {
    const message = err?.message || "Could not pull frames from that URL.";
    const output = $("scan-reconstruct-out");
    if (output) output.textContent = message;
    hud(message);
  }
});

syncScanScaleUi();

$("scan-btn")?.addEventListener("click", () => {
  setMode("lab");
  setLabSpace("desk");
  const panel = $("scan-object-panel");
  if (panel) {
    panel.open = true;
    panel.scrollIntoView({ block: "nearest" });
  }
  hud("Scan object — photos, a video, or a URL. Tap two points = 1 m, a known object, or vanishing.");
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
      scaleKind: scanScaleKind(),
      knownId: $("scan-known-object")?.value,
      taps: scanTaps,
      tapMetres: scanScaleKind() === "known" ? (knownObject($("scan-known-object")?.value)?.wMm || 550) / 1000 : 1,
      frameSize: $("scan-scale-frame")?.width
        ? { width: $("scan-scale-frame").width, height: $("scan-scale-frame").height }
        : undefined,
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
    const method = result.scale?.method || scanScaleKind();
    const summary =
      `Binary hull: ${result.voxelCount.toLocaleString()} occupied voxels. ` +
      `Mesh: ${result.triangleCount.toLocaleString()} triangles / ${(result.positions.length / 3).toLocaleString()} vertices. ` +
      `Size: ${Math.round(dims.x)} × ${Math.round(dims.y)} × ${Math.round(dims.z)} mm · scale ${method}.`;
    if (output) output.textContent = `${summary} Place it in the room to test position, or bake a custom IKEAlive plan.`;
    hud("Scanned mesh is on the bench — place it in the room or bake an IKEAlive plan.");
    if (house?.hasScene?.() || house?.hasPhoto?.()) house.rebuildHouse3d?.();
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

function latestScan() {
  const all = shop.getReconstructed?.() || [];
  return all.find((entry) => entry.piece.id === selectedIds[0]) || all.at(-1) || null;
}

$("scan-place-room")?.addEventListener("click", () => {
  const scan = latestScan();
  if (!scan) {
    hud("Scan an object first, then place it in the room.");
    return;
  }
  setMode("lab");
  setLabSpace("house");
  const room = house?.rebuildHouse3d?.() || house?.showScene?.();
  house?.showScene?.();
  hud(
    room
      ? `Placed ${scan.part?.name || "the scan"} in the 3D room — drag to orbit, WASD to walk.`
      : "Open House after a room photo, then place the scan.",
  );
});

$("scan-bake-plan")?.addEventListener("click", async () => {
  const scan = latestScan();
  if (!scan) {
    hud("Scan an object first, then bake an IKEAlive plan.");
    return;
  }
  hud("Baking a custom IKEAlive step plan…");
  try {
    const guide = await api.scanPlan({
      name: scan.part?.name || "Scanned object",
      dimsMm: scan.part?.dimsMm,
    });
    setMode("ikeafy");
    const view = await studio?.startFromGuide?.(guide.raw, { label: guide.title });
    hud(
      view?.ok === false
        ? view.reason || "Could not start the custom plan."
        : `Custom IKEAlive plan for ${guide.title} — ${guide.steps?.length || 0} steps.`,
    );
  } catch (err) {
    hud(err?.message || "Could not bake that IKEAlive plan.");
  }
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

  studio = initStudio({ api, hud, shop, getParts: () => partsById });
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

import { api } from "./api.js";
import { bindAiDock, buildSceneContext, captureViewThumb, renderCommandHistory } from "./ai-dock.js";
import { catalogNeedle, parseBudget } from "./omnibox.js";
import { sceneContext } from "./scene-context.js";
import { initLabStrip } from "./lab.js";
import { initLabLayout } from "./lab-layout.js";
import { createWorkshop } from "./workshop.js";
import { initStudio } from "./studio.js";
import { bindVoice } from "./voice.js";
import { ikealiveLog } from "./log.js";
import { openBuildPacketPrint } from "./build-packet.js";
import { finishModelSnapshot } from "./model-finish.js";
import "./motion.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const shop = createWorkshop(view);
const partsById = {};
let project = { pieces: [], cables: [], tapes: [], chrome: null, netlist: null, erc: null };
let selectedIds = [];
let costBarrier = "";
let studio = null;
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
  renderDiyHistory();
  void refreshCurrentDiy();
  syncMaterialPanel();
  aiDock?.refreshScene();
}

function renderBenchPieces() {
  const list = $("bench-pieces");
  if (!list) return;
  const scanBodies = shop.getReconstructed?.() || [];
  if (!project.pieces.length && !scanBodies.length) {
    list.innerHTML = `<p class="hint">Nothing on the bench. Sketch, or ask AI.</p>`;
    return;
  }
  const current = selectedPieceId();

  const regular = project.pieces.map((piece) => ({ piece, part: partsById[piece.partId] }));
  list.innerHTML = [...regular, ...scanBodies]
    .map(({ piece, part: entryPart }) => {
      const part = entryPart || partsById[piece.partId];
      const hidden = shop.isPieceHidden?.(piece.id);
      const on = piece.id === current ? " on" : "";
      const off = hidden ? " is-hidden" : "";
      const scan = piece.reconstructed ? ` · ${part?.dimsMm ? `${Math.round(part.dimsMm.x)}×${Math.round(part.dimsMm.y)}×${Math.round(part.dimsMm.z)} mm` : "mesh"}` : "";
      return `<div class="item${on}${off}" data-piece="${piece.id}"><span>${part?.name || piece.partId}${scan}</span><small data-hide-piece="${piece.id}">${hidden ? "Show" : "Hide"}</small><small data-drop="${piece.id}">Delete</small></div>`;

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

function diyBuilds() {
  return Array.isArray(project.diyHistory) ? project.diyHistory : [];
}

let liveDiy = null;
let currentDiyKey = "";
let diyRefreshVersion = 0;

function modelDiyKey() {
  return JSON.stringify(
    (project.pieces || [])
      .map((piece) => ({
        id: piece.id,
        partId: piece.partId,
        x: piece.x,
        y: piece.y,
        z: piece.z,
        sx: piece.sx,
        sy: piece.sy,
        sz: piece.sz,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  );
}

async function refreshCurrentDiy() {
  const key = modelDiyKey();
  if (key === currentDiyKey) return liveDiy;
  currentDiyKey = key;
  const version = ++diyRefreshVersion;
  if (!(project.pieces || []).length) {
    liveDiy = null;
    renderDiyHistory();
    return null;
  }
  const out = $("finish-build-out");
  if (out) out.innerHTML = `<span class="hint">Refreshing construction ways and shaped pieces for the current model…</span>`;
  try {
    const packet = await api.diyCurrent();
    if (version !== diyRefreshVersion || packet?.ok === false) return null;
    liveDiy = {
      name: packet.bom?.name || "Current model",
      bom: packet.bom,
      pdf: packet.pdf,
      current: true,
    };
    renderDiyHistory();
    return liveDiy;
  } catch {
    if (version === diyRefreshVersion && out) {
      out.innerHTML = `<span class="hint">Current DIY refresh is unavailable; saved revisions are still below.</span>`;
    }
    return null;
  }
}

function renderDiyHistory(active = null) {
  const history = $("diy-history");
  const out = $("finish-build-out");
  const builds = diyBuilds();
  if (history) {
    history.innerHTML = builds.length
      ? [...builds]
          .reverse()
          .map(
            (entry) => `<li>
              <strong>${escapeHtml(entry.name || "Custom table")}</strong><br />
              <span>${escapeHtml(entry.dimensions || entry.signature || "modeled dimensions")} · ${escapeHtml(
                new Date(entry.createdAt || Date.now()).toLocaleString(),
              )}</span>
              <button type="button" class="quiet" data-ways-build="${escapeHtml(entry.id)}">Ways PDF</button>
            </li>`,
          )
          .join("")
      : `<li class="hint">No DIY revisions yet.</li>`;
  }
  const current = active || liveDiy || builds.at(-1);
  if (out && current) {
    const bom = current.bom || {};
    out.innerHTML = `<strong>${escapeHtml(current.name || bom.name || "Current model")}</strong>
      <span>${bom.ways?.length || 0} construction ways · ${bom.cutList?.length || 0} shaped-piece / cut-list lines · estimated $${Number(
        bom.estimatedTotal || 0,
      ).toFixed(2)}${
        bom.live ? " · live research" : " · catalog stand-in"
      }</span>
      <div class="row wrap">
        ${
          current.id
            ? `<button type="button" class="quiet" data-ways-build="${escapeHtml(current.id)}">Print ways + cut list</button>`
            : `<span class="hint">Live current design · Finish &amp; find ways to save this revision</span>`
        }
        <span class="hint">${escapeHtml(
          current.planSteps ? `${current.planSteps} IKEAlive watch / plan / todo steps` : current.current ? "updates when the mesh changes" : "IKEAlive plan ready",
        )}</span>
      </div>`;
  }
}

function openWaysPrint(build) {
  const bom = build?.bom;
  if (!bom?.lines?.length) return hud("That saved revision has no ways or cut list.");
  try {
    openBuildPacketPrint({ bom, pdf: build.pdf, assembly: { outline: build.outline || [] } });
  } catch (error) {
    hud(error?.message || "Could not open that saved ways-to-make PDF.");
  }
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
  return "desk";
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
    generated: Boolean(piece.generated),
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
    } else if (action.type === "mesh" && action.mesh) {
      const generated = shop.addGeneratedMesh?.(action.mesh);
      if (generated?.piece) added.push(generated.piece);
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
    } else if (action.type === "label") {
      if (action.applied) continue;
      const id = action.id || added.find((p) => p.partId === action.partId)?.id;
      if (id && action.label) await api.label(id, action.label);
    } else if (action.type === "isolate") {
      if (action.applied) continue;
      const ids = action.pieceIds?.length ? action.pieceIds : added.map((p) => p.id).filter(Boolean);
      if (ids.length) await api.isolate(ids, action.label || "board");
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
      scene: extra.scene,
      photoName: extra.photoName,
      history: priorHistory,

    });
    const agentName = reply.agent?.name || "AI";
    appendChat(agentName, reply.text || "", reply.backend);
    if (reply.manyAgents) {
      for (const id of ["agent-bar", "ikea-agent-bar"]) {
        $(id)?.querySelectorAll("span").forEach((span) => {
          span.classList.toggle("on", /CAD|Creative|Assembler/.test(span.textContent || ""));
        });
      }
    }
    rememberConversation("assistant", reply.text || "", {
      agent: agentName,
      backend: reply.backend || "",
    });
    await applyShopActions(reply.actions);
    await refreshProject();

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
  max: $("ai-dock-max"),
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
  const hidePiece = ev.target.closest("[data-hide-piece]")?.dataset.hidePiece;
  if (hidePiece) {
    const hidden = shop.isPieceHidden?.(hidePiece);
    shop.setPieceHidden?.(hidePiece, !hidden);
    renderBenchPieces();
    hud(hidden ? "Shown again." : "Hidden — the outliner row brings it back.");
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
  if (size) lines.push(size);

  if (piece?.generated) lines.push("AI-authored editable triangle mesh · part id ai-mesh.");
  else if (piece?.reconstructed) lines.push("Locally reconstructed triangle mesh · part id scan-mesh.");

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

shop.onSculpt?.(({ mode, name }) => {
  hud(`Sculpted ${name} (${mode}). It stays this shape on the bench.`);
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
    void refreshCurrentDiy();
    hud(pose.generated ? "Placed AI mesh locally." : "Placed scanned mesh locally.");
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
  void refreshCurrentDiy();
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
    hud(scanCopy.piece.generated ? "Duplicated the AI mesh locally." : "Duplicated the scanned mesh locally.");
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

const SCULPT_HINTS = {
  grab: "Grab — drag on the piece to pull vertices with it.",
  smooth: "Smooth — drag on the piece to relax the surface.",
  inflate: "Inflate — drag on the piece to puff the surface out.",
};

const MESH_HINTS = {
  extrude: "Extrude — drag a face along its normal to press/pull it.",
  inset: "Inset — drag a face toward its center to taper it.",
  bevel: "Bevel — click near a box edge, drag inward to chamfer it.",
  knife: "Knife — drag a line across the body to cut a real edge into it.",
  loopcut: "Loop cut — click the body to add an edge loop across it.",
};

function setSculptTool(mode) {
  if (!shop.getSelected() && shop.getSculptMode() !== mode) {
    hud("Pick a piece, then sculpt it.");
  }
  const next = shop.setSculptMode(shop.getSculptMode() === mode ? null : mode);
  if (next) hud(SCULPT_HINTS[next]);
}

function setMeshToolUi(mode) {
  if (!shop.getSelected() && shop.getMeshTool?.() !== mode) {
    hud("Pick a body, then use the tool on it.");
  }
  const next = shop.setMeshTool?.(shop.getMeshTool?.() === mode ? null : mode);
  if (next) hud(MESH_HINTS[next]);
}

function subdivideSelectedBody() {
  if (!shop.getSelected()) return hud("Pick a piece, then Subdiv.");
  if (shop.subdivideSelected()) hud("Subdivided — every face split in four. Now sculpt it.");
  else hud("That body is already dense enough.");
}

function hideSelectedBody() {
  if (!shop.getSelected()) return hud("Pick a body, then Hide.");
  if (shop.hideSelected?.()) {
    renderBenchPieces();
    hud("Hidden. Unhide all brings every body back (Alt+H).");
  }
}

function unhideAllBodies() {
  const count = shop.unhideAll?.() || 0;
  renderBenchPieces();
  hud(count ? `Unhid ${count} ${count === 1 ? "body" : "bodies"}.` : "Nothing is hidden.");
}

/* Fusion-style numeric scale: a factor, or scale so a measured span becomes
   the typed millimetres. Bottom stays on the bench (y scales with the body). */
async function scaleSelectedBy(factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return hud("Type a scale factor above 0.");
  if (Math.abs(f - 1) < 1e-6) return hud("A factor of 1 changes nothing.");
  const pose = shop.getSelectedPose?.();
  if (!pose) return hud("Pick a body, then scale it.");
  await commitPose({
    id: pose.id,
    sx: pose.sx * f,
    sy: pose.sy * f,
    sz: pose.sz * f,
    y: pose.y * f,
  });
  hud(`Scaled ×${Math.round(f * 1000) / 1000}. Measure it to check the millimetres.`);
}

async function scaleSelectedToMeasured() {
  const target = Number($("scale-target-mm")?.value);
  if (!Number.isFinite(target) || target <= 0) return hud("Type the millimetres the measured span should become.");
  const measured = shop.getMeasuredMm?.() || 0;
  if (!measured) return hud("Measure two points on the body first, then Scale to fit.");
  await scaleSelectedBy(target / measured);
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

// The Desk left bar: modeling, sculpting and visibility live here. Sketch /
// joint buttons in the same stack are handled by the workshop's own
// [data-cad-tool] listener.
$("model-tools")?.addEventListener("click", (ev) => {
  const sculpt = ev.target.closest("[data-sculpt]")?.dataset.sculpt;
  if (sculpt) setSculptTool(sculpt);
  const meshTool = ev.target.closest("[data-mesh-tool]")?.dataset.meshTool;
  if (meshTool) setMeshToolUi(meshTool);
  if (ev.target.closest("[data-subdivide]")) subdivideSelectedBody();
  if (ev.target.closest("[data-hide-selected]")) hideSelectedBody();
  if (ev.target.closest("[data-unhide-all]")) unhideAllBodies();
});

$("scale-apply")?.addEventListener("click", () => {
  scaleSelectedBy($("scale-factor")?.value);
});
$("scale-to-measure")?.addEventListener("click", () => {
  scaleSelectedToMeasured();
});

document.addEventListener("click", (event) => {
  const id = event.target.closest("[data-ways-build]")?.dataset.waysBuild;
  if (!id) return;
  const build = diyBuilds().find((entry) => entry.id === id);
  openWaysPrint(build);
});

function currentFinishModel() {
  return finishModelSnapshot(shop.getReconstructed?.() || [], (id) => shop.getPieceMaterial?.(id));
}

async function waitForFinishJob(id) {
  for (let poll = 0; poll < 480; poll += 1) {
    const update = await api.finishJob(id);
    if (update.job?.status === "complete" && update.result) return update.result;
    if (update.job?.status === "failed") throw new Error(update.reason || update.job.text || "Could not find a way.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Finding a way took too long. Please try again.");
}

let finishingModel = false;
$("finish-model")?.addEventListener("click", async () => {
  if (finishingModel) return;
  finishingModel = true;
  const button = $("finish-model");
  button.disabled = true;
  button.classList.add("busy");
  button.textContent = "Finding build ways…";
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write("<!doctype html><title>Finding build ways…</title><p>Researching construction routes and shaped pieces for this model…</p>");
  }
  hud("Finding ways to make this exact final table…");
  try {
    const model = currentFinishModel();
    const started = await api.startFinishProject(model);
    if (!started?.job?.id) throw new Error(started?.reason || "Could not start the similarity search.");
    const packet = await waitForFinishJob(started.job.id);
    openBuildPacketPrint(packet, printWindow);
    await refreshProject();
    const saved = diyBuilds().find((entry) => entry.id === packet.build?.id) || packet.build;
    renderDiyHistory(saved);
    $("diy-build-sheet") && ($("diy-build-sheet").open = true);
    setMode("ikeafy");
    await studio?.openAssemblyView?.(packet.assembly, { label: "ways-to-make plan" });
    const match = packet.bom?.ikeaMatch;
    hud(
      match
        ? `Ways PDF ready · IKEA ${match.article} is one dimension-matched route · Dylan todo created.`
        : `Ways PDF ready · ${packet.bom?.ways?.length || 0} construction routes · ${
            packet.bom?.lines?.length || 0
          } cut-list lines · Dylan todo created.`,
    );
  } catch (error) {
    printWindow?.close();
    hud(error?.message || "Could not finish this furniture model.");
  } finally {
    finishingModel = false;
    button.disabled = false;
    button.classList.remove("busy");
    button.textContent = "Finish & find ways";
  }
});

function isLab() {
  return $("app")?.dataset.mode === "lab";
}

function labHud() {
  return project.pieces.length
    ? "Bench — pick a piece to move, rotate, or edit."
    : "Bench — sketch a piece, or ask AI to add one.";
}

function setLabSpace(space) {
  space = "desk";
  const app = $("app");
  if (!app) return;
  app.dataset.lab = space;
  app.classList.toggle("lab-desk", space === "desk");
  for (const btn of document.querySelectorAll("#lab-spaces [data-lab]")) {
    btn.classList.toggle("on", btn.dataset.lab === space);
  }
  if (isLab()) hud(labHud());
  shop.resize();

  if (isLab()) ikealiveLog("lab", "space", space);
  aiDock?.refreshScene();
}

function setMode(mode) {
  if (mode === "lab" || mode === "bench" || mode === "desk") {
    mode = "lab";
  } else {
    mode = "ikeafy";
  }
  const app = $("app");
  const inLab = mode === "lab";
  app.dataset.mode = mode;
  app.classList.remove("mode-bench", "mode-ikeafy", "mode-lab");
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
window.setIkealiveMode = setMode;

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

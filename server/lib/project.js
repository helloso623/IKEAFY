import { getPart, listParts } from "./catalog.js";
import { routeCable } from "./cables.js";
import { normalizeFunction } from "./functions.js";

export const LAB_TOOLS = Object.freeze(["fusion", "kicad", "blender", "sim", "generate"]);

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLabTools() {
  return Object.fromEntries(LAB_TOOLS.map((tool) => [tool, null]));
}

const POSE_FIELDS = ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz", "texture", "color", "functionLabel"];
const HISTORY_LIMIT = 40;

/** 10 mm grid, 15° turns, 0.1 scale steps — same units as the Lab status bar. */
export const SNAP = Object.freeze({
  gridM: 0.01,
  angleRad: Math.PI / 12,
  scale: 0.1,
});

export function emptyProject() {
  return {
    name: "Sandbox",
    pieces: [],
    cables: [],
    tapes: [],
    joints: [],
    abstractions: [],
    labTools: emptyLabTools(),
    selection: null,
    history: { past: [], future: [] },
    sim: {
      on: false,
      snapshot: null,
      lastReport: null,
    },
    camera: { az: 42, el: 28, zoom: 1 },
    firmware: { source: "", lastRun: null },
  };
}

export function seedLampTable() {
  const project = emptyProject();
  project.name = "Lamp table";
  const top = addPiece(project, "lack-top", { x: 0, y: 0.225, z: 0, functionLabel: "support" });
  const offsets = [
    [-0.23, 0, -0.23],
    [0.23, 0, -0.23],
    [-0.23, 0, 0.23],
    [0.23, 0, 0.23],
  ];
  for (const [x, , z] of offsets) {
    addPiece(project, "lack-leg", { x, y: 0, z, functionLabel: "support" });
  }
  const nano = addPiece(project, "arduino-nano", { x: 0.08, y: 0.26, z: 0.04 });
  const led = addPiece(project, "led-5mm", { x: 0.14, y: 0.26, z: 0.04 });
  const btn = addPiece(project, "tactile-btn", { x: 0.02, y: 0.26, z: 0.04 });
  const board = addPiece(project, "breadboard", { x: 0.08, y: 0.248, z: 0.04 });
  addPiece(project, "resistor-220", { x: 0.11, y: 0.255, z: 0.02 });
  const box = addPiece(project, "enclosure-print", { x: 0.08, y: 0.27, z: 0.08 });
  labelFunction(project, nano.id, "control");
  labelFunction(project, led.id, "light");
  labelFunction(project, btn.id, "sense");
  labelFunction(project, box.id, "decorate");
  isolateAsBoard(project, [nano.id, led.id, btn.id, board.id], "lamp-board");
  addCable(project, nano.id, "d13", led.id, "anode");
  addCable(project, nano.id, "d2", btn.id, "a");
  addTape(project, "tape-gaffer", [top.id, nano.id]);
  return project;
}

export function addPiece(project, partId, pose = {}) {
  const part = getPart(partId);
  if (!part) throw new Error(`Unknown part ${partId}`);
  const piece = {
    id: uid("p"),
    partId,
    x: pose.x || 0,
    y: pose.y || 0,
    z: pose.z || 0,
    rx: pose.rx || 0,
    ry: pose.ry || 0,
    rz: pose.rz || 0,
    sx: pose.sx || 1,
    sy: pose.sy || 1,
    sz: pose.sz || 1,
    texture: pose.texture || part.texture,
    color: pose.color || part.color,
    functionLabel: pose.functionLabel ?? null,
    isolated: false,
  };
  project.pieces.push(piece);
  return piece;
}

export function removePiece(project, id) {
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  project.pieces = project.pieces.filter((p) => p.id !== id);
  project.cables = (project.cables || []).filter((c) => c.fromPiece !== id && c.toPiece !== id);
  project.tapes = (project.tapes || []).filter((t) => !(t.pieceIds || []).includes(id));
  project.joints = (project.joints || []).filter(
    (joint) =>
      joint.fromPiece !== id &&
      joint.toPiece !== id &&
      !(joint.pieceIds || []).includes(id),
  );
  if (project.selection === id) project.selection = null;
  return piece;
}

export function pickPose(raw = {}) {
  const pose = {};
  for (const key of POSE_FIELDS) {
    if (raw[key] !== undefined) pose[key] = raw[key];
  }
  return pose;
}

export function snapNumber(value, step) {
  if (!Number.isFinite(value) || !step) return value;
  return Math.round(value / step) * step;
}

export function snapPose(pose = {}, opts = {}) {
  const grid = opts.gridM ?? SNAP.gridM;
  const angle = opts.angleRad ?? SNAP.angleRad;
  const scale = opts.scale ?? SNAP.scale;
  const next = { ...pose };
  for (const key of ["x", "y", "z"]) {
    if (next[key] != null) next[key] = snapNumber(Number(next[key]), grid);
  }
  for (const key of ["rx", "ry", "rz"]) {
    if (next[key] != null) next[key] = snapNumber(Number(next[key]), angle);
  }
  for (const key of ["sx", "sy", "sz"]) {
    if (next[key] != null) next[key] = Math.max(scale, snapNumber(Number(next[key]), scale));
  }
  return next;
}

function cloneEditState(project) {
  return JSON.parse(
    JSON.stringify({
      pieces: project.pieces,
      cables: project.cables,
      tapes: project.tapes,
      joints: project.joints || [],
      abstractions: project.abstractions || [],
      selection: project.selection ?? null,
    }),
  );
}

function applyEditState(project, snapshot) {
  project.pieces = JSON.parse(JSON.stringify(snapshot.pieces));
  project.cables = JSON.parse(JSON.stringify(snapshot.cables));
  project.tapes = JSON.parse(JSON.stringify(snapshot.tapes));
  project.joints = JSON.parse(JSON.stringify(snapshot.joints || []));
  project.abstractions = JSON.parse(JSON.stringify(snapshot.abstractions || []));
  project.selection = snapshot.selection ?? null;
}

function ensureHistory(project) {
  if (!project.history) project.history = { past: [], future: [] };
  project.history.past ||= [];
  project.history.future ||= [];
  return project.history;
}

export function rememberEdit(project) {
  const history = ensureHistory(project);
  history.past.push(cloneEditState(project));
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  return editStatus(project);
}

export function discardLastEdit(project) {
  const history = ensureHistory(project);
  if (history.past.length) history.past.pop();
  return editStatus(project);
}

export function undoEdit(project) {
  const history = ensureHistory(project);
  if (!history.past.length) return null;
  history.future.push(cloneEditState(project));
  applyEditState(project, history.past.pop());
  return editStatus(project);
}

export function redoEdit(project) {
  const history = ensureHistory(project);
  if (!history.future.length) return null;
  history.past.push(cloneEditState(project));
  applyEditState(project, history.future.pop());
  return editStatus(project);
}

export function editStatus(project) {
  return {
    canUndo: Boolean(project.history?.past?.length),
    canRedo: Boolean(project.history?.future?.length),
  };
}

export function projectPayload(project) {
  const { history, ...rest } = project;
  return {
    ...rest,
    chrome: benchChrome(project),
    edit: editStatus(project),
  };
}

export function movePiece(project, id, pose = {}) {
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  Object.assign(piece, pickPose(pose));
  project.selection = id;
  return piece;
}

export function duplicatePiece(project, id, offset = {}) {
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  const copy = addPiece(project, piece.partId, {
    ...pickPose(piece),
    x: (Number(piece.x) || 0) + (offset.x ?? 0.08),
    y: Number(piece.y) || 0,
    z: (Number(piece.z) || 0) + (offset.z ?? 0.08),
  });
  project.selection = copy.id;
  return copy;
}

export function rescale(project, id, scale) {
  return movePiece(project, id, {
    sx: scale.sx ?? scale,
    sy: scale.sy ?? scale,
    sz: scale.sz ?? scale,
  });
}

export function retexture(project, id, { texture, color }) {
  return movePiece(project, id, { texture, color });
}

export function addCable(project, fromPiece, fromPort, toPiece, toPort) {
  const a = project.pieces.find((p) => p.id === fromPiece);
  const b = project.pieces.find((p) => p.id === toPiece);
  const pa = getPart(a?.partId)?.ports?.find((p) => p.id === fromPort);
  const pb = getPart(b?.partId)?.ports?.find((p) => p.id === toPort);
  const route = routeCable(pa, pb, { managed: "bundled", slackMm: 50 });
  const cable = {
    id: uid("c"),
    fromPiece,
    fromPort,
    toPiece,
    toPort,
    ...route,
  };
  project.cables.push(cable);
  return cable;
}

export function addTape(project, tapeId, pieceIds, areaMm2 = 400) {
  const tape = {
    id: uid("t"),
    tapeId,
    pieceIds,
    areaMm2,
  };
  project.tapes.push(tape);
  return tape;
}

export function addJoint(project, joint = {}) {
  const pieceIds = [
    ...(joint.pieceIds || []),
    joint.fromPiece,
    joint.toPiece,
  ].filter(Boolean);
  const missing = pieceIds.find((id) => !(project.pieces || []).some((piece) => piece.id === id));
  if (missing) throw new Error(`Unknown joint piece ${missing}`);
  const stored = {
    ...joint,
    id: joint.id || uid("j"),
    kind: joint.kind || "fixed",
    pieceIds: [...new Set(pieceIds)],
  };
  project.joints ||= [];
  project.joints.push(stored);
  return stored;
}

export function removeJoint(project, id) {
  const joint = (project.joints || []).find((item) => item.id === id);
  if (!joint) return null;
  project.joints = project.joints.filter((item) => item.id !== id);
  return joint;
}

export function labelFunction(project, id, label) {
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  if (label == null || label === "") {
    piece.functionLabel = null;
    return piece;
  }
  const normalized = normalizeFunction(label);
  if (!normalized) return piece;
  piece.functionLabel = normalized;
  return piece;
}

export function isolateAsBoard(project, pieceIds, label) {
  for (const id of pieceIds) {
    const piece = project.pieces.find((p) => p.id === id);
    if (piece) piece.isolated = true;
  }
  const board = {
    id: uid("abs"),
    kind: "board",
    label,
    pieceIds,
  };
  project.abstractions.push(board);
  return board;
}

export function snapshotSim(project) {
  project.sim.snapshot = JSON.parse(
    JSON.stringify({
      pieces: project.pieces,
      cables: project.cables,
      joints: project.joints || [],
    }),
  );
  project.sim.on = true;
  return project.sim.snapshot;
}

export function resetSim(project) {
  if (project.sim.snapshot) {
    project.pieces = JSON.parse(JSON.stringify(project.sim.snapshot.pieces));
    project.cables = JSON.parse(JSON.stringify(project.sim.snapshot.cables));
    project.joints = JSON.parse(JSON.stringify(project.sim.snapshot.joints || []));
  }
  project.sim.on = false;
  project.sim.lastReport = null;
  if (project.labTools) project.labTools.sim = null;
  return project;
}

export function persistLabTool(project, tool, value) {
  if (!LAB_TOOLS.includes(tool)) throw new Error(`Unknown lab tool ${tool}`);
  project.labTools ||= emptyLabTools();
  project.labTools[tool] = value == null ? null : JSON.parse(JSON.stringify(value));
  if (tool === "sim") {
    project.sim ||= { on: false, snapshot: null, lastReport: null };
    project.sim.lastReport = project.labTools[tool];
  }
  return project.labTools[tool];
}

/**
 * What the bench should even show. A table with four legs on it has no ports,
 * no nets and no firmware, so the electronics panels are not "disabled" — they
 * are not drawn at all.
 */
export function benchChrome(project) {
  const parts = (project.pieces || []).map((piece) => getPart(piece.partId)).filter(Boolean);
  const electronics = parts.filter((p) => p.category === "electronics" || p.firmwareRole);
  const cables = parts.filter((p) => p.category === "cable");
  const hasElectronics = electronics.length > 0;
  const labTools = Object.fromEntries(LAB_TOOLS.map((tool) => [tool, true]));
  return {
    electronics: hasElectronics,
    lab: true,
    labTools,
    counts: {
      pieces: parts.length,
      electronics: electronics.length,
      cables: (project.cables || []).length + cables.length,
      tapes: (project.tapes || []).length,
      joints: (project.joints || []).length,
    },
    show: {
      cablesPanel: hasElectronics || (project.cables || []).length > 0,
      isolateBoard: hasElectronics,
      labelFunction: hasElectronics,
      firmware: parts.some((p) => p.firmwareRole === "mcu"),
      ports: hasElectronics,
      tape: parts.length > 0,
      ...labTools,
    },
    note: hasElectronics
      ? "Electronics on the bench — ports, nets and firmware are live."
      : "Nothing electronic on the bench, so the electronics controls stay off the panel.",
  };
}

export function catalogPreview() {
  return listParts().map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    category: p.category,
    color: p.color,
    dimsMm: p.dimsMm,
    store: p.store,
  }));
}

import { getPart, listParts } from "./catalog.js";
import { routeCable } from "./cables.js";

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyProject() {
  return {
    name: "Sandbox",
    pieces: [],
    cables: [],
    tapes: [],
    abstractions: [],
    selection: null,
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
  const top = addPiece(project, "lack-top", { x: 0, y: 0.225, z: 0 });
  const offsets = [
    [-0.23, 0, -0.23],
    [0.23, 0, -0.23],
    [-0.23, 0, 0.23],
    [0.23, 0, 0.23],
  ];
  for (const [x, , z] of offsets) {
    addPiece(project, "lack-leg", { x, y: 0, z });
  }
  const nano = addPiece(project, "arduino-nano", { x: 0.08, y: 0.26, z: 0.04 });
  const led = addPiece(project, "led-5mm", { x: 0.14, y: 0.26, z: 0.04 });
  const btn = addPiece(project, "tactile-btn", { x: 0.02, y: 0.26, z: 0.04 });
  const board = addPiece(project, "breadboard", { x: 0.08, y: 0.248, z: 0.04 });
  addPiece(project, "resistor-220", { x: 0.11, y: 0.255, z: 0.02 });
  addPiece(project, "enclosure-print", { x: 0.08, y: 0.27, z: 0.08 });
  labelFunction(project, nano.id, "control");
  labelFunction(project, led.id, "light");
  labelFunction(project, btn.id, "sense");
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
    functionLabel: pose.functionLabel || null,
    isolated: false,
  };
  project.pieces.push(piece);
  return piece;
}

export function movePiece(project, id, pose) {
  const piece = project.pieces.find((p) => p.id === id);
  if (!piece) return null;
  Object.assign(piece, pose);
  return piece;
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

export function labelFunction(project, id, label) {
  const piece = project.pieces.find((p) => p.id === id);
  if (piece) piece.functionLabel = label;
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
    }),
  );
  project.sim.on = true;
  return project.sim.snapshot;
}

export function resetSim(project) {
  if (project.sim.snapshot) {
    project.pieces = JSON.parse(JSON.stringify(project.sim.snapshot.pieces));
    project.cables = JSON.parse(JSON.stringify(project.sim.snapshot.cables));
  }
  project.sim.on = false;
  project.sim.lastReport = null;
  return project;
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

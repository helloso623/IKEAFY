/**
 * Pure room-refit helpers shared by the 3D house and tests.
 *
 * The occupancy field is deliberately binary: moving a model first erases its
 * previous footprint, then stamps the re-fitted footprint. It is a compact
 * scene-removal mask rather than an image inpainting claim.
 */

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function scaledDimensions(piece = {}) {
  const dims = piece.dimsMm || {};
  return {
    w: Math.max(0.001, (number(dims.x) * Math.abs(number(piece.sx, 1))) / 1000),
    d: Math.max(0.001, (number(dims.y) * Math.abs(number(piece.sz, 1))) / 1000),
    h: Math.max(0.001, (number(dims.z) * Math.abs(number(piece.sy, 1))) / 1000),
  };
}

/** Collapse the editable bench pieces into one table/model envelope. */
export function modelEnvelope(pieces = []) {
  const usable = pieces.filter((piece) => piece?.dimsMm && piece.shape !== "scan" && !piece.positions);
  if (!usable.length) return null;
  const bounds = usable.reduce(
    (box, piece) => {
      const dims = scaledDimensions(piece);
      const x = number(piece.x);
      const y = number(piece.y);
      const z = number(piece.z);
      box.minX = Math.min(box.minX, x - dims.w / 2);
      box.maxX = Math.max(box.maxX, x + dims.w / 2);
      box.minY = Math.min(box.minY, y - dims.h / 2);
      box.maxY = Math.max(box.maxY, y + dims.h / 2);
      box.minZ = Math.min(box.minZ, z - dims.d / 2);
      box.maxZ = Math.max(box.maxZ, z + dims.d / 2);
      return box;
    },
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    },
  );
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
  return {
    id: "current-model",
    name: "Current table model",
    source: "model",
    shape: "model",
    w: bounds.maxX - bounds.minX,
    d: bounds.maxZ - bounds.minZ,
    h: bounds.maxY - bounds.minY,
    center,
    floorOffset: bounds.minY,
    pieces: usable.map((piece) => ({
      ...piece,
      modelX: number(piece.x) - center.x,
      modelY: number(piece.y) - bounds.minY,
      modelZ: number(piece.z) - center.z,
      scaled: scaledDimensions(piece),
    })),
  };
}

/** Fit a model centre to the room while retaining its current size and angle. */
export function fitModelToRoom(model, room = {}) {
  if (!model) return null;
  const width = Math.max(0.1, number(room.widthM, 3.2));
  const depth = Math.max(0.1, number(room.depthM, 3.8));
  const halfW = Math.min(width / 2, Math.max(0.001, number(model.w) / 2));
  const halfD = Math.min(depth / 2, Math.max(0.001, number(model.d) / 2));
  return {
    ...model,
    x: clamp(number(model.x, width / 2), halfW, width - halfW),
    z: clamp(number(model.z, depth / 2), halfD, depth - halfD),
    y: 0,
  };
}

export function createBinaryOccupancy(room = {}, resolution = 48) {
  const size = Math.max(8, Math.min(256, Math.round(number(resolution, 48))));
  return {
    widthM: Math.max(0.1, number(room.widthM, 3.2)),
    depthM: Math.max(0.1, number(room.depthM, 3.8)),
    resolution: size,
    cells: new Uint8Array(size * size),
  };
}

function footprintCells(field, item) {
  if (!field || !item) return [];
  const n = field.resolution;
  const halfW = Math.max(0.001, number(item.w) / 2);
  const halfD = Math.max(0.001, number(item.d) / 2);
  const minX = clamp(Math.floor(((number(item.x) - halfW) / field.widthM) * n), 0, n - 1);
  const maxX = clamp(Math.ceil(((number(item.x) + halfW) / field.widthM) * n), 0, n - 1);
  const minZ = clamp(Math.floor(((number(item.z) - halfD) / field.depthM) * n), 0, n - 1);
  const maxZ = clamp(Math.ceil(((number(item.z) + halfD) / field.depthM) * n), 0, n - 1);
  const cells = [];
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) cells.push(x + z * n);
  }
  return cells;
}

export function stampBinaryFootprint(field, item, occupied = true) {
  const value = occupied ? 1 : 0;
  let changed = 0;
  for (const index of footprintCells(field, item)) {
    if (field.cells[index] === value) continue;
    field.cells[index] = value;
    changed += 1;
  }
  return changed;
}

/** Erase the old table mask and stamp the current fitted table mask. */
export function moveBinaryFootprint(field, previous, current) {
  const removedCells = previous ? stampBinaryFootprint(field, previous, false) : 0;
  const addedCells = current ? stampBinaryFootprint(field, current, true) : 0;
  return {
    field,
    removedCells,
    addedCells,
    occupiedCells: field.cells.reduce((sum, value) => sum + value, 0),
  };
}

function overlaps(a, b, gap = 0.015) {
  return (
    Math.abs(number(a.x) - number(b.x)) < number(a.w) / 2 + number(b.w) / 2 + gap &&
    Math.abs(number(a.z) - number(b.z)) < number(a.d) / 2 + number(b.d) / 2 + gap
  );
}

function overhangCheck(model) {
  const top = model?.pieces?.find((piece) => piece.shape === "slab" || piece.shape === "table");
  const supports = (model?.pieces || []).filter((piece) => /post|dowel|leg/i.test(`${piece.shape} ${piece.name}`));
  if (!top || !supports.length) {
    return {
      type: "overhang",
      level: "info",
      title: "Overhang",
      message: "No separate top/support pattern is available; verify support inset on the current model.",
    };
  }
  const topHalfX = top.scaled.w / 2;
  const topHalfZ = top.scaled.d / 2;
  const supportX = Math.max(...supports.map((piece) => Math.abs(piece.modelX) + piece.scaled.w / 2));
  const supportZ = Math.max(...supports.map((piece) => Math.abs(piece.modelZ) + piece.scaled.d / 2));
  const overhang = Math.max(topHalfX - supportX, topHalfZ - supportZ);
  return {
    type: "overhang",
    level: overhang > 0.3 ? "warning" : "ok",
    title: "Overhang",
    message:
      overhang > 0.3
        ? `${Math.round(overhang * 1000)} mm unsupported edge exceeds the 300 mm review threshold.`
        : `${Math.max(0, Math.round(overhang * 1000))} mm maximum edge beyond the supports.`,
  };
}

/** Regenerate the three room-aware design checks after every refit. */
export function generateDesignIssues({ model, room = {}, obstacles = [] } = {}) {
  if (!model) return [];
  const width = Math.max(0.1, number(room.widthM, 3.2));
  const depth = Math.max(0.1, number(room.depthM, 3.8));
  const height = Math.max(0.1, number(room.heightM, 2.7));
  const roomCollision =
    number(model.x) - number(model.w) / 2 < 0 ||
    number(model.x) + number(model.w) / 2 > width ||
    number(model.z) - number(model.d) / 2 < 0 ||
    number(model.z) + number(model.d) / 2 > depth;
  const hits = obstacles.filter((item) => item?.id !== model.id && overlaps(model, item));
  const clearance = height - number(model.h);
  return [
    overhangCheck(model),
    {
      type: "height",
      level: clearance < 0 ? "error" : clearance < 0.15 ? "warning" : "ok",
      title: "Height vs room",
      message:
        clearance < 0
          ? `Model is ${Math.round(Math.abs(clearance) * 1000)} mm taller than the room.`
          : `${Math.round(clearance * 1000)} mm clear below the room height.`,
    },
    {
      type: "collision",
      level: roomCollision || hits.length ? "error" : "ok",
      title: "Collision",
      message: roomCollision
        ? "The current footprint crosses a room boundary."
        : hits.length
          ? `Footprint overlaps ${hits.map((item) => item.name || item.id).join(", ")}.`
          : "Current footprint is clear of walls and modeled obstacles.",
    },
  ];
}

export function scenePlanSource(snapshot = {}) {
  const model = snapshot.model || {};
  const room = snapshot.room || {};
  const issues = snapshot.issues || [];
  const occupancy = snapshot.occupancy || {};
  const capture = snapshot.capture || {};
  const dims = `${Math.round(number(model.w) * 1000)} × ${Math.round(number(model.d) * 1000)} × ${Math.round(number(model.h) * 1000)} mm`;
  const placement = `${number(model.x).toFixed(2)} m × ${number(model.z).toFixed(2)} m`;
  const issueText = issues.map((issue) => `${issue.title}: ${issue.message || issue.detail}`).join("; ");
  const grid = `${number(occupancy.width)} × ${number(occupancy.depth)} cells at ${Math.round(number(occupancy.cellSizeM) * 100)} cm`;
  return [
    `${model.name || "Current table"} — room-fit IKEAlive plan`,
    `Baked model envelope: ${dims}. Room: ${number(room.widthM).toFixed(2)} × ${number(room.depthM).toFixed(2)} × ${number(room.heightM).toFixed(2)} m.`,
    `Dense room capture: ${number(capture.frameCount)} frames from ${capture.source || "the current room scan"} (up to ${number(capture.maxSeconds, 30)} seconds).`,
    `Placement centre: ${placement}. Binary occupancy: ${number(occupancy.occupiedCells)} occupied cells on a ${grid}; ${number(occupancy.removedCells)} old-table cells (${number(occupancy.removedAreaM2).toFixed(2)} m²) removed.`,
    "",
    "1. Verify the current model dimensions and the latest tabletop, leg, rail, and board list before cutting.",
    `2. Apply the baked binary-removal mask to clear the old table footprint, then mark the auto-fitted footprint around centre ${placement}.`,
    "3. Build the current table from its IKEAlive DIY plan, keeping the modeled support orientation and overhang.",
    "4. Move the assembled table into the marked footprint without dragging it across the floor.",
    `5. Inspect the room-fit checks: ${issueText || "no generated issue data"}.`,
    "6. Confirm wall clearance, collision clearance, level, and fastener seating before loading the table.",
  ].join("\n");
}

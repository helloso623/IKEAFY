const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** A metric floor grid where 0 is free and 1 is occupied. */
export function createOccupancyGrid(room = {}, { cellSize = 0.1, boundary = true } = {}) {
  const roomWidthM = Math.max(0.5, finite(room.widthM, 3.2));
  const roomDepthM = Math.max(0.5, finite(room.depthM, 3.8));
  const size = clamp(finite(cellSize, 0.1), 0.05, 0.25);
  const width = Math.max(4, Math.ceil(roomWidthM / size));
  const depth = Math.max(4, Math.ceil(roomDepthM / size));
  const grid = {
    width,
    depth,
    cellSize: size,
    roomWidthM,
    roomDepthM,
    cells: new Uint8Array(width * depth),
  };
  if (boundary) {
    for (let x = 0; x < width; x += 1) {
      grid.cells[x] = 1;
      grid.cells[x + width * (depth - 1)] = 1;
    }
    for (let z = 0; z < depth; z += 1) {
      grid.cells[width * z] = 1;
      grid.cells[width - 1 + width * z] = 1;
    }
  }
  return grid;
}

export function cloneOccupancy(grid) {
  return { ...grid, cells: grid.cells.slice() };
}

function rectCells(grid, footprint = {}, pose = {}, padding = 0) {
  const w = Math.max(0.02, finite(footprint.w, finite(footprint.widthM, 0.55))) + padding * 2;
  const d = Math.max(0.02, finite(footprint.d, finite(footprint.depthM, 0.55))) + padding * 2;
  const x = finite(pose.x, grid.roomWidthM / 2);
  const z = finite(pose.z, grid.roomDepthM / 2);
  return {
    minX: Math.floor((x - w / 2) / grid.cellSize),
    maxX: Math.floor((x + w / 2 - 1e-9) / grid.cellSize),
    minZ: Math.floor((z - d / 2) / grid.cellSize),
    maxZ: Math.floor((z + d / 2 - 1e-9) / grid.cellSize),
  };
}

export function stampFootprint(grid, footprint, pose, value = 1, padding = 0) {
  const bounds = rectCells(grid, footprint, pose, padding);
  let changed = 0;
  for (let z = Math.max(0, bounds.minZ); z <= Math.min(grid.depth - 1, bounds.maxZ); z += 1) {
    for (let x = Math.max(0, bounds.minX); x <= Math.min(grid.width - 1, bounds.maxX); x += 1) {
      const index = x + grid.width * z;
      const next = value ? 1 : 0;
      if (grid.cells[index] !== next) {
        grid.cells[index] = next;
        changed += 1;
      }
    }
  }
  return changed;
}

export function removeFootprint(grid, footprint, pose) {
  const next = cloneOccupancy(grid);
  const removedCells = stampFootprint(next, footprint, pose, 0);
  return {
    grid: next,
    removedCells,
    removedAreaM2: Number((removedCells * next.cellSize ** 2).toFixed(3)),
  };
}

export function isPlacementFree(grid, footprint, pose, clearance = 0) {
  const bounds = rectCells(grid, footprint, pose, Math.max(0, finite(clearance)));
  if (bounds.minX < 1 || bounds.minZ < 1 || bounds.maxX >= grid.width - 1 || bounds.maxZ >= grid.depth - 1) {
    return false;
  }
  for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (grid.cells[x + grid.width * z]) return false;
    }
  }
  return true;
}

/** Snap a requested center to its nearest collision-free grid cell. */
export function autoFitPlacement(grid, footprint, desired = {}, { clearance = 0.45 } = {}) {
  const wanted = {
    x: clamp(finite(desired.x, grid.roomWidthM / 2), 0, grid.roomWidthM),
    z: clamp(finite(desired.z, grid.roomDepthM / 2), 0, grid.roomDepthM),
  };
  const candidates = [];
  for (let z = 1; z < grid.depth - 1; z += 1) {
    for (let x = 1; x < grid.width - 1; x += 1) {
      const pose = { x: (x + 0.5) * grid.cellSize, z: (z + 0.5) * grid.cellSize };
      if (!isPlacementFree(grid, footprint, pose, clearance)) continue;
      const distance = Math.hypot(pose.x - wanted.x, pose.z - wanted.z);
      const wall = Math.min(pose.x, pose.z, grid.roomWidthM - pose.x, grid.roomDepthM - pose.z);
      candidates.push({ pose, distance, wall, index: x + grid.width * z });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || b.wall - a.wall || a.index - b.index);
  const best = candidates[0];
  if (!best) {
    return {
      ok: false,
      pose: wanted,
      adjusted: false,
      reason: `No position has ${Math.round(clearance * 100)} cm clearance.`,
    };
  }
  return {
    ok: true,
    pose: best.pose,
    adjusted: best.distance > grid.cellSize * 0.75,
    distanceM: Number(best.distance.toFixed(2)),
    clearanceM: clearance,
  };
}

/**
 * Erase the old table from scan occupancy, auto-fit the current footprint
 * against what remains, then stamp the current table into a new binary field.
 */
export function reconcileFurniturePlacement(
  grid,
  previous,
  current,
  { clearance = 0.45, carveCurrentOnFirstFit = true } = {},
) {
  if (!grid || !current) {
    return {
      ok: false,
      grid: grid ? cloneOccupancy(grid) : null,
      remaining: grid ? cloneOccupancy(grid) : null,
      model: current || null,
      removedCells: 0,
      addedCells: 0,
      reason: "A room occupancy grid and current model are required.",
    };
  }
  const cutTarget = previous || (carveCurrentOnFirstFit ? current : null);
  const removed = cutTarget
    ? removeFootprint(grid, cutTarget, cutTarget)
    : { grid: cloneOccupancy(grid), removedCells: 0, removedAreaM2: 0 };
  const remaining = removed.grid;
  const fit = autoFitPlacement(remaining, current, current, { clearance });
  const pose = fit.ok ? fit.pose : previous || current;
  const model = { ...current, x: pose.x, z: pose.z };
  const occupied = cloneOccupancy(remaining);
  const addedCells = stampFootprint(occupied, model, model, 1);
  return {
    ok: fit.ok,
    grid: occupied,
    remaining,
    model,
    fit,
    removedCells: removed.removedCells,
    removedAreaM2: removed.removedAreaM2,
    addedCells,
    occupiedCells: occupied.cells.reduce((sum, value) => sum + (value ? 1 : 0), 0),
    reason: fit.ok ? null : fit.reason,
  };
}

/**
 * Project dense frame contrast into rotating floor wedges and majority-vote
 * cells. This is conservative 2D scan evidence, not image inpainting.
 */
export function mergeFrameOccupancy(grid, frames = []) {
  if (!frames.length) return { grid: cloneOccupancy(grid), evidenceCells: 0, frameCount: 0 };
  const votes = new Uint16Array(grid.cells.length);
  const seen = new Uint16Array(grid.cells.length);
  const cx = grid.roomWidthM / 2;
  const cz = grid.roomDepthM / 2;
  frames.forEach((frame, frameIndex) => {
    const width = Math.max(1, Math.floor(finite(frame.width)));
    const height = Math.max(1, Math.floor(finite(frame.height)));
    const luma = frame.luma || [];
    if (luma.length < width * height) return;
    const startY = Math.floor(height * clamp(finite(frame.horizon, 0.55), 0.25, 0.8));
    let floorSum = 0;
    let floorCount = 0;
    for (let y = startY; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        floorSum += finite(luma[x + width * y]);
        floorCount += 1;
      }
    }
    const floorMean = floorSum / Math.max(1, floorCount);
    const heading = (frameIndex / Math.max(1, frames.length)) * Math.PI * 2;
    for (let y = startY + 1; y < height - 1; y += 2) {
      const floorV = (y - startY) / Math.max(1, height - startY - 1);
      const distance = 0.3 + (1 - floorV) * Math.max(grid.roomWidthM, grid.roomDepthM) * 0.48;
      for (let x = 1; x < width - 1; x += 2) {
        const value = finite(luma[x + width * y]);
        const edge =
          Math.abs(value - finite(luma[x - 1 + width * y])) +
          Math.abs(value - finite(luma[x + 1 + width * y]));
        const angle = heading + (x / (width - 1) - 0.5) * 1.25;
        const gx = Math.floor((cx + Math.sin(angle) * distance) / grid.cellSize);
        const gz = Math.floor((cz - Math.cos(angle) * distance) / grid.cellSize);
        if (gx <= 0 || gz <= 0 || gx >= grid.width - 1 || gz >= grid.depth - 1) continue;
        const index = gx + grid.width * gz;
        seen[index] += 1;
        if (edge > 42 || value < floorMean - 38) votes[index] += 1;
      }
    }
  });
  const next = cloneOccupancy(grid);
  let evidenceCells = 0;
  for (let index = 0; index < next.cells.length; index += 1) {
    if (seen[index] >= 2 && votes[index] / seen[index] >= 0.42) {
      if (!next.cells[index]) evidenceCells += 1;
      next.cells[index] = 1;
    }
  }
  return { grid: next, evidenceCells, frameCount: frames.length };
}

export function tableModelFromComponents(components = []) {
  const usable = components.filter((item) => item?.dimsMm);
  const slabs = usable.filter((item) => item.shape === "slab" || /top|surface|board/i.test(item.name || ""));
  const posts = usable.filter((item) => ["post", "dowel", "leg"].includes(item.shape) || /\bleg\b/i.test(item.name || ""));
  const top =
    slabs.sort((a, b) => finite(b.dimsMm.x) * finite(b.dimsMm.y) - finite(a.dimsMm.x) * finite(a.dimsMm.y))[0] ||
    usable.sort((a, b) => finite(b.dimsMm.x) * finite(b.dimsMm.y) - finite(a.dimsMm.x) * finite(a.dimsMm.y))[0];
  if (!top) return null;
  const topWidthM = Math.max(0.05, finite(top.dimsMm.x) / 1000);
  const topDepthM = Math.max(0.05, finite(top.dimsMm.y) / 1000);
  const topThicknessM = Math.max(0.01, finite(top.dimsMm.z, 36) / 1000);
  const postHeightM = Math.max(0, ...posts.map((item) => finite(item.dimsMm.z) / 1000));
  const heightM = posts.length ? postHeightM + topThicknessM : Math.max(topThicknessM, finite(top.dimsMm.z) / 1000);
  return {
    topWidthM,
    topDepthM,
    topThicknessM,
    heightM,
    undersideM: Math.max(0, heightM - topThicknessM),
    supportCount: posts.length,
    supportSpanM: posts.length >= 3 ? Math.max(0, topWidthM - 0.12) : topWidthM * 0.45,
  };
}

function clearanceAt(grid, footprint, pose) {
  let clearance = 0;
  while (clearance + grid.cellSize <= 1.2 && isPlacementFree(grid, footprint, pose, clearance + grid.cellSize)) {
    clearance += grid.cellSize;
  }
  return Number(clearance.toFixed(2));
}

function intersectsDoorSwing(target, door, room) {
  const radius = Math.max(0.5, finite(door?.radiusM, 0.9));
  const hingeX = finite(door?.x, Math.max(0.1, finite(room?.widthM, 3.2) - 0.45));
  const hingeZ = finite(door?.z, finite(room?.depthM, 3.8));
  const closestX = clamp(hingeX, target.x - target.w / 2, target.x + target.w / 2);
  const closestZ = clamp(hingeZ, target.z - target.d / 2, target.z + target.d / 2);
  return Math.hypot(closestX - hingeX, closestZ - hingeZ) < radius;
}

/** Clearance, chair height, overhang, traffic, support, and door checks. */
export function detectDesignIssues({ room = {}, target, grid, model = null, door = null } = {}) {
  if (!target) return [];
  const issues = [];
  const add = (id, severity, title, detail) => issues.push({ id, severity, title, detail });
  const wallClearance = Math.min(
    target.x - target.w / 2,
    target.z - target.d / 2,
    finite(room.widthM, 3.2) - target.x - target.w / 2,
    finite(room.depthM, 3.8) - target.z - target.d / 2,
  );
  if (wallClearance < 0) add("outside-room", "error", "Table leaves the room", "Part of the footprint crosses a wall.");
  else if (wallClearance < 0.12) {
    add("wall-clearance", "warning", "Too close to a wall", `${Math.round(wallClearance * 100)} cm wall clearance leaves no hand space.`);
  }
  if (grid) {
    if (!isPlacementFree(grid, target, target, 0)) {
      add("collision", "error", "Occupancy collision", "The new footprint overlaps reconstructed room occupancy.");
    }
    const clearance = clearanceAt(grid, target, target);
    if (clearance < 0.6) {
      add("foot-traffic", "warning", "Foot-traffic pinch point", `${Math.round(clearance * 100)} cm clear; target at least 60 cm around a table.`);
    }
  }
  const table = model || {};
  const undersideM = finite(table.undersideM, target.h - finite(table.topThicknessM, 0.04));
  const modeledHeightM = Math.max(finite(target.h), finite(table.heightM));
  if (modeledHeightM > finite(room.heightM, 2.7)) {
    add(
      "room-height",
      "error",
      "Table exceeds room height",
      `${Math.round(modeledHeightM * 100)} cm model height exceeds the ${Math.round(finite(room.heightM, 2.7) * 100)} cm room.`,
    );
  }
  if (undersideM < 0.62) {
    add("chair-height", "warning", "Chair and knee clearance", `${Math.round(undersideM * 100)} cm under the top is below the 62 cm seated-clearance check.`);
  } else if (target.h > 0.9) {
    add("work-height", "info", "Unusually high table", `${Math.round(target.h * 100)} cm high; check chairs or standing use.`);
  }
  const overhang = Math.max(0, (finite(table.topWidthM, target.w) - finite(table.supportSpanM, target.w)) / 2);
  if (overhang > 0.3) {
    add("overhang", "warning", "Top overhang needs review", `${Math.round(overhang * 100)} cm beyond the supports on each side.`);
  }
  if (finite(table.supportCount, 4) > 0 && finite(table.supportCount, 4) < 3) {
    add("supports", "error", "Not enough supports", `${table.supportCount} modeled supports cannot define a stable table base.`);
  }
  if (intersectsDoorSwing(target, door, room)) {
    add("door-swing", "error", "Door swing blocked", "The table footprint enters the 90 cm entry-door swing.");
  }
  return issues;
}

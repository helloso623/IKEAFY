/**
 * Photogrammetry-lite room heuristics.
 *
 * A handful of room photos become a simple 3D house: the floor plane is
 * textured straight from the first photo, the walls are boxes whose height
 * comes from a vanishing-line/aspect heuristic (the horizon of a room photo
 * sits at eye level, so the fraction of frame above it tells the ceiling),
 * and the reconstructed/scanned furniture is placed inside. Everything here
 * is pure math — no DOM, no three.js — so node can test it directly.
 */

import { GENERIC_SIDE_TABLE_M } from "./generic-table.js";

const EYE_LEVEL_M = 1.5;
const FALLBACK_HORIZON = 0.55;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = (value) => Math.round(value * 100) / 100;

/** Average luminance per pixel row of an RGBA buffer, top to bottom. */
export function lumaRows(rgba, width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    }
    rows.push(sum / Math.max(1, width));
  }
  return rows;
}

/**
 * Estimate the wall/floor vanishing line as a fraction of frame height.
 * The strongest luminance step in the middle band of the photo is where the
 * wall meets the floor; a flat photo falls back to 0.55.
 */
export function estimateHorizon(rows = []) {
  const n = rows.length;
  if (n < 8) return FALLBACK_HORIZON;
  const low = Math.max(2, Math.floor(n * 0.22));
  const high = Math.min(n - 3, Math.ceil(n * 0.82));
  let best = 0;
  let bestAt = -1;
  for (let y = low; y < high; y += 1) {
    const above = (rows[y - 2] + rows[y - 1] + rows[y]) / 3;
    const below = (rows[y + 1] + rows[y + 2] + rows[y + 3]) / 3;
    const step = Math.abs(below - above);
    if (step > best) {
      best = step;
      bestAt = y;
    }
  }
  if (bestAt < 0 || best < 6) return FALLBACK_HORIZON;
  return clamp((bestAt + 0.5) / n, 0.2, 0.8);
}

/**
 * Metric room plan. Known width/depth wins and scales the mesh to metres;
 * otherwise depth follows the photo aspect (wider frames see more floor)
 * and wall height comes from the horizon: eye level over the frame fraction
 * left above the vanishing line.
 */
export function roomFromPhotos({ aspect = 4 / 3, horizon = FALLBACK_HORIZON, widthM, depthM } = {}) {
  const knownW = num(widthM) > 0 ? num(widthM) : 0;
  const knownD = num(depthM) > 0 ? num(depthM) : 0;
  const h = clamp(num(horizon) || FALLBACK_HORIZON, 0.2, 0.8);
  const w = knownW || 3.2;
  const d = knownD || clamp(w * (0.55 + 0.4 * clamp(num(aspect) || 4 / 3, 0.5, 2.4)), 1.8, 6.4);
  const heightM = clamp(EYE_LEVEL_M / clamp(1 - h, 0.3, 0.7), 2.2, 3.4);
  return {
    widthM: round2(w),
    depthM: round2(d),
    heightM: round2(heightM),
    horizon: h,
    metric: Boolean(knownW || knownD),
  };
}

/** Four wall boxes hugging the floor rectangle (x∈[0,w], z∈[0,d]). */
export function wallBoxes(room, thickness = 0.08) {
  const w = num(room?.widthM) || 3.2;
  const d = num(room?.depthM) || 3.8;
  const h = num(room?.heightM) || 2.7;
  const t = Math.max(0.02, num(thickness) || 0.08);
  return [
    { side: "back", x: w / 2, z: -t / 2, w: w + 2 * t, d: t, h },
    { side: "right", x: w + t / 2, z: d / 2, w: t, d, h },
    { side: "left", x: -t / 2, z: d / 2, w: t, d, h },
    { side: "front", x: w / 2, z: d + t / 2, w: w + 2 * t, d: t, h },
  ];
}

/**
 * Which photo textures which surface. One photo splits at the horizon —
 * floor below, walls above. Extra photos take the walls round-robin.
 */
export function assignSurfaces(count = 0) {
  const n = Math.max(0, Math.floor(num(count)));
  if (!n) return {};
  const extras = n - 1;
  const wall = (slot) => (extras > 0 ? { photo: 1 + (slot % extras), region: "full" } : { photo: 0, region: "above" });
  return {
    floor: { photo: 0, region: "below" },
    back: wall(0),
    right: wall(1),
    left: wall(2),
    front: wall(3),
  };
}

/** Normalized crop rectangle of a photo for a surface region. */
export function cropRegion(region, horizon = FALLBACK_HORIZON) {
  const h = clamp(num(horizon) || FALLBACK_HORIZON, 0.2, 0.8);
  if (region === "below") return { x: 0, y: h, w: 1, h: 1 - h };
  if (region === "above") return { x: 0, y: 0, w: 1, h };
  return { x: 0, y: 0, w: 1, h: 1 };
}

/**
 * Camera pose that frames the whole room so orbit/walk can see the interior.
 * Position sits just inside the front-right, looking at the floor centre.
 */
export function frameRoomCamera(room) {
  const w = num(room?.widthM) || 3.2;
  const d = num(room?.depthM) || 3.8;
  const h = num(room?.heightM) || 2.7;
  const target = { x: w / 2, y: h * 0.22, z: d / 2 };
  const radius = Math.max(w, d) * 0.62;
  return {
    target,
    position: {
      x: clamp(target.x + radius * 0.42, 0.35, Math.max(0.4, w - 0.2)),
      y: clamp(h * 0.55, 1.05, h * 0.78),
      z: clamp(target.z + radius * 0.72, 0.45, Math.max(0.5, d - 0.12)),
    },
    minDistance: 0.35,
    maxDistance: Math.max(w, d, h) * 3.4,
  };
}

/** Floor trapezoid in the photo: everything below the vanishing line. */
export function overlayFloorFromHorizon(photoRect, horizon = FALLBACK_HORIZON) {
  const h = clamp(num(horizon) || FALLBACK_HORIZON, 0.2, 0.8);
  const rect = photoRect || { x: 0, y: 0, w: 1, h: 1 };
  return {
    x: rect.x,
    y: rect.y + rect.h * h,
    w: rect.w,
    h: rect.h * (1 - h),
  };
}

/** Pixel size of a metre footprint on the photo floor. */
export function overlayFootprintPx(foot, floor, room) {
  const roomW = Math.max(0.5, num(room?.widthM) || 3.2);
  const roomD = Math.max(0.5, num(room?.depthM) || 3.8);
  const w = num(foot?.w) || GENERIC_SIDE_TABLE_M.w;
  const d = num(foot?.d) || GENERIC_SIDE_TABLE_M.d;
  const h = num(foot?.h) || GENERIC_SIDE_TABLE_M.h;
  const scaleX = (floor?.w || 1) / roomW;
  const scaleZ = (floor?.h || 1) / roomD;
  return {
    topW: Math.max(8, w * scaleX),
    topD: Math.max(6, d * scaleZ * 0.55),
    height: Math.max(8, h * scaleX * 0.48),
  };
}

function dimsToMetres(dimsMm) {
  const x = num(dimsMm?.x) / 1000;
  const y = num(dimsMm?.y) / 1000;
  const z = num(dimsMm?.z) / 1000;
  if (x <= 0 && y <= 0) return null;
  return {
    w: Math.max(0.05, x || y),
    d: Math.max(0.05, y || x),
    h: Math.max(0.05, z || 0.45),
  };
}

/**
 * Furniture placements in metres, clamped inside the room. The adaptation
 * plan's pick keeps its planned spot; scanned/bench pieces line up along the
 * back wall. Positions are centres; footprints are w × d, height h.
 */
export function placeFurniture({ plan, pieces = [], room } = {}) {
  const roomW = num(room?.widthM) || 3.2;
  const roomD = num(room?.depthM) || 3.8;
  const inRoom = (item) => ({
    ...item,
    x: clamp(item.x, Math.min(item.w / 2 + 0.02, roomW / 2), Math.max(item.w / 2 + 0.02, roomW - item.w / 2 - 0.02)),
    z: clamp(item.z, Math.min(item.d / 2 + 0.02, roomD / 2), Math.max(item.d / 2 + 0.02, roomD - item.d / 2 - 0.02)),
  });
  const placed = [];
  for (const place of plan?.ordered || []) {
    const w =
      num(place.widthM) || num(plan?.pick?.footprintM?.w) || GENERIC_SIDE_TABLE_M.w;
    const d =
      num(place.depthM) || num(plan?.pick?.footprintM?.d) || GENERIC_SIDE_TABLE_M.d;
    const h =
      num(place.heightM) || num(plan?.pick?.footprintM?.h) || GENERIC_SIDE_TABLE_M.h;
    placed.push(
      inRoom({
        id: place.id || place.partId || "plan-piece",
        name: plan?.pick?.name || "piece",
        source: "plan",
        shape: plan?.overlay?.shape || plan?.pick?.shape || "table",
        color: plan?.overlay?.color || plan?.pick?.color || "#f3efe6",
        w,
        d,
        h,
        x: num(place.x) + w / 2,
        z: num(place.z) + d / 2,
      }),
    );
  }
  let slotX = 0.4;
  let scanSlot = 0;
  for (const piece of pieces.slice(0, 8)) {
    const dims = dimsToMetres(piece?.dimsMm);
    if (!dims) continue;
    const scanned = Boolean(piece.positions) || piece.shape === "scan" || piece.source === "scan";
    // Scanned meshes land in the open floor for positioning tests; catalog
    // pieces still line up along the back wall.
    const x = scanned ? roomW * (0.38 + scanSlot * 0.22) : slotX + dims.w / 2;
    const z = scanned ? roomD * 0.48 : 0.3 + dims.d / 2;
    placed.push(
      inRoom({
        id: piece.id || `bench-${placed.length}`,
        name: piece.name || "bench piece",
        source: scanned ? "scan" : "bench",
        shape: scanned ? "scan" : piece.shape || "table",
        color: piece.color || (scanned ? "#d8c7a1" : "#ecdfc6"),
        positions: piece.positions || null,
        w: dims.w,
        d: dims.d,
        h: dims.h,
        x,
        z,
      }),
    );
    if (scanned) scanSlot += 1;
    else slotX += dims.w + 0.3;
  }
  return placed;
}

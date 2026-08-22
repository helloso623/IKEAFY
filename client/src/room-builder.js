/**
 * House room builder — turn room photos into a buildable 3D room model.
 *
 * Everything here is a pure function over ImageData-shaped objects
 * ({ data, width, height }) and plain plan JSON, so Node tests can run the
 * whole pipeline without a browser or WebGL. house3d.js turns the returned
 * model into meshes; house.js feeds it photos and adaptation plans.
 *
 * Room coordinates match the adaptation plan: metres from one corner,
 * x across the width, z across the depth, y up.
 */

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function toHex(r, g, b) {
  const byte = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function lumaOf(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturationOf(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Average colour of the sampled rows in [fromRatio, toRatio) of the photo. */
function bandColor(rows, fromRatio, toRatio) {
  const from = clamp(Math.floor(rows.length * fromRatio), 0, rows.length - 1);
  const to = clamp(Math.ceil(rows.length * toRatio), from + 1, rows.length);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = from; y < to; y += 1) {
    r += rows[y][0];
    g += rows[y][1];
    b += rows[y][2];
  }
  const n = to - from;
  return [r / n, g / n, b / n];
}

function rowAverages(imageData) {
  const { data, width, height } = imageData;
  const stepX = Math.max(1, Math.floor(width / 64));
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
    rows.push([r / n, g / n, b / n]);
  }
  return rows;
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Find the wall/floor horizon: the row (as a 0..1 ratio of photo height)
 * where the colour above and below differs the most. Room photos put the
 * skirting line in the lower half, so the scan runs 0.3..0.92.
 */
export function findHorizon(rows) {
  const height = rows.length;
  const win = Math.max(2, Math.round(height * 0.06));
  let best = 0.62;
  let bestScore = -1;
  const lo = Math.max(win, Math.floor(height * 0.3));
  const hi = Math.min(height - win, Math.ceil(height * 0.92));
  for (let y = lo; y < hi; y += 1) {
    const above = [0, 0, 0];
    const below = [0, 0, 0];
    for (let k = 1; k <= win; k += 1) {
      for (let c = 0; c < 3; c += 1) {
        above[c] += rows[y - k][c] / win;
        below[c] += rows[y + k - 1][c] / win;
      }
    }
    const score = colorDistance(above, below);
    if (score > bestScore) {
      bestScore = score;
      best = y / height;
    }
  }
  return clamp(best, 0.3, 0.92);
}

/**
 * Read one room photo: where the floor starts, what colour the wall and the
 * floor are, how bright the room is, and the strongest accent colour.
 */
export function analyzeRoomPhoto(imageData) {
  if (!imageData?.data || !imageData.width || !imageData.height) {
    throw new Error("analyzeRoomPhoto needs ImageData-shaped input.");
  }
  const rows = rowAverages(imageData);
  const horizon = findHorizon(rows);
  const wall = bandColor(rows, Math.min(0.12, horizon * 0.4), horizon);
  const floor = bandColor(rows, Math.min(horizon + 0.04, 0.96), 1);
  const ceiling = bandColor(rows, 0, Math.min(0.1, horizon * 0.3));

  const { data, width, height } = imageData;
  const step = Math.max(4, Math.floor((width * height) / 4096)) * 4;
  let luma = 0;
  let lumaN = 0;
  let accent = null;
  let accentScore = 0.22; // ignore near-grey pixels
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma += lumaOf(r, g, b);
    lumaN += 1;
    const sat = saturationOf(r, g, b);
    const bright = lumaOf(r, g, b) / 255;
    const score = sat * (0.35 + bright);
    if (sat > 0.3 && bright > 0.18 && score > accentScore) {
      accentScore = score;
      accent = [r, g, b];
    }
  }
  const brightness = clamp(luma / Math.max(lumaN, 1) / 255, 0, 1);
  return {
    horizon,
    wallColor: toHex(...wall),
    floorColor: toHex(...floor),
    ceilingColor: toHex(...ceiling),
    accentColor: accent ? toHex(...accent) : null,
    brightness,
  };
}

function mixHex(colors, fallback) {
  const parsed = colors
    .filter(Boolean)
    .map((hex) => String(hex).replace("#", ""))
    .filter((raw) => raw.length >= 6)
    .map((raw) => [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16)));
  if (!parsed.length) return fallback;
  const sum = parsed.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0]);
  return toHex(sum[0] / parsed.length, sum[1] / parsed.length, sum[2] / parsed.length);
}

export const WALL_IDS = ["back", "right", "front", "left"];

/**
 * Merge the photo analyses and the measured size into one room model.
 * Photo n dresses wall n (back, right, front, left, then wrap); the floor
 * mixes every photo's floor band. No photos still yields a neutral room.
 */
export function buildRoomModel({ widthM, depthM, heightM, photos = [] } = {}) {
  const w = clamp(Number(widthM) || 3.2, 1.2, 12);
  const d = clamp(Number(depthM) || 3.8, 1.2, 12);
  const h = clamp(Number(heightM) || 2.5, 2.1, 4);
  const walls = WALL_IDS.map((id, i) => {
    const photoIndex = photos.length ? i % photos.length : -1;
    const photo = photoIndex >= 0 ? photos[photoIndex] : null;
    return {
      id,
      lengthM: id === "back" || id === "front" ? w : d,
      heightM: h,
      color: photo?.wallColor || "#ded8cc",
      photoIndex,
      horizon: photo?.horizon ?? 0.62,
    };
  });
  const brightness = photos.length
    ? photos.reduce((sum, p) => sum + (p.brightness ?? 0.5), 0) / photos.length
    : 0.55;
  return {
    room: { widthM: w, depthM: d, heightM: h },
    floor: {
      color: mixHex(photos.map((p) => p.floorColor), "#c2a982"),
      source: photos.length ? "photo" : "default",
    },
    walls,
    ceilingColor: mixHex(photos.map((p) => p.ceilingColor), "#efece5"),
    accentColor: photos.map((p) => p.accentColor).find(Boolean) || "#ffda1a",
    light: { intensity: clamp(0.7 + brightness * 0.9, 0.7, 1.6) },
    photoCount: photos.length,
  };
}

/**
 * Where each wall stands: centre point on the floor, yaw so its face looks
 * into the room. Pure geometry so the placement is testable without three.
 */
export function wallPlacements(model) {
  const { widthM: w, depthM: d } = model.room;
  const at = { back: [w / 2, 0], front: [w / 2, d], left: [0, d / 2], right: [w, d / 2] };
  const yaw = { back: 0, front: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
  return model.walls.map((wall) => ({
    id: wall.id,
    x: at[wall.id][0],
    z: at[wall.id][1],
    ry: yaw[wall.id],
    lengthM: wall.lengthM,
    heightM: wall.heightM,
  }));
}

const MARGIN = 0.15;

function footprintOf(item, pick) {
  const fromPick = pick && pick.id === item.partId ? pick.footprintM : null;
  return {
    w: Number(item.widthM) || fromPick?.w || 0.55,
    d: Number(item.depthM) || fromPick?.d || 0.55,
    h: Number(item.heightM) || fromPick?.h || 0.45,
  };
}

function overlaps(a, b) {
  const gap = 0.05;
  return (
    Math.abs(a.x - b.x) < (a.widthM + b.widthM) / 2 + gap &&
    Math.abs(a.z - b.z) < (a.depthM + b.depthM) / 2 + gap
  );
}

/**
 * Drop the plan's ordered pieces into the room: clamp every footprint inside
 * the walls and slide later pieces along x (then z) until nothing overlaps.
 */
export function layoutFurniture(plan, room) {
  const items = plan?.ordered || [];
  if (!items.length) return [];
  const w = Number(room?.widthM) || 3.2;
  const d = Number(room?.depthM) || 3.8;
  const placed = [];
  for (const [index, item] of items.entries()) {
    const foot = footprintOf(item, plan.pick);
    const half = { x: foot.w / 2, z: foot.d / 2 };
    const clampX = (x) => clamp(x, half.x + MARGIN, Math.max(half.x + MARGIN, w - half.x - MARGIN));
    const clampZ = (z) => clamp(z, half.z + MARGIN, Math.max(half.z + MARGIN, d - half.z - MARGIN));
    const spot = {
      id: item.id || `place-${index + 1}`,
      partId: item.partId || plan.pick?.id || "",
      name: plan.pick && plan.pick.id === item.partId ? plan.pick.name : item.name || plan.pick?.name || "piece",
      // Plan coordinates are the piece's near corner; the scene wants centres.
      x: clampX((Number(item.x) || 0) + half.x),
      z: clampZ((Number(item.z) || 0) + half.z),
      yaw: Number(item.yaw) || 0,
      widthM: foot.w,
      depthM: foot.d,
      heightM: foot.h,
      color: plan.overlay?.color || plan.pick?.color || "#f3efe6",
      shape: plan.overlay?.shape || plan.pick?.shape || "table",
      why: item.why || "",
    };
    let guard = 0;
    while (placed.some((other) => overlaps(spot, other)) && guard < 200) {
      const next = clampX(spot.x + 0.2);
      if (next === spot.x) {
        spot.x = half.x + MARGIN;
        const nextZ = clampZ(spot.z + 0.2);
        if (nextZ === spot.z) break;
        spot.z = nextZ;
      } else {
        spot.x = next;
      }
      guard += 1;
    }
    placed.push(spot);
  }
  return placed;
}

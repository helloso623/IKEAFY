/**
 * stability.js — would this build hold, or would it break?
 *
 * A tiny static-equilibrium checker for the bench. It never touches meshes:
 * callers hand it world-space boxes (metres) and it answers with a verdict
 * plus the reasons — floating bodies collapse, a centre of mass past the
 * base tips over, and sliver contacts snap as failed joints. Pure math, no
 * three.js, so node:test can exercise stable and unstable builds directly.
 */

const DEFAULTS = {
  floorY: 0, // the bench surface
  contactTolM: 0.004, // faces within 4 mm count as a joint
  densityKgM3: 580, // pine-ish furniture stock
  minJointAreaM2: 25e-6, // under 5×5 mm nothing holds a fastener
  minSupportShare: 0.005, // rest area under 0.5 % of the footprint wobbles off
  maxJointKgPerM2: 80000, // beyond ~8 g/mm² the joint crushes
};

/** World AABB (metres) for a box given centre + size in millimetres. */
export function boxAt(centerMm, sizeMm) {
  const [cx, cy, cz] = centerMm;
  const [sx, sy, sz] = sizeMm;
  return {
    min: { x: (cx - sx / 2) / 1000, y: (cy - sy / 2) / 1000, z: (cz - sz / 2) / 1000 },
    max: { x: (cx + sx / 2) / 1000, y: (cy + sy / 2) / 1000, z: (cz + sz / 2) / 1000 },
  };
}

function span(box, axis) {
  return Math.max(0, box.max[axis] - box.min[axis]);
}

function overlap1d(a, b, axis) {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
}

/* ---- 2D convex hull (Andrew monotone chain) over XZ points ------------- */
function cross(o, a, b) {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

export function convexHull(points) {
  const pts = [...points].sort((p, q) => p.x - q.x || p.z - q.z);
  if (pts.length <= 2) return pts;
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Signed distance (metres) from a point to the hull boundary — positive
 * inside, negative outside. Degenerate hulls (a point or a segment) are
 * treated as zero-width bases: anything off them is outside.
 */
export function hullMargin(point, hull) {
  if (!hull.length) return -Infinity;
  if (hull.length === 1) {
    const d = Math.hypot(point.x - hull[0].x, point.z - hull[0].z);
    return -d;
  }
  if (hull.length === 2) {
    return -distToSegment(point, hull[0], hull[1]);
  }
  let inside = true;
  let closest = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if (cross(a, b, point) < 0) inside = false;
    closest = Math.min(closest, distToSegment(point, a, b));
  }
  return inside ? closest : -closest;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/**
 * analyzeStability(pieces, opts) → { holds, verdict, issues, comMm, baseHullMm }
 *
 * pieces: [{ id, name, box: {min:{x,y,z}, max:{x,y,z}}, massKg? }] in metres.
 * Issues carry kind "floating" | "tip" | "joint" and a human detail line.
 */
export function analyzeStability(pieces, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const items = pieces
    .map((p) => {
      const box = p.box;
      const volume = span(box, "x") * span(box, "y") * span(box, "z");
      return {
        id: p.id,
        name: p.name || p.id,
        box,
        massKg: Number.isFinite(p.massKg) ? p.massKg : Math.max(0.05, volume * cfg.densityKgM3),
        com: {
          x: (box.min.x + box.max.x) / 2,
          y: (box.min.y + box.max.y) / 2,
          z: (box.min.z + box.max.z) / 2,
        },
        footprintM2: span(box, "x") * span(box, "z"),
        onFloor: box.min.y - cfg.floorY <= cfg.contactTolM,
        rests: [], // contacts this piece stands on
        sides: 0, // lateral joints (fastened, not load bearing)
      };
    })
    .filter((it) => it.footprintM2 > 0 || span(it.box, "y") > 0);

  const issues = [];
  const contacts = [];

  /* Contacts: vertical rest joints and lateral fastened joints. */
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i]; // candidate resting piece
      const b = items[j]; // candidate support
      const w = overlap1d(a.box, b.box, "x");
      const d = overlap1d(a.box, b.box, "z");
      const h = overlap1d(a.box, b.box, "y");
      if (Math.abs(a.box.min.y - b.box.max.y) <= cfg.contactTolM && w > 0 && d > 0) {
        const patch = {
          minX: Math.max(a.box.min.x, b.box.min.x),
          maxX: Math.min(a.box.max.x, b.box.max.x),
          minZ: Math.max(a.box.min.z, b.box.min.z),
          maxZ: Math.min(a.box.max.z, b.box.max.z),
        };
        const contact = { above: a, below: b, areaM2: w * d, patch };
        a.rests.push(contact);
        contacts.push(contact);
      } else if (i < j && h > 0) {
        const touchX = Math.abs(a.box.max.x - b.box.min.x) <= cfg.contactTolM || Math.abs(b.box.max.x - a.box.min.x) <= cfg.contactTolM;
        const touchZ = Math.abs(a.box.max.z - b.box.min.z) <= cfg.contactTolM || Math.abs(b.box.max.z - a.box.min.z) <= cfg.contactTolM;
        if ((touchX && d > 0) || (touchZ && w > 0)) {
          a.sides += 1;
          b.sides += 1;
        }
      }
    }
  }

  /* Grounding: anything not connected down to the floor falls. */
  const grounded = new Set(items.filter((it) => it.onFloor).map((it) => it.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const it of items) {
      if (grounded.has(it.id)) continue;
      const held =
        it.rests.some((c) => grounded.has(c.below.id)) ||
        items.some((other) => grounded.has(other.id) && other.rests.some((c) => c.below.id === it.id)) ||
        (it.sides > 0 && items.some((other) => grounded.has(other.id) && touchesSide(it, other, cfg)));
      if (held) {
        grounded.add(it.id);
        grew = true;
      }
    }
  }
  for (const it of items) {
    if (!grounded.has(it.id)) {
      issues.push({
        kind: "floating",
        pieceId: it.id,
        name: it.name,
        detail: `${it.name} touches nothing — it would drop ${Math.round((it.box.min.y - cfg.floorY) * 1000)} mm to the bench.`,
      });
    }
  }

  /* Per-piece balance: a resting body whose weight hangs past its supports
     slides off, unless a lateral joint fastens it in place. */
  for (const it of items) {
    if (!grounded.has(it.id) || it.onFloor || !it.rests.length || it.sides > 0) continue;
    const corners = it.rests.flatMap(({ patch }) => [
      { x: patch.minX, z: patch.minZ },
      { x: patch.minX, z: patch.maxZ },
      { x: patch.maxX, z: patch.minZ },
      { x: patch.maxX, z: patch.maxZ },
    ]);
    const margin = hullMargin(it.com, convexHull(corners));
    if (margin < 0) {
      issues.push({
        kind: "tip",
        pieceId: it.id,
        name: it.name,
        detail: `${it.name} balances ${Math.round(-margin * 1000)} mm past its supports — it would slide off.`,
      });
      continue;
    }
    const restArea = it.rests.reduce((sum, c) => sum + c.areaM2, 0);
    const loadKg = it.massKg + carriedMass(it, items);
    if (
      it.rests.every((c) => c.areaM2 < cfg.minJointAreaM2) ||
      (it.footprintM2 > 0 && restArea / it.footprintM2 < cfg.minSupportShare) ||
      loadKg / restArea > cfg.maxJointKgPerM2
    ) {
      issues.push({
        kind: "joint",
        pieceId: it.id,
        name: it.name,
        detail: `${it.name} sits on ${Math.round(restArea * 1e6)} mm² of joint — that contact snaps under ${loadKg.toFixed(1)} kg.`,
      });
    }
  }

  /* Whole-build balance: combined centre of mass over the floor footprint. */
  const floorPatches = items
    .filter((it) => it.onFloor)
    .flatMap((it) => [
      { x: it.box.min.x, z: it.box.min.z },
      { x: it.box.min.x, z: it.box.max.z },
      { x: it.box.max.x, z: it.box.min.z },
      { x: it.box.max.x, z: it.box.max.z },
    ]);
  const groundedItems = items.filter((it) => grounded.has(it.id));
  const totalMass = groundedItems.reduce((sum, it) => sum + it.massKg, 0);
  const com = groundedItems.reduce(
    (acc, it) => ({
      x: acc.x + (it.com.x * it.massKg) / (totalMass || 1),
      y: acc.y + (it.com.y * it.massKg) / (totalMass || 1),
      z: acc.z + (it.com.z * it.massKg) / (totalMass || 1),
    }),
    { x: 0, y: 0, z: 0 },
  );
  const baseHull = convexHull(floorPatches);
  let baseMargin = 0;
  if (groundedItems.length && baseHull.length) {
    baseMargin = hullMargin(com, baseHull);
    if (baseMargin < 0) {
      issues.push({
        kind: "tip",
        pieceId: null,
        name: "the whole build",
        detail: `The build's weight sits ${Math.round(-baseMargin * 1000)} mm outside its base — it tips over.`,
      });
    }
  }

  const holds = issues.length === 0;
  return {
    holds,
    verdict: holds ? "holds" : "breaks",
    issues,
    comMm: { x: Math.round(com.x * 1000), y: Math.round(com.y * 1000), z: Math.round(com.z * 1000) },
    baseMarginMm: Math.round(baseMargin * 1000),
    baseHullMm: baseHull.map((p) => ({ x: Math.round(p.x * 1000), z: Math.round(p.z * 1000) })),
    pieceCount: items.length,
    contactCount: contacts.length,
  };
}

function touchesSide(a, b, cfg) {
  const w = overlap1d(a.box, b.box, "x");
  const d = overlap1d(a.box, b.box, "z");
  const h = overlap1d(a.box, b.box, "y");
  if (h <= 0) return false;
  const touchX = Math.abs(a.box.max.x - b.box.min.x) <= cfg.contactTolM || Math.abs(b.box.max.x - a.box.min.x) <= cfg.contactTolM;
  const touchZ = Math.abs(a.box.max.z - b.box.min.z) <= cfg.contactTolM || Math.abs(b.box.max.z - a.box.min.z) <= cfg.contactTolM;
  return (touchX && d > 0) || (touchZ && w > 0);
}

/** Mass resting (transitively) on top of a piece, split across supports. */
function carriedMass(piece, items, seen = new Set()) {
  let sum = 0;
  for (const other of items) {
    if (seen.has(other.id)) continue;
    const share = other.rests.filter((c) => c.below.id === piece.id).length;
    if (!share || !other.rests.length) continue;
    seen.add(other.id);
    sum += (other.massKg + carriedMass(other, items, seen)) * (share / other.rests.length);
  }
  return sum;
}

/** One HUD-ready sentence for the report. */
export function describeStability(report) {
  if (!report || !report.pieceCount) return "Nothing on the bench to test.";
  if (report.holds) {
    return `Holds — ${report.pieceCount} ${report.pieceCount === 1 ? "body" : "bodies"}, weight ${report.baseMarginMm} mm inside the base.`;
  }
  const first = report.issues[0];
  const more = report.issues.length - 1;
  return `Breaks — ${first.detail}${more > 0 ? ` (+${more} more)` : ""}`;
}

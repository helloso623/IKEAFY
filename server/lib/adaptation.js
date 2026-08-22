import { cheaperAlternatives, getPart, searchParts } from "./catalog.js";

const DEFAULT_DIMS = { x: 550, y: 550, z: 450 };

export function footprintM(part) {
  const d = part?.dimsMm || DEFAULT_DIMS;
  return {
    w: Math.max(0.05, Number(d.x || DEFAULT_DIMS.x) / 1000),
    d: Math.max(0.05, Number(d.y || DEFAULT_DIMS.y) / 1000),
    h: Math.max(0.05, Number(d.z || DEFAULT_DIMS.z) / 1000),
  };
}

export function isPlaceable(part) {
  if (!part || part.category !== "furniture") return false;
  const shape = part.shape;
  if (shape === "post" || shape === "dowel" || shape === "board") return false;
  if (shape === "table" || shape === "slab") return true;
  const foot = footprintM(part);
  return foot.w >= 0.35 && foot.d >= 0.35;
}

export function fitsRoom(part, widthM, depthM) {
  const foot = footprintM(part);
  return foot.w <= Number(widthM) * 0.95 && foot.d <= Number(depthM) * 0.95;
}

function isWholeTable(part) {
  if (part.shape === "table") return true;
  const name = String(part.name || "");
  return /table/i.test(name) && !/top|leg/i.test(name);
}

function pickPart({ want, budget, widthM, depthM }) {
  const furniture = searchParts({ query: want, maxCost: budget, category: "furniture" }).filter(
    (part) => isPlaceable(part) && fitsRoom(part, widthM, depthM),
  );
  const tables = furniture.filter(isWholeTable);
  if (tables.length) return tables[0];
  if (furniture.length) return furniture[0];
  const anyFit = searchParts({ maxCost: budget, category: "furniture" }).filter(
    (part) => isPlaceable(part) && fitsRoom(part, widthM, depthM),
  );
  return anyFit[0] || getPart("lack-table");
}

function cheaperFits(pick, { budget, widthM, depthM }) {
  const cap = Math.min(Number(budget) || pick.cost, pick.cost);
  return cheaperAlternatives(pick.id, { maxCost: cap })
    .filter((part) => isPlaceable(part) && fitsRoom(part, widthM, depthM) && part.cost < pick.cost)
    .slice(0, 4)
    .map((part) => ({
      id: part.id,
      name: part.name,
      cost: part.cost,
      store: part.store,
      storeUrl: part.storeUrl,
      saved: part.saved,
      dimsMm: part.dimsMm,
      footprintM: footprintM(part),
      note: part.note,
    }));
}

function placeInRoom(pick, widthM, depthM) {
  const foot = footprintM(pick);
  const x = Math.min(Math.max(widthM * 0.35, 0.15), Math.max(0.1, widthM - foot.w - 0.25));
  const z = Math.min(Math.max(depthM * 0.25, 0.15), Math.max(0.1, depthM - foot.d - 0.25));
  return {
    id: "place-1",
    partId: pick.id,
    x,
    y: 0,
    z,
    yaw: 0,
    widthM: foot.w,
    depthM: foot.d,
    heightM: foot.h,
    why: "Clears the door swing and sits on the photo's empty floor patch.",
  };
}

function summarizePick(pick) {
  const foot = footprintM(pick);
  return {
    id: pick.id,
    name: pick.name,
    cost: pick.cost,
    store: pick.store,
    storeUrl: pick.storeUrl,
    color: pick.color,
    shape: pick.shape || "table",
    dimsMm: pick.dimsMm || DEFAULT_DIMS,
    footprintM: foot,
  };
}

export function planRoom({
  widthM = 3.2,
  depthM = 3.8,
  photoName = "room.jpg",
  want = "table",
  budget = 40,
  placements = [],
} = {}) {
  const roomW = Math.max(0.5, Number(widthM) || 3.2);
  const roomD = Math.max(0.5, Number(depthM) || 3.8);
  const cap = Number(budget);
  const pick = pickPart({
    want,
    budget: Number.isFinite(cap) ? cap : 40,
    widthM: roomW,
    depthM: roomD,
  });
  const cheaper = cheaperFits(pick, {
    budget: Number.isFinite(cap) ? cap : pick.cost,
    widthM: roomW,
    depthM: roomD,
  });
  const defaultPlace = placeInRoom(pick, roomW, roomD);
  const items = placements.length ? placements : [defaultPlace];
  const materials = [pick, ...cheaper.slice(0, 2), getPart("tape-gaffer"), getPart("pine-offcut")].filter(Boolean);
  const summary = summarizePick(pick);
  return {
    photoName,
    room: { widthM: roomW, depthM: roomD },
    want,
    budget: Number.isFinite(cap) ? cap : 40,
    ordered: items,
    pick: summary,
    cheaper,
    materials: materials.map((p) => ({
      id: p.id,
      name: p.name,
      cost: p.cost,
      store: p.store,
      storeUrl: p.storeUrl,
    })),
    overlay: {
      mode: "photo-overlay",
      x: items[0].x,
      z: items[0].z,
      widthM: items[0].widthM || summary.footprintM.w,
      depthM: items[0].depthM || summary.footprintM.d,
      heightM: items[0].heightM || summary.footprintM.h,
      color: summary.color,
      shape: summary.shape,
    },
    ar: {
      mode: "photo-overlay",
      note: "Drop the 3D piece on the photo. Same render as the bench.",
    },
    note: cheaper.length
      ? `Adaptation plan uses the catalog list, not a live web crawl. ${cheaper.length} cheaper fit${cheaper.length === 1 ? "" : "s"} in this room.`
      : "Adaptation plan uses the catalog list, not a live web crawl. No cheaper fit in this room and budget.",
  };
}

export function orderInRoom(plan, { nudge } = {}) {
  const items = plan.ordered.map((item, i) => {
    if (nudge && nudge.id === item.id) {
      return {
        ...item,
        x: item.x + (nudge.dx || 0),
        z: item.z + (nudge.dz || 0),
        yaw: item.yaw + (nudge.dyaw || 0),
      };
    }
    return { ...item, x: item.x + i * 0.05 };
  });
  const first = items[0] || {};
  return {
    ...plan,
    ordered: items,
    overlay: {
      ...(plan.overlay || {}),
      x: first.x,
      z: first.z,
    },
    note: "AI laid the pieces along the clear wall.",
  };
}

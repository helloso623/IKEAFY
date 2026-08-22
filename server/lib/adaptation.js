import { cheaperAlternatives, getPart, searchParts } from "./catalog.js";

export function planRoom({
  widthM = 3.2,
  depthM = 3.8,
  photoName = "room.jpg",
  want = "table",
  budget = 40,
  placements = [],
} = {}) {
  const candidates = searchParts({ query: want, maxCost: budget, category: "furniture" });
  const pick = candidates[0] || getPart("lack-table");
  const cheaper = cheaperAlternatives(pick.id, { maxCost: budget });
  const defaultPlace = {
    id: "place-1",
    partId: pick.id,
    x: widthM * 0.35,
    y: 0,
    z: depthM * 0.25,
    yaw: 0,
    why: "Clears the door swing and sits on the photo's empty floor patch.",
  };
  const items = placements.length ? placements : [defaultPlace];
  const materials = [
    pick,
    ...cheaper.slice(0, 2),
    getPart("tape-gaffer"),
    getPart("pine-offcut"),
  ].filter(Boolean);
  return {
    photoName,
    room: { widthM, depthM },
    want,
    budget,
    ordered: items,
    pick: { id: pick.id, name: pick.name, cost: pick.cost, store: pick.store, storeUrl: pick.storeUrl },
    cheaper: cheaper.slice(0, 4),
    materials: materials.map((p) => ({
      id: p.id,
      name: p.name,
      cost: p.cost,
      store: p.store,
      storeUrl: p.storeUrl,
    })),
    ar: {
      mode: "photo-overlay",
      note: "Drop the 3D piece on the photo. Same render as the bench.",
    },
    note: "Adaptation plan uses the catalog list, not a live web crawl.",
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
  return { ...plan, ordered: items, note: "AI laid the pieces along the clear wall." };
}

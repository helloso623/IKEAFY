/**
 * The 3D house rebuild is heuristics plus wiring: photogram.js is pure math
 * that node can import directly, and the markup/module contract around
 * #room-photos, #room-scene and the adapt/scan flows is checked as text.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  assignSurfaces,
  cropRegion,
  estimateHorizon,
  frameRoomCamera,
  lumaRows,
  overlayFloorFromHorizon,
  overlayFootprintPx,
  placeFurniture,
  roomFromPhotos,
  wallBoxes,
} from "../client/src/photogram.js";
import {
  GENERIC_SIDE_TABLE,
  GENERIC_SIDE_TABLE_M,
} from "../client/src/generic-table.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function syntheticRows({ height = 100, split = 55, wall = 70, floor = 175 } = {}) {
  const width = 8;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const value = y < split ? wall : floor;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      rgba[i] = value;
      rgba[i + 1] = value;
      rgba[i + 2] = value;
      rgba[i + 3] = 255;
    }
  }
  return lumaRows(rgba, width, height);
}

test("the vanishing line lands on the wall/floor luminance step", () => {
  const horizon = estimateHorizon(syntheticRows({ split: 55 }));
  assert.ok(horizon > 0.5 && horizon < 0.6, `expected ≈0.55, got ${horizon}`);
  const higher = estimateHorizon(syntheticRows({ split: 70 }));
  assert.ok(higher > horizon, "a lower wall/floor edge reads as a higher horizon fraction");
});

test("a flat photo falls back to the default horizon", () => {
  const flat = estimateHorizon(new Array(100).fill(128));
  assert.equal(flat, 0.55);
  assert.equal(estimateHorizon([]), 0.55);
});

test("known width and depth scale the room mesh to metres", () => {
  const room = roomFromPhotos({ widthM: 4.2, depthM: 3.1, horizon: 0.5 });
  assert.equal(room.widthM, 4.2);
  assert.equal(room.depthM, 3.1);
  assert.equal(room.metric, true);
  assert.ok(room.heightM >= 2.2 && room.heightM <= 3.4);
});

test("without measurements the room follows the photo aspect and horizon", () => {
  const room = roomFromPhotos({ aspect: 4 / 3, horizon: 0.55 });
  assert.equal(room.metric, false);
  assert.ok(room.widthM > 0 && room.depthM > 0);
  const wide = roomFromPhotos({ aspect: 16 / 9, horizon: 0.55 });
  assert.ok(wide.depthM > room.depthM, "a wider frame sees more floor running away");
  const tall = roomFromPhotos({ horizon: 0.62 });
  const low = roomFromPhotos({ horizon: 0.45 });
  assert.ok(tall.heightM > low.heightM, "more frame above the vanishing line means a taller wall");
});

test("wall boxes fence the floor plane on all four sides", () => {
  const room = { widthM: 3.2, depthM: 3.8, heightM: 2.7 };
  const walls = wallBoxes(room);
  assert.equal(walls.length, 4);
  assert.deepEqual(new Set(walls.map((w) => w.side)), new Set(["back", "front", "left", "right"]));
  for (const wall of walls) assert.equal(wall.h, 2.7);
  assert.ok(walls.find((w) => w.side === "back").z < 0);
  assert.ok(walls.find((w) => w.side === "front").z > room.depthM);
  assert.ok(walls.find((w) => w.side === "left").x < 0);
  assert.ok(walls.find((w) => w.side === "right").x > room.widthM);
});

test("one photo splits at the horizon; extra photos take the walls", () => {
  assert.deepEqual(assignSurfaces(0), {});
  const single = assignSurfaces(1);
  assert.deepEqual(single.floor, { photo: 0, region: "below" });
  assert.deepEqual(single.back, { photo: 0, region: "above" });
  const many = assignSurfaces(4);
  assert.deepEqual(many.floor, { photo: 0, region: "below" });
  for (const side of ["back", "right", "left", "front"]) {
    assert.equal(many[side].region, "full");
    assert.ok(many[side].photo >= 1 && many[side].photo <= 3, `${side} uses an extra photo`);
  }
});

test("crop regions cover the photo exactly, floor below and walls above", () => {
  const below = cropRegion("below", 0.6);
  const above = cropRegion("above", 0.6);
  assert.equal(below.y, 0.6);
  assert.ok(Math.abs(below.h + above.h - 1) < 1e-9);
  assert.equal(above.y, 0);
  assert.deepEqual(cropRegion("full"), { x: 0, y: 0, w: 1, h: 1 });
});

test("scanned meshes land in the open floor for positioning tests", () => {
  const room = { widthM: 3.2, depthM: 3.8, heightM: 2.7 };
  const placed = placeFurniture({
    pieces: [{ id: "s1", name: "Scanned object 1", dimsMm: { x: 400, y: 300, z: 420 }, positions: new Float32Array(9) }],
    room,
  });
  assert.equal(placed[0].source, "scan");
  assert.ok(placed[0].z > 1, "the scan sits in the room, not against the back wall");
  assert.ok(placed[0].x > 0.5 && placed[0].x < room.widthM - 0.5);
});

test("the default table footprint is the neutral 550 × 550 × 450 mm placeholder", () => {
  assert.equal(GENERIC_SIDE_TABLE.widthMm, 550);
  assert.equal(GENERIC_SIDE_TABLE.depthMm, 550);
  assert.equal(GENERIC_SIDE_TABLE.heightMm, 450);
  assert.equal(GENERIC_SIDE_TABLE_M.w, 0.55);
  assert.equal(GENERIC_SIDE_TABLE.id, "generic-side-table");
  assert.match(GENERIC_SIDE_TABLE.note, /specs needed for an exact IKEA article/i);
});

test("the camera frames the house from the open front so orbit can see the room", () => {
  const room = { widthM: 3.2, depthM: 3.8, heightM: 2.7 };
  const pose = frameRoomCamera(room);
  assert.equal(pose.target.x, room.widthM / 2);
  assert.ok(pose.target.z > 0 && pose.target.z < room.depthM);
  assert.ok(pose.position.z > room.depthM, "camera sits outside the open front so orbit has room");
  assert.ok(pose.position.y > 1);
  assert.ok(pose.maxDistance > pose.minDistance);
  const dist = Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  );
  assert.ok(dist > pose.minDistance);
});

test("the room photo overlay scales the table to room metres on the photo floor", () => {
  const floor = overlayFloorFromHorizon({ x: 0, y: 0, w: 800, h: 600 }, 0.5);
  assert.equal(floor.y, 300);
  assert.equal(floor.h, 300);
  const px = overlayFootprintPx(GENERIC_SIDE_TABLE_M, floor, { widthM: 3.2, depthM: 3.8 });
  assert.ok(px.topW < 800 * 0.3, "a 0.55 m table does not fill a 3.2 m room");
  assert.ok(px.topW > 20);
});

test("the popped table keeps its planned spot, in metres, inside the room", () => {
  const room = { widthM: 3.2, depthM: 3.8, heightM: 2.7 };
  const plan = {
    ordered: [{ id: "place-1", x: 1.12, z: 0.95, widthM: 0.55, depthM: 0.55, heightM: 0.45 }],
    pick: { name: "LACK table", color: "#f3efe6", shape: "table" },
  };
  const [table] = placeFurniture({ plan, room });
  assert.equal(table.source, "plan");
  assert.equal(table.name, "LACK table");
  assert.ok(Math.abs(table.x - 1.395) < 1e-9, "centre = planned corner + half footprint");
  assert.ok(table.x - table.w / 2 >= 0 && table.x + table.w / 2 <= room.widthM);
  assert.ok(table.z - table.d / 2 >= 0 && table.z + table.d / 2 <= room.depthM);
});

test("scanned and bench furniture is placed from millimetre dims, clamped in-room", () => {
  const room = { widthM: 3.2, depthM: 3.8, heightM: 2.7 };
  const pieces = [
    { id: "b1", name: "Table top", dimsMm: { x: 550, y: 550, z: 50 } },
    { id: "s1", name: "Scanned object 1", dimsMm: { x: 400, y: 300, z: 420 }, positions: new Float32Array(9) },
    { id: "nodims", name: "ghost" },
    { id: "huge", name: "Wardrobe", dimsMm: { x: 9000, y: 800, z: 2000 } },
  ];
  const placed = placeFurniture({ pieces, room });
  assert.equal(placed.length, 3, "a piece without dims is skipped");
  assert.equal(placed[0].w, 0.55);
  assert.equal(placed[1].source, "scan");
  assert.ok(placed[1].positions instanceof Float32Array, "scanned meshes carry their triangles");
  for (const item of placed.slice(0, 2)) {
    assert.ok(item.x - item.w / 2 >= 0 && item.x + item.w / 2 <= room.widthM, `${item.id} stays in the room`);
    assert.ok(item.z - item.d / 2 >= 0 && item.z + item.d / 2 <= room.depthM);
  }
  const huge = placed[2];
  assert.ok(huge.x <= huge.w / 2 + 0.02 + room.widthM, "an oversized piece still clamps near the room");
});

test("the room panel takes many photos and the stage has a 3D scene canvas", () => {
  const html = read("client/index.html");
  assert.match(html, /<input id="room-photos"[^>]*multiple/);
  assert.doesNotMatch(html, /data-lab="ar"/);
  assert.match(html, /id="scan-camera-preview"[^>]*autoplay[^>]*playsinline/);
  assert.match(html, /id="scan-camera-capture"/);
  assert.match(html, /id="room-scene"/);
  assert.match(html, /id="house-view-btn"/);
  assert.match(html, /id="room-photo"/, "the single room photo input stays");
  const css = read("client/src/styles.css");
  assert.match(css, /#app\.mode-lab\[data-lab="house"\] #room-scene/, "the same scene shows in House");
  assert.doesNotMatch(css, /data-lab="ar"/);
});

test("house.js regenerates the house as a textured 3D scene", () => {
  const house = read("client/src/house.js");
  assert.match(house, /from "\.\/photogram\.js"/);
  assert.match(house, /WebGLRenderer/);
  assert.match(house, /OrbitControls/);
  assert.match(house, /rebuildHouse3d/);
  assert.match(house, /PlaneGeometry/, "the floor is a textured plane");
  assert.match(house, /wallBoxes/, "walls come from the vanishing-line heuristic");
  assert.match(house, /CanvasTexture/, "surfaces are textured from the photos");
  assert.match(house, /room-photos/);
  assert.doesNotMatch(house, /getUserMedia/, "camera capture belongs to Scan, not House");
  assert.match(house, /api\.adapt/, "adapt still works");
  assert.match(house, /api\.scan/, "the catalog scan still works");
  assert.match(house, /scanFits\(\)/, "the room scan keeps its trigger");
  assert.match(house, /makeGenericSideTable/, "the 3D table is a neutral editable placeholder, not a gray box");
  assert.match(house, /frameRoomCamera/, "the camera frames the room");
  assert.match(house, /KeyW/, "WASD walks around the room");
  assert.match(house, /overlayFootprintPx/, "the AR overlay scales the table to room metres");
  assert.match(house, /resolveRoomScale/, "room metres come from measurements, vanishing, known object, or two taps");
  assert.match(house, /room-scale-kind/);
});

test("the bench hands its pieces — including scanned meshes — to the house", () => {
  const main = read("client/src/main.js");
  assert.match(main, /getPieces/);
  assert.match(main, /getReconstructed/);
  const workshop = read("client/src/workshop.js");
  assert.match(workshop, /getReconstructed:[\s\S]{0,260}positions/, "reconstructions expose their triangles");
});

/**
 * House 3D scene — the photo-to-room pipeline.
 *
 * room-builder.js is deliberately DOM-free so the whole path from pixels to
 * a room model to furniture placement runs under node:test: synthetic photos
 * go in, the horizon/colours/walls/placements come out. The wiring block at
 * the end reads the client files as text, same as wiring.test.js.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  WALL_IDS,
  analyzeRoomPhoto,
  buildRoomModel,
  findHorizon,
  layoutFurniture,
  wallPlacements,
} from "../client/src/room-builder.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const HEX = /^#[0-9a-f]{6}$/;

function syntheticRoom({
  width = 64,
  height = 64,
  horizon = 0.5,
  wall = [150, 150, 160],
  floor = [120, 80, 50],
  patch = null,
} = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const color = y / height < horizon ? wall : floor;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      let [r, g, b] = color;
      if (
        patch &&
        x >= patch.x &&
        x < patch.x + patch.w &&
        y >= patch.y &&
        y < patch.y + patch.h
      ) {
        [r, g, b] = patch.color;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function hexChannels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

test("analyzeRoomPhoto finds the wall/floor horizon and reads both colours", () => {
  const image = syntheticRoom({ horizon: 0.55 });
  const result = analyzeRoomPhoto(image);
  assert.ok(Math.abs(result.horizon - 0.55) < 0.08, `horizon ${result.horizon} should sit near 0.55`);
  assert.match(result.floorColor, HEX);
  assert.match(result.wallColor, HEX);
  const [fr, , fb] = hexChannels(result.floorColor);
  assert.ok(fr > fb, "the brown floor reads warmer than blue");
  const [wr, , wb] = hexChannels(result.wallColor);
  assert.ok(wb >= wr, "the cool wall keeps its blue cast");
  assert.ok(result.brightness > 0 && result.brightness < 1);
  assert.match(result.ceilingColor, HEX);
});

test("a saturated patch becomes the accent colour", () => {
  const image = syntheticRoom({
    patch: { x: 10, y: 40, w: 12, h: 12, color: [220, 40, 40] },
  });
  const result = analyzeRoomPhoto(image);
  assert.ok(result.accentColor, "the red patch should register");
  const [r, g, b] = hexChannels(result.accentColor);
  assert.ok(r > g && r > b, "accent is the red patch, not the grey room");
});

test("a flat grey photo yields no accent and a mid horizon guess", () => {
  const flat = syntheticRoom({ wall: [128, 128, 128], floor: [128, 128, 128] });
  const result = analyzeRoomPhoto(flat);
  assert.equal(result.accentColor, null);
  assert.ok(result.horizon >= 0.3 && result.horizon <= 0.92);
});

test("findHorizon stays inside the scan band", () => {
  const rows = Array.from({ length: 50 }, (_, y) => (y < 5 ? [250, 250, 250] : [30, 30, 30]));
  const ratio = findHorizon(rows);
  assert.ok(ratio >= 0.3 && ratio <= 0.92, `horizon ${ratio} must clamp into 0.3..0.92`);
});

test("buildRoomModel dresses one wall per photo, wrapping when photos run short", () => {
  const photos = [
    { wallColor: "#888890", floorColor: "#7a5230", ceilingColor: "#eeeeee", horizon: 0.5, brightness: 0.4, accentColor: null },
    { wallColor: "#99aabb", floorColor: "#66492c", ceilingColor: "#e8e8e8", horizon: 0.6, brightness: 0.6, accentColor: "#cc3333" },
  ];
  const model = buildRoomModel({ widthM: 3.2, depthM: 3.8, heightM: 2.5, photos });
  assert.equal(model.walls.length, 4);
  assert.deepEqual(model.walls.map((w) => w.id), WALL_IDS);
  assert.deepEqual(model.walls.map((w) => w.photoIndex), [0, 1, 0, 1]);
  assert.equal(model.walls[0].color, "#888890");
  assert.equal(model.walls[1].color, "#99aabb");
  assert.match(model.floor.color, HEX);
  assert.equal(model.floor.source, "photo");
  assert.equal(model.accentColor, "#cc3333");
  assert.equal(model.photoCount, 2);
  assert.ok(model.light.intensity >= 0.7 && model.light.intensity <= 1.6);
});

test("buildRoomModel without photos still stands a neutral room", () => {
  const model = buildRoomModel({ widthM: 3, depthM: 4 });
  assert.equal(model.photoCount, 0);
  assert.equal(model.floor.source, "default");
  assert.ok(model.walls.every((w) => w.photoIndex === -1));
  assert.ok(model.walls.every((w) => HEX.test(w.color)));
});

test("buildRoomModel clamps silly measurements", () => {
  const model = buildRoomModel({ widthM: 100, depthM: 0.1, heightM: 9 });
  assert.equal(model.room.widthM, 12);
  assert.equal(model.room.depthM, 1.2);
  assert.equal(model.room.heightM, 4);
});

test("wallPlacements puts each wall on its edge facing the room", () => {
  const model = buildRoomModel({ widthM: 3.2, depthM: 3.8, heightM: 2.5, photos: [] });
  const spots = Object.fromEntries(wallPlacements(model).map((s) => [s.id, s]));
  assert.deepEqual([spots.back.x, spots.back.z, spots.back.ry], [1.6, 0, 0]);
  assert.deepEqual([spots.front.x, spots.front.z, spots.front.ry], [1.6, 3.8, Math.PI]);
  assert.deepEqual([spots.left.x, spots.left.z, spots.left.ry], [0, 1.9, Math.PI / 2]);
  assert.deepEqual([spots.right.x, spots.right.z, spots.right.ry], [3.2, 1.9, -Math.PI / 2]);
  assert.equal(spots.back.lengthM, 3.2);
  assert.equal(spots.left.lengthM, 3.8);
  assert.ok(spots.back.heightM === 2.5);
});

const PLAN = {
  pick: {
    id: "lack-table",
    name: "LACK side table",
    color: "#f3efe6",
    shape: "table",
    footprintM: { w: 0.55, d: 0.55, h: 0.45 },
  },
  overlay: { color: "#f3efe6", shape: "table" },
  ordered: [{ id: "place-1", partId: "lack-table", x: 1.12, z: 0.95, yaw: 0 }],
};

test("layoutFurniture converts plan corners to centres inside the room", () => {
  const room = { widthM: 3.2, depthM: 3.8 };
  const [spot] = layoutFurniture(PLAN, room);
  assert.equal(spot.name, "LACK side table");
  assert.equal(spot.shape, "table");
  assert.ok(Math.abs(spot.x - (1.12 + 0.275)) < 1e-9);
  assert.ok(Math.abs(spot.z - (0.95 + 0.275)) < 1e-9);
  assert.equal(spot.heightM, 0.45);
});

test("layoutFurniture clamps a runaway placement back inside the walls", () => {
  const plan = { ...PLAN, ordered: [{ ...PLAN.ordered[0], x: 10, z: -5 }] };
  const room = { widthM: 3.2, depthM: 3.8 };
  const [spot] = layoutFurniture(plan, room);
  assert.ok(spot.x + spot.widthM / 2 <= room.widthM, "right edge stays inside");
  assert.ok(spot.z - spot.depthM / 2 >= 0, "near edge stays inside");
});

test("layoutFurniture slides the second piece off the first", () => {
  const plan = {
    ...PLAN,
    ordered: [
      { id: "a", partId: "lack-table", x: 1.0, z: 1.0 },
      { id: "b", partId: "lack-table", x: 1.0, z: 1.0 },
    ],
  };
  const [a, b] = layoutFurniture(plan, { widthM: 3.2, depthM: 3.8 });
  const apart =
    Math.abs(a.x - b.x) >= (a.widthM + b.widthM) / 2 ||
    Math.abs(a.z - b.z) >= (a.depthM + b.depthM) / 2;
  assert.ok(apart, `pieces still overlap: a(${a.x}, ${a.z}) b(${b.x}, ${b.z})`);
});

test("layoutFurniture with no plan places nothing", () => {
  assert.deepEqual(layoutFurniture(null, { widthM: 3, depthM: 3 }), []);
  assert.deepEqual(layoutFurniture({ ordered: [] }, { widthM: 3, depthM: 3 }), []);
});

test("House wiring: multi-photo input, 3D canvas, and the rebuilt-room path", () => {
  const html = read("client/index.html");
  assert.match(html, /id="house-view"/, "the stage needs the 3D room canvas");
  assert.match(html, /id="room-photo"[^>]*multiple/, "the photo input takes several angles");
  assert.match(html, /id="house-build"/);
  assert.match(html, /id="house-photos"/);
  assert.match(html, /id="room-h"/, "room height feeds the walls");

  const house = read("client/src/house.js");
  assert.match(house, /analyzeRoomPhoto/);
  assert.match(house, /buildRoomModel/);
  assert.match(house, /layoutFurniture/);
  assert.match(house, /createHouseScene/);
  assert.match(house, /createImageBitmap/, "photos are read locally, never uploaded");

  const house3d = read("client/src/house3d.js");
  assert.match(house3d, /wallPlacements/);
  assert.match(house3d, /PlaneGeometry/, "floor and walls are real meshes");
  assert.match(house3d, /OrbitControls/);

  const main = read("client/src/main.js");
  assert.match(main, /house\?\.setSpace\(space\)/, "the House space drives the scene");
  assert.match(main, /setLabSpace\("house"\)/, "fresh photos land in House");

  const css = read("client/src/styles.css");
  assert.match(css, /data-lab="house"/);
  assert.match(css, /#house-view/);
});

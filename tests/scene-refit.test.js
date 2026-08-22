import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createBinaryOccupancy,
  fitModelToRoom,
  generateDesignIssues,
  modelEnvelope,
  moveBinaryFootprint,
  scenePlanSource,
} from "../client/src/scene-refit.js";

test("moving a table erases the old binary footprint before stamping the new fit", () => {
  const room = { widthM: 4, depthM: 3, heightM: 2.6 };
  const field = createBinaryOccupancy(room, 40);
  const oldFit = { id: "table", x: 0.6, z: 0.6, w: 0.5, d: 0.5 };
  const newFit = { ...oldFit, x: 3.2, z: 2.2 };
  moveBinaryFootprint(field, null, oldFit);
  const oldCells = field.cells.slice();
  const moved = moveBinaryFootprint(field, oldFit, newFit);

  assert.ok(moved.removedCells > 0);
  assert.ok(moved.addedCells > 0);
  assert.equal(
    oldCells.some((value, index) => value && field.cells[index]),
    false,
    "the non-overlapping old footprint is absent from current occupancy",
  );
});

test("the current bench model is re-enveloped after edits and fitted inside the room", () => {
  const envelope = modelEnvelope([
    {
      id: "top",
      name: "top",
      shape: "slab",
      dimsMm: { x: 1000, y: 600, z: 30 },
      x: 0,
      y: 0.72,
      z: 0,
      sx: 1.2,
      sy: 1,
      sz: 1,
    },
    {
      id: "leg",
      name: "leg",
      shape: "post",
      dimsMm: { x: 50, y: 50, z: 700 },
      x: 0.45,
      y: 0.35,
      z: 0.25,
    },
  ]);
  assert.equal(envelope.w, 1.2);
  assert.ok(envelope.h > 0.7);
  const fitted = fitModelToRoom({ ...envelope, x: 99, z: -10 }, { widthM: 3, depthM: 2 });
  assert.ok(fitted.x + fitted.w / 2 <= 3);
  assert.ok(fitted.z - fitted.d / 2 >= 0);
});

test("room-aware checks regenerate overhang, height, and collision results", () => {
  const model = {
    id: "current-model",
    name: "Current table",
    x: 1,
    z: 1,
    w: 1.2,
    d: 0.8,
    h: 2.75,
    pieces: [
      { shape: "slab", scaled: { w: 1.2, d: 0.8 }, modelX: 0, modelZ: 0 },
      { shape: "post", name: "leg", scaled: { w: 0.05, d: 0.05 }, modelX: 0, modelZ: 0 },
    ],
  };
  const issues = generateDesignIssues({
    model,
    room: { widthM: 3, depthM: 3, heightM: 2.5 },
    obstacles: [{ id: "chair", name: "chair", x: 1.2, z: 1, w: 0.5, d: 0.5 }],
  });
  assert.deepEqual(issues.map((issue) => issue.type), ["overhang", "height", "collision"]);
  assert.equal(issues.find((issue) => issue.type === "overhang").level, "warning");
  assert.equal(issues.find((issue) => issue.type === "height").level, "error");
  assert.equal(issues.find((issue) => issue.type === "collision").level, "error");
});

test("the scene scan source carries the baked dimensions, occupancy, and checks into numbered steps", () => {
  const source = scenePlanSource({
    room: { widthM: 3.2, depthM: 3.8, heightM: 2.7 },
    model: { name: "Current table", w: 1, d: 0.6, h: 0.74, x: 1.4, z: 1.2 },
    occupancy: { resolution: 48, occupiedCells: 126 },
    issues: [{ title: "Collision", message: "Current footprint is clear." }],
  });
  assert.match(source, /1000 × 600 × 740 mm/);
  assert.match(source, /Binary occupancy: 126 cells at 48²/);
  assert.match(source, /2\. Clear the old table footprint/);
  assert.match(source, /Collision: Current footprint is clear/);
});

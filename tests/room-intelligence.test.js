import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createOccupancyGrid,
  detectDesignIssues,
  isPlacementFree,
  reconcileFurniturePlacement,
  stampFootprint,
} from "../client/src/room-intelligence.js";

test("moving a table cuts its old binary scan mask before auto-fitting", () => {
  const grid = createOccupancyGrid({ widthM: 4, depthM: 3 }, { cellSize: 0.1 });
  const oldTable = { x: 0.8, z: 0.8, w: 0.6, d: 0.6, h: 0.74 };
  stampFootprint(grid, oldTable, oldTable, 1);
  const obstacle = { x: 2, z: 1.5, w: 0.8, d: 0.8 };
  stampFootprint(grid, obstacle, obstacle, 1);

  const result = reconcileFurniturePlacement(
    grid,
    oldTable,
    { ...oldTable, x: 2, z: 1.5 },
    { clearance: 0.2 },
  );

  assert.equal(result.ok, true);
  assert.ok(result.removedCells > 0);
  assert.ok(result.addedCells > 0);
  assert.notDeepEqual({ x: result.model.x, z: result.model.z }, { x: 2, z: 1.5 });
  assert.equal(isPlacementFree(result.remaining, result.model, result.model, 0.2), true);
  assert.equal(isPlacementFree(result.remaining, oldTable, oldTable), true);
});

test("design checks cover occupancy, traffic, chair height, overhang, supports, and door swing", () => {
  const room = { widthM: 3, depthM: 3, heightM: 2.6 };
  const grid = createOccupancyGrid(room, { cellSize: 0.1 });
  const target = { x: 2.35, z: 2.35, w: 0.9, d: 0.9, h: 0.58 };
  stampFootprint(grid, { w: 0.3, d: 0.3 }, { x: 2.35, z: 2.35 }, 1);
  const issues = detectDesignIssues({
    room,
    target,
    grid,
    model: {
      undersideM: 0.54,
      topWidthM: 1.3,
      supportSpanM: 0.5,
      supportCount: 2,
    },
    door: { x: 2.55, z: 3, radiusM: 0.9 },
  });
  const ids = new Set(issues.map((issue) => issue.id));
  for (const id of ["collision", "foot-traffic", "chair-height", "overhang", "supports", "door-swing"]) {
    assert.equal(ids.has(id), true, `${id} should be regenerated`);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { orderInRoom, planRoom } from "../server/lib/adaptation.js";
import { addPiece, emptyProject, seedLampTable, snapshotSim, resetSim } from "../server/lib/project.js";

test("room plan stays on budget and offers cheaper wood", () => {
  const plan = planRoom({ widthM: 3, depthM: 4, budget: 20, want: "table" });
  assert.ok(plan.pick.cost <= 20);
  assert.ok(plan.ordered[0].x < 3);
  assert.ok(plan.cheaper.length >= 0);
});

test("order nudge moves the piece in the photo plane", () => {
  const plan = planRoom();
  const moved = orderInRoom(plan, { nudge: { id: plan.ordered[0].id, dx: 0.4, dz: 0.1 } });
  assert.ok(moved.ordered[0].x > plan.ordered[0].x);
});

test("seeded lamp table isolates a board and reset works", () => {
  const p = seedLampTable();
  assert.ok(p.abstractions.some((a) => a.kind === "board"));
  assert.ok(p.cables.length >= 1);
  snapshotSim(p);
  p.pieces[0].x = 9;
  resetSim(p);
  assert.notEqual(p.pieces[0].x, 9);
});

test("unknown part is rejected", () => {
  const p = emptyProject();
  assert.throws(() => addPiece(p, "nope"));
});

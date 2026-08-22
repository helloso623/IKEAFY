import { test } from "node:test";
import assert from "node:assert/strict";
import { orderInRoom, planRoom, scanAssemblies } from "../server/lib/adaptation.js";
import { addPiece, emptyProject, seedLampTable, snapshotSim, resetSim } from "../server/lib/project.js";

test("room plan stays on budget and offers cheaper wood", () => {
  const plan = planRoom({ widthM: 3, depthM: 4, budget: 20, want: "table" });
  assert.equal(plan.pick.id, "generic-side-table");
  assert.equal(plan.pick.dimsMm.x, 550);
  assert.equal(plan.pick.dimsMm.z, 450);
  assert.ok(plan.pick.cost <= 20);
  assert.ok(plan.pick.footprintM.w < 3);
  assert.ok(plan.ordered[0].x < 3);
  assert.ok(plan.overlay.mode === "photo-overlay");
  assert.ok(plan.cheaper.length >= 1);
  assert.ok(plan.cheaper.some((item) => item.id === "pine-offcut"));
  assert.ok(plan.cheaper.every((item) => item.cost < plan.pick.cost && item.cost <= 20));
});

test("order nudge moves the piece in the photo plane", () => {
  const plan = planRoom();
  const moved = orderInRoom(plan, { nudge: { id: plan.ordered[0].id, dx: 0.4, dz: 0.1 } });
  assert.ok(moved.ordered[0].x > plan.ordered[0].x);
});

test("seeded lamp table isolates a board and reset works", () => {
  const p = seedLampTable();
  assert.equal(p.pieces[0].partId, "generic-side-table");
  assert.ok(p.abstractions.some((a) => a.kind === "board"));
  assert.ok(p.cables.length >= 1);
  snapshotSim(p);
  p.pieces[0].x = 9;
  resetSim(p);
  assert.notEqual(p.pieces[0].x, 9);
});

test("scan of a 550 mm piece suggests a LACK table", () => {
  const scan = scanAssemblies({ dimsMm: { x: 550, y: 550, z: 36 }, budget: 40, source: "piece" });
  assert.match(scan.headline, /you could end up with this/i);
  assert.equal(scan.scanned.source, "piece");
  assert.ok(scan.suggestions.some((item) => item.id === "lack-table"));
  assert.ok(scan.suggestions.every((item) => item.cost <= 40 && item.mm && item.dimsMm));
});

test("scan of the room keeps assemblies on the floor and budget", () => {
  const scan = scanAssemblies({ widthM: 3.2, depthM: 3.8, budget: 40, source: "room" });
  assert.equal(scan.scanned.source, "room");
  assert.ok(scan.suggestions.some((item) => item.id === "lack-table"));
  assert.ok(scan.suggestions.every((item) => item.dimsMm.x <= 3200 && item.dimsMm.y <= 3800));
  assert.ok(scan.suggestions.every((item) => item.cost <= 40));
});

test("a tight scan budget drops the LACK table for cheaper wood", () => {
  const scan = scanAssemblies({ dimsMm: { x: 550, y: 550 }, budget: 10, source: "piece" });
  assert.equal(scan.suggestions.some((item) => item.id === "lack-table"), false);
  assert.ok(scan.suggestions.some((item) => item.id === "pine-offcut" || item.id === "lack-top"));
});

test("unknown part is rejected", () => {
  const p = emptyProject();
  assert.throws(() => addPiece(p, "nope"));
});

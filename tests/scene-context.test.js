import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneContext, sceneSummary } from "../client/src/scene-context.js";

test("scene context names the watch step and the selected piece", () => {
  const scene = sceneContext({
    mode: "ikeafy",
    interfaceName: "watch",
    product: "LACK",
    step: 4,
    partId: "lack-top",
    partName: "LACK table top",
    pieceCount: 5,
    pieces: [{ id: "p1", partId: "lack-top", name: "LACK table top" }],
  });
  assert.equal(scene.interface, "watch");
  assert.equal(scene.step, 4);
  assert.equal(scene.partId, "lack-top");
  assert.match(sceneSummary(scene), /Watch · step 4/);
  assert.match(sceneSummary(scene), /LACK table top/);
});

test("lab scene includes the space and the room", () => {
  const scene = sceneContext({
    mode: "lab",
    lab: "house",
    pieceCount: 2,
    room: { widthM: 3.2, depthM: 3.8, budget: 40 },
  });
  assert.equal(scene.mode, "lab");
  assert.equal(scene.lab, "house");
  assert.equal(scene.room.widthM, 3.2);
  assert.match(sceneSummary(scene), /Lab · House/);
  assert.match(sceneSummary(scene), /3\.2 × 3\.8 m/);
});

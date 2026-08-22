import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAiMeshGeometry } from "../client/src/ai-mesh.js";
import {
  isMeshBuildAsk,
  localMeshAction,
  meshPlanFromDescription,
  meshPromptFromContext,
  sanitizeMeshAction,
} from "../server/lib/mesh-plan.js";

test("described builds route to meshes while explicit catalog drops stay catalog actions", () => {
  assert.equal(isMeshBuildAsk("build a round walnut table"), true);
  assert.equal(isMeshBuildAsk("generate a sculptural lamp"), true);
  assert.equal(isMeshBuildAsk("place a moon rover"), true);
  assert.equal(isMeshBuildAsk("I want a dragon"), true);
  assert.equal(isMeshBuildAsk("render a video camera"), true);
  assert.equal(isMeshBuildAsk("add a lack table"), false);
  assert.equal(isMeshBuildAsk("add zip ties"), false);
  assert.equal(isMeshBuildAsk("put four legs"), false);
  assert.equal(isMeshBuildAsk("find a cheap table"), false);
  assert.equal(isMeshBuildAsk("make the selected mesh taller"), false);
});

test("round pedestal proof is a circular top plus one central leg", () => {
  const action = localMeshAction("build a 90 cm diameter round walnut table, 74 cm tall, with one central leg");
  assert.equal(action.type, "mesh");
  assert.equal(action.mesh.kind, "table");
  assert.equal(action.mesh.components.length, 2);
  const [top, leg] = action.mesh.components;
  assert.equal(top.shape, "cylinder");
  assert.deepEqual(top.sizeMm, [900, 40, 900]);
  assert.equal(leg.shape, "cylinder");
  assert.match(leg.name, /central leg/i);
  assert.equal(action.mesh.components.some((body) => body.shape === "box"), false);

  const geometry = buildAiMeshGeometry(action.mesh);
  assert.ok(geometry.triangleCount > 100);
  assert.deepEqual(geometry.dimensionsMm, { x: 900, y: 900, z: 740 });
});

test("chair spawn has a seat, back, and four legs that meet the seat", () => {
  const action = localMeshAction("spawn a 480 mm wide chair");
  assert.equal(action.mesh.kind, "chair");
  const seat = action.mesh.components.find((body) => body.name === "Seat");
  const back = action.mesh.components.find((body) => body.name === "Back");
  const legs = action.mesh.components.filter((body) => /^Leg \d+$/.test(body.name));
  assert.ok(seat);
  assert.ok(back);
  assert.equal(legs.length, 4);
  assert.ok(back.positionMm[1] > seat.positionMm[1]);
  for (const leg of legs) {
    assert.equal(leg.positionMm[1] + leg.sizeMm[1] / 2, seat.positionMm[1] - seat.sizeMm[1] / 2);
  }
  const geometry = buildAiMeshGeometry(action.mesh);
  assert.deepEqual(geometry.dimensionsMm, { x: 480, y: 500, z: 900 });
});

test("recent user description grounds a spawn-it mesh follow-up", () => {
  const ctx = {
    history: [
      { role: "user", content: "I want a circular dining table with one central leg" },
      { role: "assistant", content: "That would look balanced." },
    ],
  };
  assert.match(meshPromptFromContext("spawn it", ctx), /circular dining table/);
  const action = localMeshAction("spawn it", ctx);
  assert.equal(action.mesh.kind, "table");
  assert.equal(action.mesh.components[0].shape, "cylinder");
});

test("compound furniture descriptions produce multiple real bodies", () => {
  const sofa = meshPlanFromDescription("create a wide green sofa");
  assert.equal(sofa.kind, "sofa");
  assert.ok(sofa.components.length >= 5);
  const geometry = buildAiMeshGeometry(sofa);
  assert.ok(geometry.positions.length > 100);
  assert.equal(geometry.positions.length, geometry.colors.length);
});

test("hosted explicit topology is sanitized and becomes bench triangles", () => {
  const action = sanitizeMeshAction({
    type: "mesh",
    mesh: {
      name: "Tetra",
      components: [
        {
          shape: "mesh",
          color: "#ff8800",
          verticesMm: [
            [0, 0, 0],
            [100, 0, 0],
            [0, 100, 0],
            [0, 0, 100],
          ],
          faces: [
            [0, 2, 1],
            [0, 1, 3],
            [0, 3, 2],
            [1, 2, 3],
            [99, 0, 1],
          ],
        },
      ],
    },
  });
  assert.equal(action.mesh.components[0].faces.length, 4);
  const geometry = buildAiMeshGeometry(action.mesh);
  assert.equal(geometry.triangleCount, 4);
  assert.deepEqual(geometry.dimensionsMm, { x: 100, y: 100, z: 100 });
});

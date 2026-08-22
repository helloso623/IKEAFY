import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMeshGeometry, finishModelSnapshot } from "../client/src/model-finish.js";

function roundPedestalPoints() {
  const values = [];
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    values.push(Math.cos(angle), 1, Math.sin(angle));
    values.push(Math.cos(angle) * 0.14, 0.5, Math.sin(angle) * 0.14);
    values.push(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
  }
  return new Float32Array(values);
}

test("local triangle analysis identifies a round top and central pedestal", () => {
  const analysis = analyzeMeshGeometry(roundPedestalPoints(), { x: 900, y: 900, z: 740 });
  assert.equal(analysis.source, "local-triangle-analysis");
  assert.match(analysis.geometryFingerprint, /^mesh-[0-9a-f]{8}-72$/);
  assert.equal(analysis.topShape, "round");
  assert.equal(analysis.supportStyle, "central");
  assert.equal(analysis.silhouette, "round-pedestal");
  assert.ok(analysis.topRoundness > 0.9);
});

test("finish snapshot sends shape and finish traits, not triangle data", () => {
  const snapshot = finishModelSnapshot(
    [
      {
        piece: { id: "ai-1", partId: "ai-mesh", generated: true, color: "#a06030", x: 0, y: 0.37, z: 0 },
        part: { name: "Round pedestal", dimsMm: { x: 900, y: 900, z: 740 } },
        positions: roundPedestalPoints(),
      },
    ],
    () => ({ color: "#a06030", texture: "wood", roughness: 0.45, metalness: 0.35 }),
  );
  assert.equal(snapshot[0].shape, "round-pedestal-table");
  assert.equal(snapshot[0].material.texture, "wood");
  assert.equal(snapshot[0].material.metalness, 0.35);
  assert.equal(snapshot[0].geometryAnalysis.supportStyle, "central");
  assert.equal("positions" in snapshot[0], false);
});

test("the local fingerprint changes when geometry changes inside the same bounds", () => {
  const original = roundPedestalPoints();
  const edited = new Float32Array(original);
  edited[4] += 0.05;
  const before = analyzeMeshGeometry(original, { x: 900, y: 900, z: 740 });
  const after = analyzeMeshGeometry(edited, { x: 900, y: 900, z: 740 });
  assert.notEqual(before.geometryFingerprint, after.geometryFingerprint);
});

test("finish snapshot keys DIY research to edited mesh bounds, scale, and rotation", () => {
  const snapshot = finishModelSnapshot([
    {
      piece: {
        id: "mesh-rotated",
        partId: "ai-mesh",
        generated: true,
        sx: 1.5,
        sy: 0.5,
        sz: 2,
        rx: 0.1,
        ry: Math.PI / 2,
        rz: -0.2,
      },
      part: { name: "Edited mesh", dimsMm: { x: 800, y: 400, z: 600 } },
      positions: roundPedestalPoints(),
    },
  ]);

  assert.deepEqual(snapshot[0].dimsMm, { x: 1200, y: 800, z: 300 });
  assert.deepEqual(snapshot[0].rotationRad, { x: 0.1, y: Math.PI / 2, z: -0.2 });
  assert.match(snapshot[0].geometryAnalysis.geometryFingerprint, /^mesh-/);
});

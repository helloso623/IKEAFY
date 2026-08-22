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
    () => ({ color: "#a06030", texture: "wood", roughness: 0.45 }),
  );
  assert.equal(snapshot[0].shape, "round-pedestal-table");
  assert.equal(snapshot[0].material.texture, "wood");
  assert.equal(snapshot[0].geometryAnalysis.supportStyle, "central");
  assert.equal("positions" in snapshot[0], false);
});

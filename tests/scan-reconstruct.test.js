import { test } from "node:test";
import assert from "node:assert/strict";

import {
  carveVisualHull,
  meshVisualHull,
  silhouetteFromImageData,
} from "../client/src/scan-reconstruct.js";

function cubeView(size = 64) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const cube = x >= 16 && x < 48 && y >= 16 && y < 48;
      const value = cube ? 24 : 242;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

test("three synthetic cube views reconstruct a metric triangle mesh", () => {
  const masks = {
    front: silhouetteFromImageData(cubeView()),
    side: silhouetteFromImageData(cubeView()),
    top: silhouetteFromImageData(cubeView()),
  };
  const hull = carveVisualHull(masks, {
    resolution: 18,
    scaleMm: 300,
    scaleKind: "length",
  });
  const mesh = meshVisualHull(hull);

  assert.equal(hull.voxelCount, 18 ** 3);
  assert.deepEqual(hull.dimensionsMm, { x: 300, y: 300, z: 300 });
  assert.equal(mesh.polygonizer, "isosurface.marchingTetrahedra");
  assert.ok(mesh.triangleCount > 12);
  assert.equal(mesh.positions.length, mesh.triangleCount * 9);

  for (const value of mesh.positions) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= -0.151 && value <= 0.151, `cube vertex ${value} is outside its 300 mm bounds`);
  }
});

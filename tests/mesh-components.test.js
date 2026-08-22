import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildComponentDrawChain,
  buildWeldedTopology,
  componentMode,
  scaleComponentVertices,
  subdivideTriangleAttributes,
  updateComponentSelection,
} from "../client/src/mesh-components.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const square = new Float32Array([
  0, 0, 0, 2, 0, 0, 2, 2, 0,
  0, 0, 0, 2, 2, 0, 0, 2, 0,
]);
const attributes = (positions = square) => ({
  position: { array: positions, itemSize: 3 },
});

test("component modes are mutually exclusive normalized views", () => {
  assert.equal(componentMode("vertex"), "vertex");
  assert.equal(componentMode("edge"), "edge");
  assert.equal(componentMode("face"), "face");
  assert.equal(componentMode("object"), null);
});

test("component selection replaces, shift-toggles, and clears on empty click", () => {
  let selected = updateComponentSelection([], "v:0");
  assert.deepEqual([...selected], ["v:0"]);
  selected = updateComponentSelection(selected, "v:1", { shiftKey: true });
  assert.deepEqual([...selected], ["v:0", "v:1"]);
  selected = updateComponentSelection(selected, "v:0", { shiftKey: true });
  assert.deepEqual([...selected], ["v:1"]);
  selected = updateComponentSelection(selected, null, { empty: true, shiftKey: true });
  assert.deepEqual([...selected], []);
});

test("point drawing adds vertices, chains edges, and closes a triangle fan", () => {
  const points = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 2, 0],
    [0, 2, 0],
  ];
  const open = buildComponentDrawChain(points);
  assert.equal(open.points.length, 4);
  assert.deepEqual(open.edges, [[0, 1], [1, 2], [2, 3]]);
  assert.deepEqual(open.faces, []);

  const closed = buildComponentDrawChain(points, { closed: true });
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.edges.at(-1), [3, 0]);
  assert.deepEqual(closed.faces, [[0, 1, 2], [0, 2, 3]]);
});

test("welded topology exposes shared vertices, edges, and triangle faces", () => {
  const topology = buildWeldedTopology(square);
  assert.equal(topology.vertices.length, 4);
  assert.equal(topology.edges.length, 5);
  assert.equal(topology.faces.length, 2);
  assert.deepEqual(topology.edgeById.get("e:0:2").faces, [0, 1]);
});

test("subdivide targets selected faces or edges and otherwise uses the whole mesh", () => {
  const face = subdivideTriangleAttributes(attributes(), {
    mode: "face",
    selection: ["f:0"],
  });
  assert.equal(face.scope, "selection");
  assert.equal(face.beforeFaces, 2);
  assert.equal(face.afterFaces, 6, "the neighbor also splits along the shared welded edge");

  const edge = subdivideTriangleAttributes(attributes(), {
    mode: "edge",
    selection: ["e:0:2"],
  });
  assert.equal(edge.scope, "selection");
  assert.equal(edge.afterFaces, 4);
  const splitTopology = buildWeldedTopology(edge.attributes.position.array);
  assert.equal(splitTopology.vertices.length, 5);
  const midpoint = splitTopology.vertices.find((vertex) => vertex.position[0] === 1 && vertex.position[1] === 1);
  assert.equal(midpoint.indices.length, 4, "both sides reuse the same welded midpoint");

  const whole = subdivideTriangleAttributes(attributes(), {
    mode: "edge",
    selection: [],
  });
  assert.equal(whole.scope, "all");
  assert.equal(whole.afterFaces, 8);

  const verticesStillMeanWhole = subdivideTriangleAttributes(attributes(), {
    mode: "vertex",
    selection: ["v:0"],
  });
  assert.equal(verticesStillMeanWhole.scope, "all");
  assert.equal(verticesStillMeanWhole.afterFaces, 8);
});

test("scale edits selected welded vertices and resolves empty selection to object scale", () => {
  const topology = buildWeldedTopology(square);
  const component = scaleComponentVertices(square, topology, "edge", ["e:0:1"], 0.5);
  assert.equal(component.scope, "components");
  assert.equal(component.vertexCount, 2);
  assert.equal(component.positions[0], 0.5);
  assert.equal(component.positions[9], 0.5, "the duplicate corner moves with its welded mate");
  assert.equal(component.positions[3], 1.5);
  assert.equal(component.positions[6], 2, "untargeted vertices stay put");

  const object = scaleComponentVertices(square, topology, "face", [], 0.5);
  assert.equal(object.scope, "object");
  assert.equal(object.changed, false);
  assert.deepEqual([...object.positions], [...square]);
});

// NOTE: the vertex/edge/face toolbar UI and the checkpoint-based undo wiring
// for it are not yet integrated into this branch's simplified main.js/index.html
// (Dylan header + intro/bench/upload flow). The pure mesh-components.js logic
// above is still exercised directly; the UI-wiring tests will come back once
// that toolbar is ported over.

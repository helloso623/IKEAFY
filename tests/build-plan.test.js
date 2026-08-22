import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPlanSource,
  hardwareBomForProject,
  matchIkeaArticle,
  modelComponents,
  modelSignature,
} from "../server/lib/build-plan.js";
import { addPiece, appendDiyBuild, emptyProject } from "../server/lib/project.js";

test("the DIY BOM follows the current scaled table dimensions and searches hardware by size", () => {
  const project = emptyProject();
  project.name = "Changed table";
  const top = addPiece(project, "lack-top", { x: 0, y: 0.72, z: 0, sx: 1.4, sz: 1.1 });
  top.sy = 1;
  for (const [x, z] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ]) {
    addPiece(project, "lack-leg", { x, y: 0.35, z });
  }
  const bom = hardwareBomForProject(project);
  assert.equal(bom.ok, true);
  assert.equal(bom.modelDimensionsMm.x, 770);
  assert.ok(bom.modelSignature.startsWith("model-"));
  assert.ok(bom.lines.every((line) => line.searchQuery.includes(line.dimensions)));
  assert.match(buildPlanSource(bom), /Changed table/);
});

test("model signatures change with dimensions and old DIY revisions remain in history", () => {
  const component = {
    pieceId: "p1",
    partId: "lack-top",
    dimsMm: { x: 550, y: 550, z: 50 },
    poseM: { x: 0, y: 0.4, z: 0 },
  };
  const first = modelSignature([component]);
  const changed = modelSignature([{ ...component, dimsMm: { ...component.dimsMm, x: 700 } }]);
  assert.notEqual(first, changed);

  const project = emptyProject();
  appendDiyBuild(project, { id: "old", signature: first, bom: { lines: [{ id: "a" }] } });
  appendDiyBuild(project, { id: "current", signature: changed, bom: { lines: [{ id: "b" }] } });
  assert.deepEqual(project.diyHistory.map((entry) => entry.id), ["old", "current"]);
  assert.equal(project.diyHistory[0].bom.lines[0].id, "a");
});

function piece(partId, id, scale = {}) {
  return { id, partId, sx: 1, sy: 1, sz: 1, ...scale };
}

test("finished LACK-sized model gets hardware, not a wood shopping list", () => {
  const project = { name: "My side table", pieces: [piece("generic-side-table", "table-1")], joints: [] };
  const bom = hardwareBomForProject(project);
  assert.equal(bom.ok, true);
  assert.equal(bom.ikeaMatch.article, "304.499.08");
  assert.equal(bom.lines.some((line) => line.id === "m6-machine-screw"), true);
  assert.equal(bom.lines.some((line) => /wood|particleboard/i.test(line.material)), false);
  assert.equal(bom.lines.some((line) => line.sources.some((source) => /mcmaster\.com/.test(source.url))), true);
});

test("custom top and posts produce dimension-sized mounting hardware", () => {
  const project = {
    name: "Narrow console",
    pieces: [
      piece("generic-shelf-board", "top", { sx: 1.5 }),
      piece("dowel-18", "leg-1"),
      piece("dowel-18", "leg-2"),
      piece("dowel-18", "leg-3"),
      piece("dowel-18", "leg-4"),
    ],
    joints: [],
  };
  const bom = hardwareBomForProject(project);
  assert.equal(bom.profile.tableLike, true);
  assert.equal(bom.ikeaMatch, null);
  assert.equal(bom.lines.find((line) => line.id === "table-leg-plate").qty, 4);
  assert.match(bom.lines.find((line) => line.id === "wood-screw").dimensions, /11|12/);
  assert.equal(bom.lines.some((line) => /board|dowel/i.test(line.name)), false);
});

test("IKEA article is only emitted for a close dimension match", () => {
  const exact = modelComponents({
    pieces: [piece("linmon-top", "top"), ...Array.from({ length: 4 }, (_, i) => piece("adils-leg", `leg-${i}`))],
  });
  assert.equal(matchIkeaArticle(exact).article, "299.321.81");

  const scaled = modelComponents({
    pieces: [piece("linmon-top", "top", { sx: 0.8 }), ...Array.from({ length: 4 }, (_, i) => piece("adils-leg", `leg-${i}`))],
  });
  assert.equal(matchIkeaArticle(scaled), null);
});

test("build packet source is numbered for the IKEAlive parser", () => {
  const bom = hardwareBomForProject({ name: "Shelf", pieces: [piece("generic-shelf-board", "shelf")], joints: [] });
  const source = buildPlanSource(bom);
  assert.match(source, /Wood is intentionally excluded/);
  assert.match(source, /^1\. Print or save/m);
  assert.match(source, /^5\. Check level/m);
});

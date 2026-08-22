import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWaysForProject,
  buildPlanSource,
  matchIkeaArticle,
  modelComponents,
  modelSignature,
} from "../server/lib/build-plan.js";
import { addPiece, appendDiyBuild, emptyProject } from "../server/lib/project.js";

function piece(partId, id, scale = {}) {
  return { id, partId, sx: 1, sy: 1, sz: 1, ...scale };
}

test("ways-to-make plan follows the current scaled table dimensions", () => {
  const project = emptyProject();
  project.name = "Changed table";
  addPiece(project, "lack-top", { x: 0, y: 0.72, z: 0, sx: 1.4, sz: 1.1 });
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    addPiece(project, "lack-leg", { x, y: 0.35, z });
  }
  const plan = buildWaysForProject(project);
  assert.equal(plan.ok, true);
  assert.equal(plan.modelDimensionsMm.x, 770);
  assert.ok(plan.modelSignature.startsWith("model-"));
  assert.ok(plan.lines.every((line) => line.searchQuery.includes(line.dimensions)));
  assert.ok(plan.lines.some((line) => line.role === "top"));
  assert.ok(plan.lines.some((line) => line.role === "leg"));
  assert.ok(plan.ways.some((way) => way.recommended && way.joinery));
});

test("model signatures change and old ways remain in history", () => {
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
  appendDiyBuild(project, { id: "old", signature: first, bom: { lines: [{ id: "top-a" }] } });
  appendDiyBuild(project, { id: "current", signature: changed, bom: { lines: [{ id: "top-b" }] } });
  assert.deepEqual(project.diyHistory.map((entry) => entry.id), ["old", "current"]);
  assert.equal(project.diyHistory[0].bom.lines[0].id, "top-a");
});

test("LACK-sized model yields a tabletop and four legs, never a fastener list", () => {
  const plan = buildWaysForProject({
    name: "My side table",
    pieces: [piece("generic-side-table", "table-1")],
  });
  assert.equal(plan.ikeaMatch.article, "304.499.08");
  assert.deepEqual(plan.lines.map((line) => [line.role, line.qty]), [["top", 1], ["leg", 4]]);
  assert.ok(plan.lines.every((line) => line.category === "furniture-piece"));
  assert.equal(plan.lines.some((line) => /screw|bolt|fastener|mounting plate/i.test(line.name)), false);
  assert.equal(plan.lines.some((line) => line.sources.some((source) => /mcmaster/i.test(source.url))), false);
});

test("custom top and posts produce board and leg candidates by millimetres", () => {
  const plan = buildWaysForProject({
    name: "Narrow console",
    pieces: [
      piece("generic-shelf-board", "top", { sx: 1.5 }),
      piece("dowel-18", "leg-1"),
      piece("dowel-18", "leg-2"),
      piece("dowel-18", "leg-3"),
      piece("dowel-18", "leg-4"),
    ],
  });
  assert.equal(plan.profile.tableLike, true);
  assert.equal(plan.ikeaMatch, null);
  assert.equal(plan.lines.find((line) => line.role === "top").dimensions, "1200 × 250 × 18 mm");
  assert.equal(plan.lines.find((line) => line.role === "leg").qty, 4);
  assert.equal(plan.lines.find((line) => line.role === "leg").dimensions, "18 × 18 × 400 mm");
});

test("generic whole table also offers dimensioned apron and stretcher pieces", () => {
  const plan = buildWaysForProject({
    name: "Wide table",
    pieces: [piece("generic-side-table", "table", { sx: 1.3 })],
  });
  const apronRoute = plan.ways.find((way) => way.id === "apron-frame");
  assert.ok(apronRoute);
  assert.match(apronRoute.joinery, /mortise|dowel/i);
  assert.deepEqual(apronRoute.additionalCuts.map((line) => [line.role, line.qty]), [
    ["apron", 2],
    ["apron", 2],
  ]);
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

test("round pedestal model keeps the final circular and tapered shapes", () => {
  const plan = buildWaysForProject({
    name: "Round dining table",
    pieces: [piece("generic-round-pedestal-table", "round-1")],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.lines.map((line) => line.role), ["top", "pedestal", "base"]);
  assert.deepEqual(plan.lines.map((line) => line.shape), ["circular slab", "tapered cylinder", "circular slab"]);
  assert.ok(plan.ways.some((way) => way.id === "turned-pedestal"));
  assert.equal(plan.lines[0].dimsMm.x, 900);
});

test("ways-to-make source is numbered for the IKEAlive parser", () => {
  const plan = buildWaysForProject({
    name: "Shelf",
    pieces: [piece("generic-shelf-board", "shelf")],
  });
  const source = buildPlanSource(plan);
  assert.match(source, /Construction ways:/);
  assert.match(source, /cut list:/i);
  assert.doesNotMatch(source, /M6|wood screw|mounting plate/i);
  assert.match(source, /^1\. Freeze this model revision/m);
  assert.match(source, /^6\. Turn the table upright/m);
});

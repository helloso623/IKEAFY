import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanSource,
  matchIkeaArticle,
  modelComponents,
  modelSignature,
  pieceBomForProject,
} from "../server/lib/build-plan.js";
import { addPiece, appendDiyBuild, emptyProject } from "../server/lib/project.js";

function piece(partId, id, scale = {}) {
  return { id, partId, sx: 1, sy: 1, sz: 1, ...scale };
}

test("piece hunt follows the current scaled table dimensions", () => {
  const project = emptyProject();
  project.name = "Changed table";
  addPiece(project, "lack-top", { x: 0, y: 0.72, z: 0, sx: 1.4, sz: 1.1 });
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    addPiece(project, "lack-leg", { x, y: 0.35, z });
  }
  const plan = pieceBomForProject(project);
  assert.equal(plan.ok, true);
  assert.equal(plan.modelDimensionsMm.x, 770);
  assert.ok(plan.modelSignature.startsWith("model-"));
  assert.ok(plan.lines.every((line) => line.searchQuery.includes(line.dimensions)));
  assert.ok(plan.lines.some((line) => line.role === "top"));
  assert.ok(plan.lines.some((line) => line.role === "leg"));
  assert.ok(plan.hardwareLines.some((line) => /mounting plate/i.test(line.name)));
  assert.ok(plan.ways.some((way) => way.recommended && way.joinery));
  assert.ok(plan.similarityScore >= 90);
  assert.equal(plan.ways[0].similarity.dimensions, 100);
});

test("model signatures change and old piece plans remain in history", () => {
  const component = {
    pieceId: "p1",
    partId: "lack-top",
    dimsMm: { x: 550, y: 550, z: 50 },
    poseM: { x: 0, y: 0.4, z: 0 },
  };
  const first = modelSignature([component]);
  const changed = modelSignature([{ ...component, dimsMm: { ...component.dimsMm, x: 700 } }]);
  assert.notEqual(first, changed);
  const reshaped = modelSignature([
    {
      ...component,
      finish: { texture: "wood", roughness: 0.45, metalness: 0 },
      geometryAnalysis: { geometryFingerprint: "mesh-edited", silhouette: "rectilinear" },
    },
  ]);
  assert.notEqual(first, reshaped);

  const project = emptyProject();
  appendDiyBuild(project, { id: "old", signature: first, bom: { lines: [{ id: "top-a" }] } });
  appendDiyBuild(project, { id: "current", signature: changed, bom: { lines: [{ id: "top-b" }] } });
  assert.deepEqual(project.diyHistory.map((entry) => entry.id), ["old", "current"]);
  assert.equal(project.diyHistory[0].bom.lines[0].id, "top-a");
});

test("a generated rectangular table becomes a top-and-leg cut list with connection hardware", () => {
  const plan = pieceBomForProject(
    { name: "Current modeled object", pieces: [] },
    {
      model: [
        {
          id: "ai-table",
          partId: "ai-mesh",
          name: "Custom table",
          shape: "generated-mesh",
          dimsMm: { x: 1200, y: 700, z: 740 },
          material: { texture: "wood", roughness: 0.5, metalness: 0 },
          geometryAnalysis: {
            geometryFingerprint: "mesh-table-a",
            topShape: "rectangular",
            supportStyle: "distributed",
            silhouette: "rectilinear",
          },
        },
      ],
    },
  );
  assert.equal(plan.profile.tableLike, true);
  assert.deepEqual(plan.cutList.map((line) => [line.role, line.qty]), [["top", 1], ["leg", 4]]);
  assert.equal(plan.ways[0].id, "top-and-ready-legs");
  assert.ok(plan.hardwareLines.some((line) => /mounting plate/i.test(line.name)));
  assert.ok(plan.hardwareLines.some((line) => /screw/i.test(line.name)));
});

test("LACK-sized model yields a tabletop, legs, and a separate hardware list", () => {
  const plan = pieceBomForProject({
    name: "My side table",
    pieces: [piece("generic-side-table", "table-1")],
  });
  assert.equal(plan.ikeaMatch.article, "304.499.08");
  assert.deepEqual(plan.cutList.map((line) => [line.role, line.qty]), [["top", 1], ["leg", 4]]);
  assert.ok(plan.cutList.every((line) => line.category === "furniture-piece"));
  assert.ok(plan.hardwareLines.length >= 2);
  assert.ok(plan.lines.some((line) => /screw|bolt|fastener|mounting plate/i.test(line.name)));
  assert.equal(plan.lines.some((line) => line.sources.some((source) => /mcmaster/i.test(source.url))), false);
});

test("custom top and posts produce board and leg candidates by millimetres", () => {
  const plan = pieceBomForProject({
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
  assert.equal(plan.cutList.find((line) => line.role === "top").dimensions, "1200 × 250 × 18 mm");
  assert.equal(plan.cutList.find((line) => line.role === "leg").qty, 4);
  assert.equal(plan.cutList.find((line) => line.role === "leg").dimensions, "18 × 18 × 400 mm");
});

test("generic whole table also offers dimensioned apron and stretcher pieces", () => {
  const plan = pieceBomForProject({
    name: "Wide table",
    pieces: [piece("generic-side-table", "table", { sx: 1.3 })],
  });
  const apronRoute = plan.ways.find((way) => way.id === "apron-frame");
  assert.ok(apronRoute);
  assert.match(apronRoute.joinery, /mortise|dowel/i);
  assert.deepEqual(apronRoute.additionalPieces.map((line) => [line.role, line.qty]), [
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
  const plan = pieceBomForProject({
    name: "Round dining table",
    pieces: [piece("generic-round-pedestal-table", "round-1")],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.cutList.map((line) => line.role), ["top", "pedestal", "base"]);
  assert.deepEqual(plan.cutList.map((line) => line.shape), ["circular slab", "tapered cylinder", "circular slab"]);
  assert.ok(plan.ways.some((way) => way.id === "turned-pedestal"));
  assert.equal(plan.cutList[0].dimsMm.x, 900);
  assert.ok(plan.hardwareLines.some((line) => /pedestal mounting plate/i.test(line.name)));
  assert.ok(plan.hardwareLines.some((line) => /bolt/i.test(line.name)));
  assert.equal(plan.profile.topShape, "round");
  assert.equal(plan.profile.supportStyle, "central");
  assert.ok(plan.similarityScore >= 95);
  assert.equal(plan.ways[0].id, "turned-pedestal");
  assert.equal(plan.ways[0].similarity.silhouette, 100);
});

test("a LACK-sized round pedestal mesh is not mislabeled as a square four-leg LACK", () => {
  const plan = pieceBomForProject(
    { name: "Edited round object", pieces: [] },
    {
      model: [
        {
          id: "mesh-round",
          name: "Edited pedestal mesh",
          shape: "generated-mesh",
          dimsMm: { x: 550, y: 550, z: 450 },
          material: { texture: "wood", roughness: 0.55, metalness: 0 },
          geometryAnalysis: {
            source: "local-triangle-analysis",
            topShape: "round",
            supportStyle: "central",
            silhouette: "round-pedestal",
          },
        },
      ],
    },
  );
  assert.equal(plan.ikeaMatch, null);
  assert.deepEqual(plan.cutList.map((line) => line.shape), ["circular slab", "tapered cylinder", "circular slab"]);
  assert.equal(plan.ways[0].id, "turned-pedestal");
  assert.ok(plan.ways[0].similarity.score > 90);
  assert.equal(plan.ways.some((way) => /LACK/.test(way.title)), false);
});

test("rotating the current mesh changes its envelope and DIY signature", () => {
  const model = {
    id: "rotated-top",
    name: "Custom table",
    shape: "generated-mesh",
    dimsMm: { x: 1200, y: 600, z: 30 },
    poseM: { x: 0, y: 0.015, z: 0 },
    geometryAnalysis: { geometryFingerprint: "mesh-rotation-test", silhouette: "rectilinear" },
  };
  const unrotated = pieceBomForProject({ name: "Rotation test", pieces: [] }, { model: [model] });
  const rotated = pieceBomForProject(
    { name: "Rotation test", pieces: [] },
    { model: [{ ...model, rotationRad: { x: 0, y: Math.PI / 2, z: 0 } }] },
  );

  assert.deepEqual(unrotated.modelDimensionsMm, { x: 1200, y: 600, z: 30 });
  assert.deepEqual(rotated.modelDimensionsMm, { x: 600, y: 1200, z: 30 });
  assert.notEqual(rotated.modelSignature, unrotated.modelSignature);
});

test("piece-plan source is numbered for the IKEAlive parser", () => {
  const plan = pieceBomForProject({
    name: "Shelf",
    pieces: [piece("generic-shelf-board", "shelf")],
  });
  const source = buildPlanSource(plan);
  assert.match(source, /^DIY Plan — Shelf/m);
  assert.match(source, /Recommended method:.*visual match/);
  assert.match(source, /COMPONENTS TO BUY/);
  assert.match(source, /Estimated component total: \$\d+\.\d{2} USD/);
  assert.match(source, /BUILD METHOD/);
  assert.match(source, /NUMBERED STEPS/);
  assert.match(source, /shelf support brackets/i);
  assert.match(source, /^1\. Check the saved model/m);
  assert.match(source, /^8\. Compare the finished object/m);
  assert.doesNotMatch(source, /Build scope:|Geometry-derived pieces:/);
});

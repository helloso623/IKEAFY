import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanSource,
  hardwareBomForProject,
  matchIkeaArticle,
  modelComponents,
} from "../server/lib/build-plan.js";

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

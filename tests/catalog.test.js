import { test } from "node:test";
import assert from "node:assert/strict";
import { bomFromIds, cheaperAlternatives, searchParts } from "../server/lib/catalog.js";

test("cost barrier filters the list", () => {
  const cheap = searchParts({ maxCost: 3 });
  assert.ok(cheap.every((p) => p.cost <= 3));
  assert.ok(cheap.some((p) => p.id === "led-5mm"));
});

test("min specs keep load-bearing tops", () => {
  const hits = searchParts({ minSpecs: { loadKg: 20 }, category: "furniture" });
  assert.ok(hits.every((p) => p.specs.loadKg >= 20));
});

test("BOM splits kit vs extra", () => {
  const bom = bomFromIds(["lack-top", "lack-leg", "screwdriver", "allen-key"]);
  assert.ok(bom.included.some((l) => l.id === "allen-key"));
  assert.ok(bom.extra.some((l) => l.id === "screwdriver"));
});

test("cheaper pine stands in for a LACK top", () => {
  const alts = cheaperAlternatives("lack-top");
  assert.ok(alts.some((p) => p.id === "pine-offcut"));
});

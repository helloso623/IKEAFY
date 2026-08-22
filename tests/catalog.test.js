import { test } from "node:test";
import assert from "node:assert/strict";
import { bomFromIds, cheaperAlternatives, retailerOffers, searchParts } from "../server/lib/catalog.js";

test("token search finds a LACK table from “lack table”", () => {
  const hits = searchParts({ query: "lack table" });
  assert.ok(hits.some((p) => p.id === "lack-table"));
});

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
  const extra = bom.extra.find((l) => l.id === "screwdriver");
  assert.equal(extra.badge, "to purchase");
  assert.ok(extra.retailers.some((o) => o.store === "Amazon"));
  assert.ok(extra.retailers.some((o) => o.store === "IKEA"));
  assert.equal(bom.included.find((l) => l.id === "allen-key").badge, "included");
});

test("Tavily stand-in returns several shops for a part to purchase", () => {
  const { offers, partner } = retailerOffers(searchParts({ query: "screwdriver" })[0]);
  assert.equal(partner, "tavily-standin");
  assert.ok(offers.length >= 2);
  assert.ok(offers.some((o) => o.store === "Amazon" && o.url));
});

test("cheaper pine stands in for a LACK top", () => {
  const alts = cheaperAlternatives("lack-top");
  assert.ok(alts.some((p) => p.id === "pine-offcut"));
});

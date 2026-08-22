import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bomFromIds,
  cheaperAlternatives,
  filterLabCatalog,
  fitsDims,
  getPart,
  isElectronicsQuery,
  isLabShelfPart,
  labShelfParts,
  retailerOffers,
  searchParts,
} from "../server/lib/catalog.js";

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

test("dims filter keeps pieces that fit the scanned envelope", () => {
  const hits = searchParts({ dimsMm: { x: 550, y: 550 }, category: "furniture" });
  assert.ok(hits.some((p) => p.id === "lack-table"));
  assert.ok(hits.some((p) => p.id === "lack-top"));
  assert.ok(hits.some((p) => p.id === "pine-offcut"));
  assert.equal(hits.some((p) => p.id === "linmon-top"), false);
  assert.ok(hits.every((p) => fitsDims(p, { x: 550, y: 550 })));
});

test("the Lab shelf keeps furniture, hardware, tape, and hand tools", () => {
  const shelf = labShelfParts();
  const ids = shelf.map((p) => p.id);
  for (const keep of [
    "lack-table",
    "generic-side-table",
    "lack-top",
    "lack-leg",
    "linmon-top",
    "adils-leg",
    "pine-offcut",
    "dowel-18",
    "m6-screw",
    "allen-key",
    "screwdriver",
    "tape-electrical",
    "tape-gaffer",
    "tape-packing",
    "zip-tie",
  ]) {
    assert.ok(ids.includes(keep), `${keep} belongs on the Lab shelf`);
  }
  for (const drop of [
    "arduino-nano",
    "esp32-dev",
    "led-5mm",
    "ws2812-strip",
    "tactile-btn",
    "breadboard",
    "resistor-220",
    "psu-5v2a",
    "jumper-m2m",
    "usb-mini-cable",
    "soldering-iron",
    "multimeter",
    "enclosure-print",
  ]) {
    assert.equal(ids.includes(drop), false, `${drop} stays off the Lab shelf`);
    assert.equal(isLabShelfPart(getPart(drop)), false);
  }
  assert.ok(shelf.every(isLabShelfPart));
  assert.equal(
    shelf.some((p) => p.category === "electronics" || p.category === "cable"),
    false,
  );
});

test("electronics stay off the default Lab catalog until you search or toggle", () => {
  const closed = filterLabCatalog(searchParts({}));
  assert.equal(closed.some((p) => p.id === "arduino-nano" || p.id === "led-5mm"), false);
  assert.equal(closed.some((p) => p.category === "electronics"), false);
  assert.ok(closed.some((p) => p.id === "lack-table"));

  for (const query of ["arduino", "led", "nano", "esp", "resistor", "breadboard", "jumper", "solder"]) {
    assert.equal(isElectronicsQuery(query), true, `${query} should open electronics`);
    const hits = filterLabCatalog(searchParts({ query }), { query });
    assert.ok(hits.length, `${query} should return catalog matches`);
    assert.ok(
      hits.some((p) => !isLabShelfPart(p)),
      `${query} should surface a hidden electronics/hardware match`,
    );
  }
  assert.equal(isElectronicsQuery("table"), false);
  assert.equal(isElectronicsQuery(""), false);
  const tables = filterLabCatalog(searchParts({ query: "table" }), { query: "table" });
  assert.equal(tables.some((p) => p.category === "electronics"), false);

  const opened = filterLabCatalog(searchParts({}), { showElectronics: true });
  assert.ok(opened.some((p) => p.id === "arduino-nano"));
  assert.ok(opened.some((p) => p.id === "led-5mm"));
});

test("a LACK table fits a 550 mm footprint and not a 400 mm one", () => {
  const table = searchParts({ query: "lack table" }).find((p) => p.id === "lack-table");
  assert.ok(fitsDims(table, { x: 550, y: 550 }));
  assert.equal(fitsDims(table, { x: 400, y: 400 }), false);
});

test("the generic test table is an IKEA-vibe 550 × 550 × 450 mm stand-in", () => {
  const table = getPart("generic-side-table");
  assert.equal(table.shape, "table");
  assert.deepEqual(table.dimsMm, { x: 550, y: 550, z: 450 });
  assert.match(table.note, /specs needed for an exact IKEA article/i);
  assert.equal(table.ikeaArticle, null);
  assert.notEqual(String(table.color).toLowerCase(), "#808080");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { getPart } from "../server/lib/catalog.js";
import { runSuite, strengthTest, tapeHold, weatherTest } from "../server/lib/physics.js";

test("strength finds a finite breaking point", () => {
  const top = getPart("lack-top");
  const r = strengthTest(top, { forceN: 50 });
  assert.equal(r.cracked, false);
  assert.ok(r.breakingPointN > 100);
});

test("weather flags rain on bare electronics", () => {
  const nano = getPart("arduino-nano");
  const wet = weatherTest(nano, { tempC: 22, rain: true, tapeSeal: 0 });
  assert.equal(wet.failed, true);
  assert.ok(wet.issues.includes("rain short risk"));
});

test("gaffer holds more than packing tape", () => {
  const gaff = tapeHold(getPart("tape-gaffer"), { areaMm2: 400, loadN: 20 });
  const pack = tapeHold(getPart("tape-packing"), { areaMm2: 400, loadN: 20 });
  assert.equal(gaff.holds, true);
  assert.equal(pack.holds, false);
});

test("suite can fail heat on PLA", () => {
  const box = getPart("enclosure-print");
  const r = runSuite(box, null, { tempC: 70 });
  assert.ok(r.failed.includes("weather"));
});

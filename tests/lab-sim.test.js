import { test } from "node:test";
import assert from "node:assert/strict";
import { getPart } from "../server/lib/catalog.js";
import { stackSim } from "../server/lib/physics.js";

const bench = [
  { piece: { id: "p-top", functionLabel: null }, part: getPart("lack-top") },
  { piece: { id: "p-led", functionLabel: "light" }, part: getPart("led-5mm") },
  { piece: { id: "p-btn", functionLabel: "sense" }, part: getPart("tactile-btn") },
];

test("stacks only the toggled tests over every piece", () => {
  const r = stackSim(bench, getPart("tape-gaffer"), { strength: true, rain: true });
  assert.deepEqual([...r.stacked].sort(), ["strength", "weather"]);
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((row) => row.tests.strength && row.tests.weather && !row.tests.aero));
});

test("defaults to strength when nothing is toggled", () => {
  const r = stackSim(bench, null, {});
  assert.deepEqual(r.stacked, ["strength"]);
});

test("function graph: LED blinks when a piece is labeled light", () => {
  const dry = stackSim(bench, null, { strength: true });
  assert.equal(dry.led.blink, true);
  assert.deepEqual(dry.functions.light, ["p-led"]);
  assert.deepEqual(dry.functions.sense, ["p-btn"]);
});

test("no light label means nothing to blink", () => {
  const r = stackSim([bench[0]], null, { strength: true });
  assert.equal(r.led.lights, 0);
  assert.equal(r.led.blink, false);
});

test("rain shorts the bare light and stops the blink", () => {
  const wet = stackSim(bench, null, { rain: true });
  assert.equal(wet.led.blink, false);
  assert.ok(wet.failures.some((f) => f.pieceId === "p-led" && f.kind === "weather"));
});

test("tape stacks onto strength and raises the safety factor", () => {
  const bare = stackSim([bench[0]], null, { strength: true });
  const taped = stackSim([bench[0]], getPart("tape-gaffer"), { strength: true, tape: true });
  assert.equal(taped.rows[0].tests.tape.holds, true);
  assert.ok(
    taped.rows[0].tests.strength.safetyFactor > bare.rows[0].tests.strength.safetyFactor,
  );
});

test("heat chip cooks the PLA enclosure", () => {
  const r = stackSim(
    [{ piece: { id: "p-enc", functionLabel: null }, part: getPart("enclosure-print") }],
    null,
    { heat: true },
  );
  assert.equal(r.tempC, 60);
  assert.ok(r.rows[0].tests.weather.issues.includes("heat sag"));
});

test("empty bench reports politely", () => {
  const r = stackSim([], null, { strength: true });
  assert.equal(r.ok, true);
  assert.match(r.note, /Nothing on the bench/);
});

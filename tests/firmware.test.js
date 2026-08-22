import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSketch, runSketch, sketchFromFunctions } from "../server/lib/firmware.js";

test("generated sketch blinks D13", () => {
  const src = sketchFromFunctions(["light"]);
  const info = analyzeSketch(src);
  assert.equal(info.hasLoop, true);
  assert.ok(info.pins.includes(13));
  const run = runSketch(src);
  assert.ok(run.frames.some((f) => f.led));
  assert.equal(run.abstraction.kind, "firmware-binary");
});

test("button sketch lights when pressed", () => {
  const src = sketchFromFunctions(["light", "sense"]);
  const down = runSketch(src, { buttonDown: true });
  assert.ok(down.frames.every((f) => f.led));
});

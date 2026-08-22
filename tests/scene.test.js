import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide, scenePlanForStep, storyboardForStep } from "../server/lib/ikeafy.js";
import { startAssembly } from "../server/lib/assembly.js";

const RAW = `LACK side table
1. Unpack the table top and four legs.
2. Place the table top face down on a rug.
3. Line up each leg with a corner insert.
4. Screw each leg with the Allen key. Do not overtighten.
5. Flip the table upright.`;

test("scenePlanForStep drives the workshop with catalog parts and camera, not Seedance", () => {
  const guide = parseGuide(RAW);
  const plan = scenePlanForStep(guide, 4);
  assert.equal(plan.engine, "workshop");
  assert.equal(plan.number, 4);
  assert.ok(plan.parts.includes("lack-leg"));
  assert.deepEqual(plan.camera, storyboardForStep(guide, 4)[0].camera);
  assert.equal(plan.explode, 0);

  const later = scenePlanForStep(guide, 4, 2);
  assert.equal(later.camera.az, 35 + 2 * 12);
  assert.equal(later.camera.el, 28 - 2 * 2);
  assert.equal(later.explode, 0.16);
});

test("a scene-mode assembly outline ships partsUsed for the bench", () => {
  const started = startAssembly({ mode: "custom", guide: RAW, renderMode: "3d" });
  assert.equal(started.ok, true);
  assert.equal(started.run.renderMode, "scene");
  assert.ok(started.outline[3].partsUsed.includes("lack-leg"));
});

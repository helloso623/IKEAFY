import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachBroken,
  colorizePlate,
  expandStep,
  generateFix,
  makeVideoPlan,
  parseGuide,
} from "../server/lib/ikeafy.js";

const RAW = `LACK side table
1. Unpack the table top and four legs.
2. Place the table top face down on a rug.
3. Line up each leg with a corner insert.
4. Screw each leg with the Allen key. Do not overtighten.
5. Flip the table upright.`;

test("parses numbered steps into JSON", () => {
  const guide = parseGuide(RAW, {
    instructions: "Do not overtighten. I have an allen-key.",
    availableTools: ["allen-key"],
  });
  assert.equal(guide.steps.length, 5);
  assert.equal(guide.steps[3].action, "fasten");
  assert.equal(guide.steps[3].toolRequired, "allen-key");
  assert.ok(guide.steps[3].partsUsed.includes("lack-leg"));
  assert.ok(guide.steps[3].body.includes("Stop when the shoulder"));
});

test("video plan is one continuous theme and waits", () => {
  const guide = parseGuide(RAW);
  const film = makeVideoPlan(guide);
  assert.equal(film.continuous, true);
  assert.equal(film.theme.setting, "birch workshop");
  assert.ok(film.steps.every((s) => s.waitForUser && s.frames.length >= 3));
});

test("colorize uses catalog fills", () => {
  const guide = parseGuide(RAW);
  const plate = colorizePlate(guide.steps[0]);
  assert.equal(plate.to, "catalog-real");
  assert.ok(plate.fills.some((f) => f.color.startsWith("#")));
});

test("expand and broken part attach to a step", () => {
  const guide = parseGuide(RAW);
  const exp = expandStep(guide, 4, { stuckNote: "insert is spinning" });
  assert.match(exp.step.detail, /insert spinning|snug|Particleboard/i);
  const broken = attachBroken({ guide, stepNumber: 4, note: "corner insert ripped" });
  assert.equal(broken.ok, true);
  assert.ok(broken.spare.id);
  const fix = generateFix("r1");
  assert.match(fix.fix, /glue|M6/i);
});

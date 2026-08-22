import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ELECTRONICS_FUNCTIONS,
  PIECE_FUNCTIONS,
  electronicsFunctions,
  isPieceFunction,
  normalizeFunction,
  simulateBehavior,
  suggestFunction,
} from "../server/lib/functions.js";
import { getPart } from "../server/lib/catalog.js";
import {
  addPiece,
  emptyProject,
  labelFunction,
  seedLampTable,
} from "../server/lib/project.js";

test("the five piece jobs are support, light, sense, control, decorate", () => {
  assert.deepEqual(PIECE_FUNCTIONS, ["support", "light", "sense", "control", "decorate"]);
  assert.deepEqual(ELECTRONICS_FUNCTIONS, ["light", "sense", "control"]);
  assert.equal(isPieceFunction("support"), true);
  assert.equal(isPieceFunction("glow"), false);
  assert.equal(normalizeFunction("Light"), "light");
  assert.equal(normalizeFunction("nope"), null);
});

test("suggestFunction maps firmware roles and furniture", () => {
  assert.equal(suggestFunction(getPart("led-5mm")), "light");
  assert.equal(suggestFunction(getPart("tactile-btn")), "sense");
  assert.equal(suggestFunction(getPart("arduino-nano")), "control");
  assert.equal(suggestFunction(getPart("lack-leg")), "support");
  assert.equal(suggestFunction(getPart("lack-top")), "support");
});

test("labelFunction only stores a known job", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top");
  assert.equal(labelFunction(project, top.id, "support").functionLabel, "support");
  assert.equal(labelFunction(project, top.id, "glow").functionLabel, "support");
  assert.equal(labelFunction(project, top.id, "").functionLabel, null);
  assert.equal(labelFunction(project, "missing", "light"), null);
});

test("lamp table behavior suite notes the jobs and flashes firmware", () => {
  const project = seedLampTable();
  const result = simulateBehavior(project, { tempC: 22, rain: false });
  assert.ok(result.notes.some((n) => /Behavior:/.test(n)));
  assert.ok(result.notes.some((n) => /Support/.test(n)));
  assert.ok(result.notes.some((n) => /Light/.test(n)));
  assert.ok(result.notes.some((n) => /Firmware/.test(n)));
  assert.ok(result.firmware);
  assert.ok(result.functions.includes("light"));
  assert.ok(result.functions.includes("sense"));
  assert.ok(result.functions.includes("control"));
  assert.ok(result.firmware.frames.some((f) => "led" in f));
  assert.equal(electronicsFunctions(result.functions).length, 3);
});

test("furniture-only bench runs physics and skips the LED", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top");
  const leg = addPiece(project, "lack-leg");
  labelFunction(project, top.id, "support");
  labelFunction(project, leg.id, "support");
  const result = simulateBehavior(project);
  assert.equal(result.firmware, null);
  assert.deepEqual(result.functions, []);
  assert.ok(result.notes.some((n) => /Support/.test(n)));
  assert.ok(result.report.rows.length >= 2);
});

test("rain on electronics is called out in the behavior notes", () => {
  const project = seedLampTable();
  const result = simulateBehavior(project, { rain: true, tempC: 22 });
  assert.equal(result.ok, false);
  assert.ok(result.notes.some((n) => /rain/i.test(n)));
});

test("empty bench has a quiet note and no firmware", () => {
  const result = simulateBehavior(emptyProject());
  assert.equal(result.firmware, null);
  assert.match(result.notes[0], /Nothing on the bench/);
});

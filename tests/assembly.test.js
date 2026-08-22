import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  assemblyView,
  confirmStep,
  editStep,
  getAssembly,
  goBack,
  normalizeRenderMode,
  peekStep,
  resetAssemblies,
  setAssemblyRenderMode,
  skipStep,
  startAssembly,
  startAssemblyAsync,
  stuckOn,
} from "../server/lib/assembly.js";

const CUSTOM = `Shelf from an offcut
1. Cut the pine offcut to length.
2. Screw the dowels into the underside.
3. Tape the cable run along the back.`;

beforeEach(() => {
  resetAssemblies();
});

test("an official run starts locked on step 1 and hides what comes later", () => {
  const started = startAssembly({ mode: "official" });
  assert.equal(started.ok, true);
  assert.equal(started.run.locked, true);
  assert.equal(started.run.official, true);
  assert.equal(started.run.cursor, 1);
  assert.equal(started.run.canSkip, false);
  assert.equal(started.run.canEdit, false);

  const [firstStep, secondStep] = started.outline;
  assert.equal(firstStep.readable, true);
  assert.ok(firstStep.body);
  assert.equal(secondStep.readable, false);
  assert.equal(secondStep.body, null);
  assert.match(secondStep.preview, /opens when you confirm step 1/);
});

test("reading ahead in a locked run is refused, not served", () => {
  const { run } = startAssembly({ mode: "official" });
  const ahead = peekStep(run.id, run.total);
  assert.equal(ahead.ok, false);
  assert.equal(ahead.locked, true);
  assert.match(ahead.reason, /opens after you confirm step 1/);
  assert.equal(ahead.step, run.total);

  const here = peekStep(run.id, 1);
  assert.equal(here.ok, true);
  assert.ok(here.step.body);
  assert.ok(here.step.confirmPrompt);
});

test("an official step needs its acknowledgement and its turn", () => {
  const { run } = startAssembly({ mode: "official" });

  const unchecked = confirmStep(run.id, { step: 1 });
  assert.equal(unchecked.ok, false);
  assert.equal(unchecked.needsConfirmation, true);
  assert.ok(unchecked.confirmPrompt);

  const outOfOrder = confirmStep(run.id, { step: 3, checked: true });
  assert.equal(outOfOrder.ok, false);
  assert.equal(outOfOrder.outOfOrder, true);
  assert.equal(outOfOrder.cursor, 1);

  const confirmed = confirmStep(run.id, { step: 1, checked: true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.run.cursor, 2);
  assert.deepEqual(confirmed.run.confirmed, [1]);
  assert.equal(confirmed.outline[1].readable, true);
  assert.equal(confirmed.outline[2].readable, false);
});

test("official steps cannot be skipped or rewritten", () => {
  const { run } = startAssembly({ mode: "official" });

  const skipped = skipStep(run.id, 1);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.locked, true);
  assert.match(skipped.reason, /cannot be skipped/i);
  assert.match(skipped.alternative, /Stuck|fitting/i);

  const edited = editStep(run.id, 1, { body: "just wing it" });
  assert.equal(edited.ok, false);
  assert.equal(edited.locked, true);

  const view = assemblyView(run.id);
  assert.equal(view.run.cursor, 1);
  assert.equal(view.run.refusals, 2);
  assert.match(view.step.body, /Unpack|table top/i);
});

test("being stuck gives more detail and the free fittings, never a step forward", () => {
  const { run } = startAssembly({ mode: "official" });
  confirmStep(run.id, { step: 1, checked: true });
  confirmStep(run.id, { step: 2, checked: true });
  confirmStep(run.id, { step: 3, checked: true });

  const help = stuckOn(run.id, "the insert is spinning");
  assert.equal(help.ok, true);
  assert.equal(help.advanced, false);
  assert.equal(help.stillOnStep, 4);
  assert.match(help.detail, /insert is spinning|snug|Particleboard/i);
  assert.ok(help.fittings.some((f) => f.articleNumber === "100347"));
  assert.equal(assemblyView(run.id).run.cursor, 4);
});

test("going back reopens the steps after it instead of faking progress", () => {
  const { run } = startAssembly({ mode: "official" });
  confirmStep(run.id, { step: 1, checked: true });
  confirmStep(run.id, { step: 2, checked: true });
  assert.deepEqual(assemblyView(run.id).run.confirmed, [1, 2]);

  const back = goBack(run.id, 1);
  assert.equal(back.ok, true);
  assert.equal(back.run.cursor, 1);
  assert.deepEqual(back.run.confirmed, []);
  assert.equal(back.outline[1].readable, false);

  const ahead = goBack(run.id, 4);
  assert.equal(ahead.ok, false);
});

test("confirming every official step finishes the run", () => {
  const { run } = startAssembly({ mode: "official" });
  let view = null;
  for (let step = 1; step <= run.total; step += 1) {
    view = confirmStep(run.id, { step, checked: true });
    assert.equal(view.ok, true);
  }
  assert.equal(view.run.done, true);
  assert.ok(view.run.finishedAt);
});

test("a pasted guide is yours: skippable, editable, no acknowledgement needed", () => {
  const started = startAssembly({ mode: "custom", guide: CUSTOM });
  assert.equal(started.ok, true);
  assert.equal(started.run.locked, false);
  assert.equal(started.run.canSkip, true);
  assert.equal(started.run.total, 3);
  assert.ok(started.outline.every((s) => s.readable));

  const skipped = skipStep(started.run.id, 1);
  assert.equal(skipped.ok, true);
  assert.equal(skipped.run.cursor, 2);

  const edited = editStep(started.run.id, 2, { body: "Glue the dowels instead." });
  assert.equal(edited.ok, true);
  assert.equal(edited.step.body, "Glue the dowels instead.");

  const confirmed = confirmStep(started.run.id, { step: 2 });
  assert.equal(confirmed.ok, true);
});

test("unknown runs and steps fail loudly", () => {
  assert.equal(assemblyView("run-nope").ok, false);
  assert.equal(confirmStep("run-nope", { step: 1 }).ok, false);
  const { run } = startAssembly({ mode: "official" });
  assert.equal(peekStep(run.id, 99).ok, false);
  assert.equal(startAssembly({ mode: "official", article: "000.000.00" }).ok, false);
});

test("drawing-only PDF plates accurately require FAL plate vision", async () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;
  try {
    const result = await startAssemblyAsync({
      mode: "custom",
      images: [{ name: "BILLY p1", dataUrl: "data:image/jpeg;base64,abc" }],
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "GLiNER 2 found insufficient extractable PDF text. Set FAL_KEY so fal plate vision can read the drawing plates.",
    );
  } finally {
    if (previous === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previous;
  }
});

test("an assembly run stores the chosen instruction render mode", () => {
  assert.equal(normalizeRenderMode("video"), "video");
  assert.equal(normalizeRenderMode("images"), "images");
  assert.equal(normalizeRenderMode("image"), "images");
  assert.equal(normalizeRenderMode("3d"), "scene");
  assert.equal(normalizeRenderMode("scene"), "scene");
  assert.equal(normalizeRenderMode("nope"), null);

  const video = startAssembly({ mode: "official", renderMode: "video" });
  assert.equal(video.ok, true);
  assert.equal(video.run.renderMode, "video");

  const images = startAssembly({ mode: "custom", guide: CUSTOM, renderMode: "images" });
  assert.equal(images.run.renderMode, "images");

  const scene = startAssembly({ mode: "custom", guide: CUSTOM, renderMode: "3d" });
  assert.equal(scene.run.renderMode, "scene");
  assert.ok(Array.isArray(scene.outline[0].partsUsed));

  const later = setAssemblyRenderMode(scene.run.id, "video");
  assert.equal(later.ok, true);
  assert.equal(later.run.renderMode, "video");
  assert.equal(assemblyView(scene.run.id).run.renderMode, "video");
});

test("an assembly run locks a scene bible and render seed", () => {
  const started = startAssembly({ mode: "custom", guide: CUSTOM });
  const run = getAssembly(started.run.id);
  assert.ok(run.bible);
  assert.match(run.bible.lockText, /Pine crate|Shelf from an offcut/);
  assert.equal(typeof run.seed, "number");
  assert.equal(getAssembly(started.run.id).seed, run.seed);
});

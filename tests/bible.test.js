import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../server/lib/ikeafy.js";
import { getAssembly, resetAssemblies, startAssembly } from "../server/lib/assembly.js";
import { logSceneBible, sceneBibleFromGuide } from "../server/lib/bible.js";
import { promptForStep, renderStepVideo } from "../server/lib/video.js";
import { promptForStepImage, renderStepImage } from "../server/lib/image.js";
import { promptForStepScene, renderStepScene } from "../server/lib/scene.js";

const BILLY = `BILLY bookcase 80×28×202 cm
1. Attach a side panel to the base with dowels.
2. Slide in the shelves.
3. Fasten the top with screws.`;

const CUSTOM = `Pine crate
1. Screw the side onto the base.
2. Tape the lid hinge.`;

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

beforeEach(() => {
  resetAssemblies();
});

test("two steps of the same custom guide share product and setting strings", () => {
  const guide = parseGuide(CUSTOM);
  const bible = sceneBibleFromGuide(guide);
  const first = promptForStep(guide, 1, "", bible);
  const second = promptForStep(guide, 2, "", bible);
  const still = promptForStepImage(guide, 2, "", bible);
  const mesh = promptForStepScene(guide, 2, "", bible);

  for (const prompt of [first, second, still, mesh]) {
    assert.match(prompt, /Pine crate/);
    assert.match(prompt, /birch workshop/);
    assert.match(prompt, /north window/);
    assert.ok(prompt.includes(bible.lockText), "every step reuses the same lock block");
  }
  assert.match(first, /Screw the side onto the base/);
  assert.match(second, /Tape the lid hinge/);
  assert.doesNotMatch(second, /Screw the side onto the base/);
  assert.equal(bible.sku, "CUSTOM");
});

test("a BILLY guide must not mention LACK in later step prompts", () => {
  const guide = parseGuide(BILLY);
  const bible = sceneBibleFromGuide(guide);
  assert.match(bible.productName, /BILLY/i);
  assert.equal(bible.sku, "BILLY");
  assert.match(bible.dimensions, /80/);

  for (const step of [1, 2, 3]) {
    const video = promptForStep(guide, step, "", bible);
    const image = promptForStepImage(guide, step, "", bible);
    const scene = promptForStepScene(guide, step, "", bible);
    for (const prompt of [video, image, scene]) {
      assert.match(prompt, /BILLY/i);
      assert.doesNotMatch(prompt, /LACK/i);
      assert.ok(prompt.includes(bible.lockText));
    }
  }
  assert.match(promptForStep(guide, 3, "", bible), /Fasten the top with screws/);
});

test("an assembly run stores one bible and one seed for every renderer", () => {
  const started = startAssembly({ mode: "custom", guide: BILLY, renderMode: "images" });
  const run = getAssembly(started.run.id);
  assert.equal(run.bible.sku, "BILLY");
  assert.match(run.bible.productName, /BILLY/i);
  assert.equal(typeof run.seed, "number");
  const again = getAssembly(started.run.id);
  assert.equal(again.seed, run.seed);
  assert.equal(again.bible.lockText, run.bible.lockText);

  const lack = startAssembly({ mode: "official" });
  const official = getAssembly(lack.run.id);
  assert.equal(official.bible.sku, "LACK");
  assert.notEqual(official.seed, run.seed);
});

test("Nano Banana and Tripo reuse the run seed; Seedance keeps the locked prompt", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const bodies = [];
  const fetchFn = async (url, init = {}) => {
    if (init.method === "POST") bodies.push({ url: String(url), payload: JSON.parse(init.body) });
    if (init.method === "POST") return { ok: true, json: async () => ({ request_id: "lock-1" }) };
    if (String(url).includes("/status")) return { ok: true, json: async () => ({ status: "COMPLETED" }) };
    return {
      ok: true,
      json: async () => ({
        video: { url: "https://fal.media/files/lock.mp4" },
        images: [{ url: "https://fal.media/files/lock.png" }],
        model_urls: { glb: { url: "https://fal.media/files/lock.glb" } },
      }),
    };
  };
  const started = startAssembly({ mode: "custom", guide: BILLY });
  const run = getAssembly(started.run.id);

  try {
    await renderStepVideo(
      { guide: run.guide, stepNumber: 1, bible: run.bible, seed: run.seed },
      { fetchFn, sleep: async () => {} },
    );
    await renderStepImage(
      { guide: run.guide, stepNumber: 2, bible: run.bible, seed: run.seed },
      { fetchFn, sleep: async () => {} },
    );
    await renderStepScene(
      { guide: run.guide, stepNumber: 3, bible: run.bible, seed: run.seed },
      { fetchFn, sleep: async () => {} },
    );

    assert.equal(bodies.length, 3);
    assert.equal("seed" in bodies[0].payload, false, "Seedance 2.5 text-to-video has no input seed");
    assert.equal(bodies[1].payload.seed, run.seed);
    assert.equal(bodies[2].payload.model_seed, run.seed);
    assert.equal(bodies[2].payload.image_seed, run.seed);
    assert.equal(bodies[2].payload.texture_seed, run.seed);
    for (const { payload } of bodies) {
      assert.match(payload.prompt, /BILLY/i);
      assert.doesNotMatch(payload.prompt, /LACK/i);
      assert.ok(payload.prompt.includes(run.bible.lockText));
    }
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("render logs bible seed and step without secrets", () => {
  const lines = [];
  const orig = console.log;
  console.log = (...args) =>
    lines.push(args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" "));
  try {
    const bible = sceneBibleFromGuide(parseGuide(BILLY));
    logSceneBible({ bible, seed: 99, stepNumber: 2, mode: "images" });
  } finally {
    console.log = orig;
  }
  const text = lines.join("\n");
  assert.match(text, /\[ikealive:render\]/);
  assert.match(text, /bible/);
  assert.match(text, /99/);
  assert.match(text, /2/);
  assert.match(text, /BILLY/);
  assert.doesNotMatch(text, /FAL_KEY|fal-secret|fal-test/i);
});

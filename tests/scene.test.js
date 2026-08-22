import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../server/lib/ikeafy.js";
import { startAssembly } from "../server/lib/assembly.js";
import {
  DEFAULT_FAL_SCENE_TIMEOUT_MS,
  FAL_SCENE_POLL_MS,
  falSceneTimeoutMs,
  hasFal,
  meshUrlFrom,
  promptForStepScene,
  renderStepScene,
} from "../server/lib/scene.js";

const RAW = `LACK side table
1. Place the table top face down on a rug.
2. Screw each leg in with the Allen key.`;

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("renders no Tripo mesh without a FAL key", async () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;

  try {
    assert.equal(hasFal(), false);
    const guide = parseGuide(RAW);
    const result = await renderStepScene({ guide, stepNumber: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.live, false);
    assert.equal(result.provider, "none");
    assert.equal(result.partner, "Tripo H3.1");
    assert.equal(result.model, "tripo3d/h3.1/text-to-3d");
    assert.equal(result.meshUrl, null);
    assert.match(result.reason, /FAL_KEY/);
    assert.match(result.reason, /not a catalog LACK table/);
    assert.match(result.prompt, /Place the table top face down on a rug/);
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("promptForStepScene uses the real step body, not a canned LACK plate", () => {
  const guide = parseGuide(`Wall shelf\n1. Hang the rail on the two wall plugs.`);
  const prompt = promptForStepScene(guide, 1, "keep the grain visible");
  assert.match(prompt, /Hang the rail on the two wall plugs/);
  assert.match(prompt, /keep the grain visible/);
  assert.match(prompt, /3D furniture model/);
  assert.match(prompt, /arrow|callout|plate|exploded/i);
  assert.match(prompt, /exploded assembly|assembly diagram/i);
  assert.doesNotMatch(prompt, /^cinematic photo of/i);
  assert.doesNotMatch(prompt, /table top face down/i);
  assert.doesNotMatch(prompt, /Unpack the pieces in the photos/i);
  assert.ok(prompt.length <= 1024);
});

test("meshUrlFrom prefers model_urls.glb over FBX model_mesh", () => {
  assert.equal(
    meshUrlFrom({
      model_mesh: { url: "https://fal.media/files/demo.fbx", content_type: "model/fbx" },
      model_urls: { glb: { url: "https://fal.media/files/demo.glb" } },
    }),
    "https://fal.media/files/demo.glb",
  );
  assert.equal(
    meshUrlFrom({ model_mesh: { url: "https://fal.media/files/only.glb" }, model_urls: {} }),
    "https://fal.media/files/only.glb",
  );
});

test("Tripo H3.1 queue uses the step prompt and returns the GLB url", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    if (init.method === "POST") {
      return { ok: true, json: async () => ({ request_id: "mesh-1" }) };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: "COMPLETED" }) };
    }
    return {
      ok: true,
      json: async () => ({
        model_mesh: { url: "https://fal.media/files/demo.glb" },
        model_urls: { glb: { url: "https://fal.media/files/demo.glb" } },
      }),
    };
  };

  try {
    const guide = parseGuide(`Bookshelf\n1. Slot the left side panel onto the base.`);
    const result = await renderStepScene(
      { guide, stepNumber: 1, extra: "keep grain visible" },
      { fetchFn, sleep: async () => {} },
    );

    assert.equal(result.ok, true);
    assert.equal(result.live, true);
    assert.equal(result.provider, "tripo-h3.1");
    assert.equal(result.partner, "Tripo H3.1");
    assert.equal(result.model, "tripo3d/h3.1/text-to-3d");
    assert.equal(result.meshUrl, "https://fal.media/files/demo.glb");
    assert.match(result.prompt, /Slot the left side panel onto the base/);
    assert.match(result.prompt, /keep grain visible/);
    assert.doesNotMatch(result.prompt, /table top face down/i);

    const submit = calls[0];
    assert.equal(submit.url, "https://queue.fal.run/tripo3d/h3.1/text-to-3d");
    assert.equal(submit.method, "POST");
    const payload = JSON.parse(submit.body);
    assert.equal(payload.prompt, result.prompt);
    assert.equal(payload.quad, false);
    assert.equal("duration" in payload, false);
    assert.equal("resolution" in payload, false);

    assert.equal(calls[1].url, "https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/mesh-1/status");
    assert.equal(calls[2].url, "https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/mesh-1");
    assert.equal(
      calls.some((call) => call.url.includes("seedance") || call.url.includes("nano-banana")),
      false,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("falSceneTimeoutMs reads timeout env with a 10 minute default", () => {
  assert.equal(falSceneTimeoutMs({}), DEFAULT_FAL_SCENE_TIMEOUT_MS);
  assert.equal(DEFAULT_FAL_SCENE_TIMEOUT_MS, 10 * 60 * 1000);
  assert.equal(falSceneTimeoutMs({ FAL_SCENE_TIMEOUT_MS: "90000" }), 90_000);
  assert.equal(falSceneTimeoutMs({ FAL_TIMEOUT_MS: "45000" }), 45_000);
  assert.equal(falSceneTimeoutMs({ FAL_SCENE_TIMEOUT_MS: "0" }), DEFAULT_FAL_SCENE_TIMEOUT_MS);
  assert.equal(FAL_SCENE_POLL_MS, 2000);
});

test("Tripo H3.1 keeps polling IN_QUEUE and IN_PROGRESS on /requests/$ID", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const states = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
  const calls = [];
  const sleeps = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (init.method === "POST") {
      return { ok: true, json: async () => ({ request_id: "mesh-2" }) };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: states.shift(), queue_position: 1 }) };
    }
    return {
      ok: true,
      json: async () => ({ model_urls: { glb: { url: "https://fal.media/files/queued.glb" } } }),
    };
  };

  try {
    const result = await renderStepScene(
      { guide: parseGuide(RAW), stepNumber: 1 },
      { fetchFn, sleep: async (ms) => sleeps.push(ms) },
    );
    assert.equal(result.meshUrl, "https://fal.media/files/queued.glb");
    assert.deepEqual(sleeps, [FAL_SCENE_POLL_MS, FAL_SCENE_POLL_MS]);
    assert.equal(
      calls.filter((call) => call.url.endsWith("/requests/mesh-2/status")).length,
      3,
    );
    assert.equal(calls.at(-1).url, "https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/mesh-2");
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("Tripo errors do not fall back to a catalog LACK table", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const fetchFn = async () => ({
    ok: false,
    status: 401,
    text: async () => "unauthorized",
  });

  try {
    await assert.rejects(
      () =>
        renderStepScene(
          { guide: parseGuide(RAW), stepNumber: 1 },
          { fetchFn, sleep: async () => {} },
        ),
      /fal submit 401/,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("a scene-mode assembly outline ships partsUsed for the prompt", () => {
  const started = startAssembly({ mode: "custom", guide: RAW, renderMode: "3d" });
  assert.equal(started.ok, true);
  assert.equal(started.run.renderMode, "scene");
  assert.ok(Array.isArray(started.outline[0].partsUsed));
});

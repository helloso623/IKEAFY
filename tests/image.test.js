import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../server/lib/ikeafy.js";
import {
  DEFAULT_FAL_IMAGE_TIMEOUT_MS,
  FAL_IMAGE_POLL_MS,
  falImageTimeoutMs,
  hasFal,
  promptForStepImage,
  renderStepImage,
} from "../server/lib/image.js";

const RAW = `LACK side table
1. Place the table top face down on a rug.
2. Screw each leg in with the Allen key.`;

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("renders no Nano Banana still without a FAL key", async () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;

  try {
    assert.equal(hasFal(), false);
    const guide = parseGuide(RAW);
    const result = await renderStepImage({ guide, stepNumber: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.live, false);
    assert.equal(result.provider, "none");
    assert.equal(result.partner, "Nano Banana 2");
    assert.equal(result.model, "fal-ai/nano-banana-2");
    assert.equal(result.imageUrl, null);
    assert.match(result.reason, /FAL_KEY/);
    assert.match(result.reason, /not a canvas table drawing/);
    assert.match(result.prompt, /Place the table top face down on a rug/);
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("promptForStepImage uses the real step body, not a canned LACK plate", () => {
  const guide = parseGuide(`Wall shelf\n1. Hang the rail on the two wall plugs.`);
  const prompt = promptForStepImage(guide, 1, "keep the hands in frame");
  assert.match(prompt, /Hang the rail on the two wall plugs/);
  assert.match(prompt, /keep the hands in frame/);
  assert.match(prompt, /instruction still/);
  assert.doesNotMatch(prompt, /table top face down/i);
  assert.doesNotMatch(prompt, /Unpack the pieces in the photos/i);
});

test("nano-banana-2 queue uses the step prompt and returns the image url", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    if (init.method === "POST") {
      return { ok: true, json: async () => ({ request_id: "img-1" }) };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: "COMPLETED" }) };
    }
    return {
      ok: true,
      json: async () => ({ images: [{ url: "https://fal.media/files/demo.jpg" }], seed: 7 }),
    };
  };

  try {
    const guide = parseGuide(`Bookshelf\n1. Slot the left side panel onto the base.`);
    const result = await renderStepImage(
      { guide, stepNumber: 1, extra: "keep hands in frame" },
      { fetchFn, sleep: async () => {} },
    );

    assert.equal(result.ok, true);
    assert.equal(result.live, true);
    assert.equal(result.provider, "nano-banana-2");
    assert.equal(result.partner, "Nano Banana 2");
    assert.equal(result.model, "fal-ai/nano-banana-2");
    assert.equal(result.imageUrl, "https://fal.media/files/demo.jpg");
    assert.match(result.prompt, /Slot the left side panel onto the base/);
    assert.match(result.prompt, /keep hands in frame/);
    assert.doesNotMatch(result.prompt, /table top face down/i);

    const submit = calls[0];
    assert.equal(submit.url, "https://queue.fal.run/fal-ai/nano-banana-2");
    assert.equal(submit.method, "POST");
    const payload = JSON.parse(submit.body);
    assert.equal(payload.prompt, result.prompt);
    assert.equal(payload.num_images, 1);
    assert.equal(payload.aspect_ratio, "16:9");
    assert.equal(payload.output_format, "png");
    assert.equal(payload.resolution, "1K");
    assert.equal(payload.limit_generations, true);
    assert.equal("image_size" in payload, false);
    assert.equal("num_inference_steps" in payload, false);
    assert.equal("duration" in payload, false);

    assert.equal(calls[1].url, "https://queue.fal.run/fal-ai/nano-banana-2/requests/img-1/status");
    assert.equal(calls[2].url, "https://queue.fal.run/fal-ai/nano-banana-2/requests/img-1");
    assert.equal(
      calls.some((call) => call.url.includes("seedance")),
      false,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("falImageTimeoutMs reads timeout env with a 3 minute default", () => {
  assert.equal(falImageTimeoutMs({}), DEFAULT_FAL_IMAGE_TIMEOUT_MS);
  assert.equal(DEFAULT_FAL_IMAGE_TIMEOUT_MS, 3 * 60 * 1000);
  assert.equal(falImageTimeoutMs({ FAL_IMAGE_TIMEOUT_MS: "90000" }), 90_000);
  assert.equal(falImageTimeoutMs({ FAL_TIMEOUT_MS: "45000" }), 45_000);
  assert.equal(falImageTimeoutMs({ FAL_IMAGE_TIMEOUT_MS: "0" }), DEFAULT_FAL_IMAGE_TIMEOUT_MS);
  assert.equal(FAL_IMAGE_POLL_MS, 1000);
});

test("nano-banana-2 keeps polling IN_QUEUE and IN_PROGRESS on /requests/$ID", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const states = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
  const calls = [];
  const sleeps = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (init.method === "POST") {
      return { ok: true, json: async () => ({ request_id: "img-2" }) };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: states.shift(), queue_position: 1 }) };
    }
    return { ok: true, json: async () => ({ images: [{ url: "https://fal.media/files/queued.jpg" }] }) };
  };

  try {
    const result = await renderStepImage(
      { guide: parseGuide(RAW), stepNumber: 1 },
      { fetchFn, sleep: async (ms) => sleeps.push(ms) },
    );
    assert.equal(result.imageUrl, "https://fal.media/files/queued.jpg");
    assert.deepEqual(sleeps, [FAL_IMAGE_POLL_MS, FAL_IMAGE_POLL_MS]);
    assert.equal(
      calls.filter((call) => call.url.endsWith("/requests/img-2/status")).length,
      3,
    );
    assert.equal(calls.at(-1).url, "https://queue.fal.run/fal-ai/nano-banana-2/requests/img-2");
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("Nano Banana errors do not fall back to a canvas storyboard plate", async () => {
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
        renderStepImage(
          { guide: parseGuide(RAW), stepNumber: 1 },
          { fetchFn, sleep: async () => {} },
        ),
      /fal submit 401/,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../server/lib/ikeafy.js";
import { hasFal, hasVeed, promptForStep, renderStepVideo } from "../server/lib/video.js";

const RAW = `LACK side table
1. Place the table top face down on a rug.
2. Screw each leg in with the Allen key.`;

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("hasFal is false without a FAL key", () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;

  try {
    assert.equal(hasFal(), false);
    assert.equal(hasVeed(), false);
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("renders no Seedance film without a FAL key", async () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;

  try {
    const guide = parseGuide(RAW);
    const result = await renderStepVideo({ guide, stepNumber: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.live, false);
    assert.equal(result.provider, "none");
    assert.equal(result.partner, "Seedance");
    assert.equal(result.model, "bytedance/seedance-2.5/text-to-video");
    assert.equal(result.videoUrl, null);
    assert.match(result.reason, /FAL_KEY/);
    assert.match(result.prompt, /Place the table top face down on a rug/);
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("promptForStep uses the real step body, not a canned LACK plate", () => {
  const guide = parseGuide(`Wall shelf\n1. Hang the rail on the two wall plugs.`);
  const prompt = promptForStep(guide, 1, "go slower");
  assert.match(prompt, /Hang the rail on the two wall plugs/);
  assert.match(prompt, /go slower/);
  assert.doesNotMatch(prompt, /table top face down/i);
  assert.doesNotMatch(prompt, /Unpack the pieces in the photos/i);
});

test("Seedance queue uses the step prompt and returns the video url", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    if (init.method === "POST") {
      return { ok: true, json: async () => ({ request_id: "req-1" }) };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: "COMPLETED" }) };
    }
    return {
      ok: true,
      json: async () => ({ video: { url: "https://fal.media/files/demo.mp4" }, seed: 7 }),
    };
  };

  try {
    const guide = parseGuide(`Bookshelf\n1. Slot the left side panel onto the base.`);
    const result = await renderStepVideo(
      { guide, stepNumber: 1, extra: "keep hands in frame" },
      { fetchFn, sleep: async () => {} },
    );

    assert.equal(result.ok, true);
    assert.equal(result.live, true);
    assert.equal(result.provider, "seedance-2.5");
    assert.equal(result.partner, "Seedance");
    assert.equal(result.model, "bytedance/seedance-2.5/text-to-video");
    assert.equal(result.videoUrl, "https://fal.media/files/demo.mp4");
    assert.match(result.prompt, /Slot the left side panel onto the base/);
    assert.match(result.prompt, /keep hands in frame/);
    assert.doesNotMatch(result.prompt, /table top face down/i);

    const submit = calls[0];
    assert.match(submit.url, /queue\.fal\.run\/bytedance\/seedance-2\.5\/text-to-video$/);
    assert.equal(submit.method, "POST");
    const payload = JSON.parse(submit.body);
    assert.equal(payload.prompt, result.prompt);
    assert.equal(payload.duration, "5");
    assert.equal("image_url" in payload, false);
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("Seedance errors do not fall back to a canvas storyboard reel", async () => {
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
        renderStepVideo(
          { guide: parseGuide(RAW), stepNumber: 1 },
          { fetchFn, sleep: async () => {} },
        ),
      /fal submit 401/,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

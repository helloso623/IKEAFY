import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../server/lib/ikeafy.js";
import {
  DEFAULT_FAL_TIMEOUT_MS,
  FAL_POLL_MS,
  falTimeoutMs,
  hasFal,
  hasVeed,
  promptForStep,
  renderStepVideo,
} from "../server/lib/video.js";

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

    assert.equal(calls[1].url, "https://queue.fal.run/bytedance/seedance-2.5/requests/req-1/status");
    assert.equal(calls[2].url, "https://queue.fal.run/bytedance/seedance-2.5/requests/req-1");
    assert.equal(
      calls.some((call) => call.url.includes("/text-to-video/requests/")),
      false,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("falTimeoutMs reads FAL_TIMEOUT_MS at call time with a 15 minute default", () => {
  assert.equal(falTimeoutMs({}), DEFAULT_FAL_TIMEOUT_MS);
  assert.equal(DEFAULT_FAL_TIMEOUT_MS, 15 * 60 * 1000);
  assert.equal(falTimeoutMs({ FAL_TIMEOUT_MS: "900000" }), 900_000);
  assert.equal(falTimeoutMs({ FAL_TIMEOUT_MS: "0" }), DEFAULT_FAL_TIMEOUT_MS);
  assert.equal(falTimeoutMs({ FAL_TIMEOUT_MS: "nope" }), DEFAULT_FAL_TIMEOUT_MS);
  assert.equal(FAL_POLL_MS, 1500);
});

test("Seedance keeps polling IN_QUEUE and IN_PROGRESS on /requests/$ID", async () => {
  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test";
  const states = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
  const calls = [];
  const sleeps = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (init.method === "POST") {
      return {
        ok: true,
        json: async () => ({
          request_id: "req-2",
          status_url: "https://queue.fal.run/bytedance/seedance-2.5/text-to-video/requests/req-2/status",
          response_url: "https://queue.fal.run/bytedance/seedance-2.5/text-to-video/requests/req-2",
        }),
      };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: states.shift(), queue_position: 2 }) };
    }
    return { ok: true, json: async () => ({ video: { url: "https://fal.media/files/queued.mp4" } }) };
  };

  try {
    const result = await renderStepVideo(
      { guide: parseGuide(RAW), stepNumber: 1 },
      { fetchFn, sleep: async (ms) => sleeps.push(ms) },
    );
    assert.equal(result.videoUrl, "https://fal.media/files/queued.mp4");
    assert.deepEqual(sleeps, [FAL_POLL_MS, FAL_POLL_MS]);
    assert.equal(
      calls.filter((call) => call.url.endsWith("/requests/req-2/status")).length,
      3,
    );
    assert.equal(calls.at(-1).url, "https://queue.fal.run/bytedance/seedance-2.5/requests/req-2");
    assert.equal(
      calls.some((call) => call.url.includes("/text-to-video/requests/")),
      false,
    );
  } finally {
    restoreEnv("FAL_KEY", previous);
  }
});

test("Seedance timeout includes elapsed ms and last status, not a canvas fallback", async () => {
  const previousKey = process.env.FAL_KEY;
  const previousTimeout = process.env.FAL_TIMEOUT_MS;
  process.env.FAL_KEY = "fal-test";
  process.env.FAL_TIMEOUT_MS = "4000";

  let nowMs = 0;
  const now = () => nowMs;
  const sleep = async (ms) => {
    nowMs += ms;
  };
  const fetchFn = async (url, init = {}) => {
    if (init.method === "POST") {
      return { ok: true, json: async () => ({ request_id: "req-timeout" }) };
    }
    if (String(url).includes("/status")) {
      return { ok: true, json: async () => ({ status: "IN_QUEUE", queue_position: 4 }) };
    }
    throw new Error(`unexpected ${url}`);
  };

  try {
    await assert.rejects(
      () =>
        renderStepVideo(
          { guide: parseGuide(RAW), stepNumber: 1 },
          { fetchFn, sleep, now },
        ),
      /fal timeout after 4500ms \(last status: IN_QUEUE\)/,
    );
  } finally {
    restoreEnv("FAL_KEY", previousKey);
    restoreEnv("FAL_TIMEOUT_MS", previousTimeout);
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide, storyboardForStep } from "../server/lib/ikeafy.js";
import { hasVeed, renderStepVideo } from "../server/lib/video.js";

const RAW = `LACK side table
1. Place the table top face down on a rug.
2. Screw each leg in with the Allen key.`;

test("hasVeed is false without a FAL key", () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;

  try {
    assert.equal(hasVeed(), false);
  } finally {
    if (previous === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previous;
  }
});

test("renders an offline birch-workshop storyboard without a FAL key", async () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;

  try {
    const guide = parseGuide(RAW);
    const result = await renderStepVideo({ guide, stepNumber: 1 });

    assert.equal(result.provider, "local-storyboard");
    assert.equal(result.partner, "Veed");
    assert.equal(result.model, "veed/fabric-1.0");
    assert.equal(result.videoUrl, null);
    assert.equal(result.continuous, true);
    assert.equal(result.theme.setting, "birch workshop");
    assert.deepEqual(result.frames, storyboardForStep(guide, 1));
  } finally {
    if (previous === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previous;
  }
});

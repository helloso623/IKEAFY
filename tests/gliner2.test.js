import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GLINER2_BACKEND,
  GLINER2_SETUP_COMMAND,
  answerGuideQuestionWithGliner2,
  ensureGliner2Ready,
  extractGuideWithGliner2,
  gliner2RuntimeStatus,
  inferWithGliner2,
  isGliner2RuntimeError,
  stopGliner2Sidecar,
} from "../server/lib/gliner2.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOCK_SIDECAR = path.join(ROOT, "tests", "fixtures", "gliner2_mock_sidecar.py");

const saved = {
  python: process.env.GLINER2_PYTHON,
  sidecar: process.env.GLINER2_SIDECAR,
  model: process.env.GLINER2_MODEL,
  mockMode: process.env.GLINER2_MOCK_MODE,
  mockInfer: process.env.GLINER2_MOCK_INFER,
};

function restoreEnv() {
  for (const [key, value] of Object.entries({
    GLINER2_PYTHON: saved.python,
    GLINER2_SIDECAR: saved.sidecar,
    GLINER2_MODEL: saved.model,
    GLINER2_MOCK_MODE: saved.mockMode,
    GLINER2_MOCK_INFER: saved.mockInfer,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function useMockSidecar(mode = "ready") {
  process.env.GLINER2_PYTHON = "python3";
  process.env.GLINER2_SIDECAR = MOCK_SIDECAR;
  process.env.GLINER2_MOCK_MODE = mode;
  delete process.env.GLINER2_MOCK_INFER;
}

afterEach(() => {
  stopGliner2Sidecar();
  restoreEnv();
});

test("mocked inferFn bypasses the real sidecar", async () => {
  const result = await extractGuideWithGliner2("1. Hang the rail.", {
    glinerInfer: async () => ({
      assembly_guide: [{ title: "Shelf" }],
      assembly_step: [
        {
          sequence_number: "1",
          instruction: "Hang the rail.",
          action: "place",
          parts: ["rail"],
          tool: "",
          warnings: [],
        },
      ],
    }),
  });
  assert.equal(result.title, "Shelf");
  assert.equal(result.steps[0].body, "Hang the rail.");
  assert.equal(gliner2RuntimeStatus().status, "idle");
});

test("mocked inferFn maps body aliases when instruction is missing", async () => {
  const result = await extractGuideWithGliner2("1. Hang the rail.", {
    glinerInfer: async () => ({
      assembly_guide: [{ title: "Shelf" }],
      assembly_step: [
        {
          sequence_number: "1",
          body: "Hang the rail.",
          action: "place",
          parts: ["rail"],
          tool: "",
          warnings: [],
        },
      ],
    }),
  });
  assert.equal(result.title, "Shelf");
  assert.equal(result.steps[0].body, "Hang the rail.");
});

test("sidecar ready protocol reports ready status without downloading a checkpoint", async () => {
  useMockSidecar("ready");
  const ready = await ensureGliner2Ready({ glinerStartupTimeoutMs: 5_000 });
  assert.equal(ready.status, "ready");
  assert.equal(ready.ready, true);
  assert.match(String(ready.model), /gliner2-base-v1/);
  assert.equal(gliner2RuntimeStatus().status, "ready");
  assert.equal(gliner2RuntimeStatus().ready, true);

  const extracted = await extractGuideWithGliner2(
    "Wall shelf. Step 1. Hang the rail with two wall plugs and check the wall type.",
    { glinerStartupTimeoutMs: 5_000, glinerTimeoutMs: 5_000 },
  );
  assert.equal(extracted.title, "Wall shelf");
  assert.equal(extracted.steps[0].toolRequired, "screwdriver");
});

test("sidecar startup timeout surfaces an actionable GLINER2 error", async () => {
  useMockSidecar("hang");
  await assert.rejects(
    () => ensureGliner2Ready({ glinerStartupTimeoutMs: 250 }),
    (error) => {
      assert.equal(isGliner2RuntimeError(error), true);
      assert.equal(error.code, "GLINER2_STARTUP_TIMEOUT");
      assert.match(error.message, /timed out/);
      assert.match(error.message, new RegExp(GLINER2_SETUP_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      return true;
    },
  );
  assert.equal(gliner2RuntimeStatus().status, "idle");
});

test("sidecar import failure surfaces setup guidance", async () => {
  useMockSidecar("import_fail");
  await assert.rejects(
    () => ensureGliner2Ready({ glinerStartupTimeoutMs: 5_000 }),
    (error) => {
      assert.equal(isGliner2RuntimeError(error), true);
      assert.match(error.message, /unavailable|exited/i);
      assert.match(error.message, /setup:gliner2/);
      return true;
    },
  );
});

test("inference errors keep the GLINER2 backend label honest", async () => {
  useMockSidecar("ready");
  process.env.GLINER2_MOCK_INFER = "fail";
  await assert.rejects(
    () =>
      inferWithGliner2(
        { operation: "extract_json", text: "1. Screw the side.", schema: { assembly_step: [] } },
        { startupTimeoutMs: 5_000, timeoutMs: 5_000 },
      ),
    (error) => {
      assert.equal(error.code, "GLINER2_INFERENCE_ERROR");
      assert.match(error.message, /mock inference failed/);
      return true;
    },
  );
  assert.equal(GLINER2_BACKEND, "gliner2:fastino/gliner2-base-v1");
});

test("guide questions compose answers only from stored guide fields", async () => {
  const reply = await answerGuideQuestionWithGliner2(
    "What tool do I need for step 1?",
    {
      steps: [{ number: 1, body: "Screw each leg in.", toolRequired: "allen-key", partsUsed: ["lack-leg"], warnings: [] }],
    },
    {
      glinerInfer: async () => ({
        guide_question: [{ step_number: "1", requested_detail: "tool", mentioned_parts: [], problem: "" }],
      }),
    },
  );
  assert.equal(reply.text, "Step 1 requires allen-key.");
  assert.deepEqual(reply.stepNumbers, [1]);
});

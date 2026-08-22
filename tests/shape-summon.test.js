import assert from "node:assert/strict";
import test from "node:test";

import { applyGeneratedAction, generatedMeshSpec } from "../client/src/chat-actions.js";
import { buildAiMeshGeometry } from "../client/src/ai-mesh.js";
import {
  bindShapeSummonButtons,
  SHAPE_SUMMON_NAMES,
  shapeSummonSpec,
} from "../client/src/shape-summon.js";
import { chat, routeAgent, sanitizeActions } from "../server/lib/agents.js";
import { isMeshBuildAsk, localMeshAction } from "../server/lib/mesh-plan.js";
import { emptyProject } from "../server/lib/project.js";

function withoutHosted(run) {
  return async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await run();
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  };
}

test("all summon shapes build finite editable triangle geometry", () => {
  assert.deepEqual(SHAPE_SUMMON_NAMES, [
    "cube",
    "box",
    "sphere",
    "cylinder",
    "cone",
    "torus",
    "plane",
    "prism",
  ]);
  for (const name of SHAPE_SUMMON_NAMES) {
    const spec = shapeSummonSpec(name);
    const geometry = buildAiMeshGeometry(spec);
    assert.equal(spec.components[0].shape, name === "cube" ? "box" : name);
    assert.ok(geometry.positions instanceof Float32Array);
    assert.ok(geometry.positions.length >= 18);
    assert.ok(geometry.positions.every(Number.isFinite));
  }
});

test("every summon button receives a live click listener", () => {
  const buttons = SHAPE_SUMMON_NAMES.map((name) => {
    const listeners = [];
    return {
      dataset: { summonShape: name },
      addEventListener(type, listener) {
        if (type === "click") listeners.push(listener);
      },
      click() {
        for (const listener of listeners) listener();
      },
      listeners,
    };
  });
  const summoned = [];
  const count = bindShapeSummonButtons(
    { querySelectorAll: () => buttons },
    (spec, name) => summoned.push([name, spec.components[0].shape]),
  );
  assert.equal(count, SHAPE_SUMMON_NAMES.length);
  assert.ok(buttons.every((button) => button.listeners.length === 1));
  for (const button of buttons) button.click();
  assert.deepEqual(
    summoned,
    SHAPE_SUMMON_NAMES.map((name) => [name, name === "cube" ? "box" : name]),
  );
});

test("shape words summon their matching editable Three.js primitives", () => {
  const cases = [
    ["cube", "box"],
    ["make a box", "box"],
    ["sphere", "sphere"],
    ["cylinder", "cylinder"],
    ["cone", "cone"],
    ["summon a torus", "torus"],
    ["plane", "plane"],
    ["prism", "prism"],
  ];

  for (const [prompt, expectedShape] of cases) {
    assert.equal(isMeshBuildAsk(prompt), true, prompt);
    assert.equal(routeAgent(prompt).id, "creative", prompt);
    const action = localMeshAction(prompt);
    assert.equal(action.type, "mesh");
    assert.equal(action.partId, undefined);
    assert.equal(action.mesh.kind, "primitive");
    assert.equal(action.mesh.components.length, 1);
    assert.equal(action.mesh.components[0].shape, expectedShape);
    const geometry = buildAiMeshGeometry(action.mesh);
    assert.ok(geometry.triangleCount >= 2, prompt);
    assert.ok(geometry.positions.length >= 18, prompt);
  }
});

test("shape toolbar specs all compile to editable triangle geometry", () => {
  assert.deepEqual(SHAPE_SUMMON_NAMES, [
    "cube",
    "box",
    "sphere",
    "cylinder",
    "cone",
    "torus",
    "plane",
    "prism",
  ]);
  for (const name of SHAPE_SUMMON_NAMES) {
    const spec = shapeSummonSpec(name);
    assert.equal(spec.kind, "primitive");
    assert.ok(buildAiMeshGeometry(spec).triangleCount >= 2, name);
  }
});

test("cube, sphere, lamp, and chair chat prompts all emit applied geometry actions", withoutHosted(async () => {
  for (const prompt of ["cube", "sphere", "generate a lamp", "make a chair"]) {
    const reply = await chat(prompt, { project: emptyProject() });
    const action = reply.actions.find((candidate) => candidate.type === "mesh");
    assert.ok(action, `${prompt} should emit a mesh action`);
    assert.equal(reply.actions.some((candidate) => candidate.type === "catalog"), false);
    assert.equal(reply.actions.some((candidate) => candidate.partId), false);

    let received = null;
    const applied = applyGeneratedAction(action, {
      addGeneratedMesh(spec) {
        received = spec;
        const geometry = buildAiMeshGeometry(spec);
        return { piece: { id: `generated-${prompt}` }, geometry };
      },
    });
    assert.strictEqual(received, action.mesh);
    assert.ok(applied.piece.id);
    assert.ok(applied.geometry.triangleCount > 0);
  }
}));

test("generate action aliases are normalized and executed without dropping their mesh payload", () => {
  const spec = localMeshAction("cube").mesh;
  const alias = { type: "generate", geometry: spec };
  assert.strictEqual(generatedMeshSpec(alias), spec);

  let received = null;
  const applied = applyGeneratedAction(alias, {
    addGeneratedMesh(mesh) {
      received = mesh;
      return { piece: { id: "generated-cube" } };
    },
  });
  assert.strictEqual(received, spec);
  assert.equal(applied.piece.id, "generated-cube");

  const normalized = sanitizeActions([alias]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].type, "mesh");
  assert.equal(normalized[0].mesh.components[0].shape, "box");
});

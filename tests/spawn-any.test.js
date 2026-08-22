import assert from "node:assert/strict";
import test from "node:test";

import { buildAiMeshGeometry } from "../client/src/ai-mesh.js";
import { chat } from "../server/lib/agents.js";
import {
  isMeshBuildAsk,
  localMeshAction,
  meshPromptsFromRoom,
} from "../server/lib/mesh-plan.js";
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

test("arbitrary object requests produce editable mesh actions, never catalog prose", withoutHosted(async () => {
  const cases = [
    ["chair", "chair"],
    ["make a round dining table with one central leg", "table"],
    ["spawn a 720 mm tall brass lamp", "lamp"],
    ["create a blue sofa", "sofa"],
    ["model a moon rover", "object"],
    ["place a moon rover", "object"],
    ["I want a dragon", "object"],
    ["render a video camera", "object"],
  ];

  for (const [message, kind] of cases) {
    assert.equal(isMeshBuildAsk(message), true, message);
    const reply = await chat(message, { project: emptyProject() });
    const meshes = reply.actions.filter((action) => action.type === "mesh");
    assert.equal(meshes.length, 1, `${message} should create one mesh action`);
    assert.equal(meshes[0].mesh.kind, kind);
    assert.ok(meshes[0].mesh.components.length >= 1);
    assert.equal(reply.actions.some((action) => action.type === "catalog"), false);
    assert.doesNotMatch(reply.text, /on the shelf|Creative staged|550×550/i);
  }
}));

test("spawn it resolves the latest user object description", withoutHosted(async () => {
  const reply = await chat("spawn it", {
    project: emptyProject(),
    history: [
      { role: "user", content: "I want a green sofa that is 2100 mm wide" },
      { role: "assistant", content: "That would fit the room." },
    ],
  });
  const action = reply.actions.find((candidate) => candidate.type === "mesh");
  assert.ok(action);
  assert.equal(action.mesh.kind, "sofa");
  assert.equal(action.mesh.components[0].sizeMm[0], 1940);
}));

test("room requests create real room geometry and every requested object mesh", withoutHosted(async () => {
  assert.deepEqual(meshPromptsFromRoom("create a room with a round table and a chair"), [
    "make round table",
    "make chair",
  ]);
  const reply = await chat("create a 5 x 4 m room with a round table and a chair", {
    project: emptyProject(),
  });
  assert.equal(reply.actions.filter((action) => action.type === "room").length, 1);
  assert.deepEqual(
    reply.actions.filter((action) => action.type === "mesh").map((action) => action.mesh.kind),
    ["table", "chair"],
  );
}));

test("mesh actions become finite triangle geometry for the Lab editor", () => {
  for (const prompt of [
    "make a chair",
    "make a round table with one central leg",
    "make a lamp",
    "make a vase",
    "make a moon rover",
  ]) {
    const action = localMeshAction(prompt);
    const built = buildAiMeshGeometry(action.mesh);
    assert.ok(built.positions instanceof Float32Array);
    assert.ok(built.positions.length >= 9);
    assert.ok(built.triangleCount >= 1);
    assert.ok(built.dimensionsMm.x > 1);
    assert.ok(built.dimensionsMm.y > 1);
    assert.ok(built.dimensionsMm.z > 1);
  }
});

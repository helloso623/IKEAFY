import { test } from "node:test";
import assert from "node:assert/strict";
import { ROSTER, chat, routeAgent } from "../server/lib/agents.js";
import { emptyProject } from "../server/lib/project.js";

test("ten agents sit on the bench", () => {
  assert.equal(ROSTER.length, 10);
  assert.ok(ROSTER.some((a) => a.model === "fable" && a.role === "orchestration"));
  assert.ok(ROSTER.some((a) => a.model === "opus"));
  assert.ok(ROSTER.filter((a) => a.model === "gpt-5.6").length >= 3);
  assert.ok(ROSTER.filter((a) => a.model === "grok").length >= 3);
});

test("router sends hard and easy work to the right desks", () => {
  assert.equal(routeAgent("run a rain and heat test").id, "lab");
  assert.equal(routeAgent("I am stuck on step 4").id, "assembler");
  assert.equal(routeAgent("move the camera left").id, "shop");
  assert.equal(routeAgent("put a table in my room photo").id, "stylist");
});

test("local steward can add a catalog part", async () => {
  const project = emptyProject();
  const reply = await chat("add a cheap led", { project, costBarrier: 2 });
  assert.equal(reply.backend, "local-steward");
  assert.ok(reply.actions.some((a) => a.type === "add_part"));
  assert.equal(project.pieces.length, 1);
});

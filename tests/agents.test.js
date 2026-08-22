import { test } from "node:test";
import assert from "node:assert/strict";
import { ROSTER, chat, routeAgent, shouldEscalate } from "../server/lib/agents.js";
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
  assert.equal(routeAgent("make a parametric bracket in Fusion 360").id, "cad");
  assert.equal(routeAgent("route this KiCad PCB from the schematic").id, "eda");
  assert.equal(routeAgent("run an FEA load case").id, "sim");
  assert.equal(routeAgent("render the concept in Blender").id, "creative");
  assert.equal(routeAgent("I am stuck on step 4").id, "assembler");
  assert.equal(routeAgent("move the camera left").id, "shop");
  assert.equal(routeAgent("place this piece in my room photo").id, "stylist");
  assert.equal(routeAgent("find a cheap table").id, "scout");
});

test("local steward can add a catalog part", async () => {
  const project = emptyProject();
  const reply = await chat("add a cheap led", { project, costBarrier: 2 });
  assert.equal(reply.backend, "local-steward");
  assert.ok(reply.actions.some((a) => a.type === "add_part"));
  assert.equal(project.pieces.length, 1);
});

test("quick assembly questions stay on the GLiNER desk until they get hard", async () => {
  assert.equal(shouldEscalate("which tool for this step?"), false);
  assert.equal(shouldEscalate("I am stuck on step 4"), false);
  assert.equal(shouldEscalate("fix the stripped insert and regenerate a clearer film for step 4"), true);
  const quick = await chat("which tool for this step?", { step: 4 });
  assert.equal(quick.backend, "gliner-2-standin");
  assert.equal(quick.escalated, false);
});

test("hard lab desks escalate and persist their local artifacts", async () => {
  const project = emptyProject();
  assert.equal(shouldEscalate("route this KiCad PCB"), true);
  assert.equal(shouldEscalate("simulate a load case"), true);

  const reply = await chat("make a parametric bracket in Fusion 360", { project });
  assert.equal(reply.agent.id, "cad");
  assert.equal(project.labTools.fusion.kind, "parametric-model");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ROSTER, chat, describeScene, planCreativeActions, planStudioActions, routeAgent, shouldEscalate } from "../server/lib/agents.js";
import { emptyProject } from "../server/lib/project.js";

function withoutHosted(fn) {
  return async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  };
}

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
  assert.equal(routeAgent("place this piece in my room photo").id, "stylist");
  assert.equal(routeAgent("find a cheap table").id, "scout");
  assert.equal(routeAgent("generate a lamp").id, "eda");
  assert.equal(routeAgent("make a parametric bracket in Fusion 360").id, "cad");
  assert.equal(routeAgent("route this KiCad PCB from the schematic").id, "eda");
  assert.equal(routeAgent("run an FEA load case").id, "sim");
  assert.equal(routeAgent("render the concept in Blender").id, "creative");
});

test(
  "local steward can add a catalog part",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("add zip ties", { project, costBarrier: 2 });
    assert.equal(reply.backend, "local-steward");
    assert.ok(reply.actions.some((a) => a.type === "add" || a.type === "add_part"));
    assert.equal(project.pieces.length, 1);
    assert.equal(project.pieces[0].partId, "zip-tie");
  }),
);

test(
  "add a lack table expands the kit into add actions",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("add a lack table", { project });
    const adds = reply.actions.filter((a) => a.type === "add" || a.type === "add_part");
    assert.ok(adds.some((a) => a.partId === "lack-top"));
    assert.equal(adds.filter((a) => a.partId === "lack-leg").length, 4);
    assert.equal(project.pieces.filter((p) => p.partId === "lack-top").length, 1);
    assert.equal(project.pieces.filter((p) => p.partId === "lack-leg").length, 4);
    assert.doesNotMatch(reply.text, /arduino|firmware|sketch/i);
  }),
);

test(
  "put four legs drops four legs on the bench",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("put four legs", { project });
    const adds = reply.actions.filter((a) => a.type === "add" || a.type === "add_part");
    assert.equal(adds.length, 4);
    assert.ok(adds.every((a) => a.partId === "lack-leg"));
    assert.equal(project.pieces.filter((p) => p.partId === "lack-leg").length, 4);
    assert.doesNotMatch(reply.text, /arduino|firmware|sketch/i);
  }),
);

test(
  "generate a lamp drops a LACK table, not a Nano or LED",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("generate a lamp", { project });
    const ids = project.pieces.map((p) => p.partId);
    assert.ok(ids.includes("lack-top"));
    assert.equal(ids.filter((id) => id === "lack-leg").length, 4);
    assert.equal(ids.includes("arduino-nano"), false);
    assert.equal(ids.includes("led-5mm"), false);
    assert.equal(ids.includes("tactile-btn"), false);
    assert.ok(reply.actions.some((a) => a.type === "add" || a.type === "add_part"));
    assert.equal(reply.actions.some((a) => a.type === "isolate"), false);
    assert.doesNotMatch(reply.text, /arduino|nano|led|firmware/i);
  }),
);

test("studio voice commands become reel actions, not bench adds", () => {
  assert.equal(planStudioActions("get the reel").actions[0].action, "start");
  assert.equal(planStudioActions("start the official sheet").actions[0].action, "official");
  assert.equal(planStudioActions("next step").actions[0].action, "next");
  assert.equal(planStudioActions("request a spare").actions[0].action, "spare");
  assert.equal(planStudioActions("add a lack table").handles, false);
});

test(
  "chat turns next step into a studio action",
  withoutHosted(async () => {
    const reply = await chat("next step", { step: 2 });
    assert.ok(reply.actions.some((a) => a.type === "studio" && a.action === "next"));
    assert.doesNotMatch(reply.text, /Parsed \d+ steps/);
  }),
);

test("creative desk plans add, camera, label, and isolate", () => {
  const lamp = planCreativeActions("generate a lamp");
  assert.ok(lamp.actions.some((a) => a.type === "add" && a.partId === "lack-top"));
  assert.equal(lamp.actions.filter((a) => a.type === "add" && a.partId === "lack-leg").length, 4);
  assert.equal(lamp.actions.some((a) => a.type === "isolate"), false);
  const isolate = planCreativeActions("isolate the board");
  assert.ok(isolate.actions.some((a) => a.type === "isolate"));
  const cam = planCreativeActions("move the camera left");
  assert.ok(cam.actions.some((a) => a.type === "camera" && a.az === 120));
});

test(
  "furniture answers stay free of Arduino",
  withoutHosted(async () => {
    const reply = await chat("add a lack table", { project: emptyProject() });
    assert.doesNotMatch(reply.text, /arduino|firmware|sketch|nano/i);
    const listed = await chat("find a cheap table", { costBarrier: 40 });
    assert.doesNotMatch(listed.text, /arduino|firmware|sketch/i);
  }),
);

test("quick assembly questions stay on the GLiNER desk until they get hard", async () => {
  assert.equal(shouldEscalate("which tool for this step?"), false);
  assert.equal(shouldEscalate("I am stuck on step 4"), false);
  assert.equal(shouldEscalate("fix the stripped insert and regenerate a clearer film for step 4"), true);
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const quick = await chat("which tool for this step?", { step: 4 });
    assert.equal(quick.backend, "gliner-2-standin");
    assert.equal(quick.escalated, false);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test(
  "hard lab desks escalate and persist their local artifacts",
  withoutHosted(async () => {
    const project = emptyProject();
    assert.equal(shouldEscalate("route this KiCad PCB"), true);
    assert.equal(shouldEscalate("simulate a load case"), true);

    const reply = await chat("make a parametric bracket in Fusion 360", { project });
    assert.equal(reply.agent.id, "cad");
    assert.equal(project.labTools.fusion.kind, "parametric-model");
  }),
);

test("hosted creative desk uses the key and returns bench actions", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-hosted";
  try {
    const project = emptyProject();
    const reply = await chat("add a lack table", {
      project,
      fetchFn: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  text: "Dropped a LACK top and four legs on the bench.",
                  actions: [
                    { type: "add", partId: "lack-top", pose: { x: 0, y: 0.22, z: 0 } },
                    { type: "add", partId: "lack-leg" },
                    { type: "add", partId: "lack-leg" },
                    { type: "add", partId: "lack-leg" },
                    { type: "add", partId: "lack-leg" },
                    { type: "camera", az: 40, el: 30 },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    });
    assert.match(reply.backend, /^hosted:/);
    assert.equal(reply.actions.filter((a) => a.type === "add").length, 5);
    assert.ok(reply.actions.some((a) => a.type === "camera"));
    assert.doesNotMatch(reply.text, /arduino|firmware|sketch/i);
    assert.equal(project.pieces.filter((p) => p.partId === "lack-leg").length, 4);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("describeScene reads selected piece, count, and Lab mode", () => {
  const note = describeScene({
    photoName: "view.jpg",
    scene: {
      lab: "desk",
      pieceCount: 2,
      selected: { name: "LACK table top", dimsMm: { x: 550, y: 50, z: 550 } },
    },
  });
  assert.match(note, /desk mode/);
  assert.match(note, /2 pieces/);
  assert.match(note, /LACK table top/);
  assert.match(note, /550×50×550 mm/);
  assert.match(note, /view\.jpg/);
});

test(
  "local steward answers from the bench scene JSON",
  withoutHosted(async () => {
    const reply = await chat("what is this on the screen?", {
      scene: {
        lab: "ar",
        pieceCount: 1,
        selected: { name: "LACK table top", dimsMm: { x: 550, y: 50, z: 550 } },
      },
      photoName: "view.jpg",
    });
    assert.equal(reply.backend, "local-steward");
    assert.match(reply.text, /LACK table top/);
    assert.match(reply.text, /ar mode/);
  }),
);

test("scan and generate stay on existing shop actions", () => {
  const scan = planCreativeActions("scan this object");
  assert.equal(scan.handles, true);
  assert.ok(scan.actions.some((a) => a.type === "scan"));
  const lamp = planCreativeActions("generate a lamp");
  assert.ok(lamp.actions.some((a) => a.type === "add"));
});

test(
  "move this left nudges the selected piece",
  withoutHosted(async () => {
    const project = emptyProject();
    const { addPiece } = await import("../server/lib/project.js");
    const piece = addPiece(project, "lack-top", { x: 0.2, y: 0.22, z: 0 });
    const reply = await chat("move this left", {
      project,
      scene: { lab: "desk", pieceCount: 1, selected: { id: piece.id, name: "LACK table top", partId: "lack-top" } },
    });
    assert.ok(reply.actions.some((a) => a.type === "move" && a.id === piece.id));
    assert.ok(project.pieces[0].x < 0.2);
  }),
);

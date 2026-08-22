import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROSTER,
  chat,
  describeScene,
  furnitureBuildDesks,
  isFurnitureBuildAsk,
  manyAgentsNote,
  mergeChatContext,
  planCreativeActions,
  planStudioActions,
  routeAgent,
  runFurnitureDesks,
  shouldEscalate,
} from "../server/lib/agents.js";
import { emptyProject } from "../server/lib/project.js";
import { buildAiMeshGeometry } from "../client/src/ai-mesh.js";

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

function assertGeneratedRoundTable(reply) {
  const action = reply.actions.find((candidate) => candidate.type === "mesh");
  assert.ok(action, "the steward should emit a real mesh action");
  const top = action.mesh.components.find((body) => /top/i.test(body.name));
  const leg = action.mesh.components.find((body) => /central leg/i.test(body.name));
  assert.equal(top.shape, "cylinder");
  assert.equal(top.sizeMm[0], top.sizeMm[2]);
  assert.ok(top.sizeMm[0] > leg.sizeMm[0]);
  assert.equal(leg.shape, "cylinder");
  assert.ok(top.positionMm[1] > leg.positionMm[1]);
  assert.equal(action.partId, undefined);
  assert.equal(reply.actions.some((candidate) => candidate.type === "add"), false);
  assert.equal(reply.actions.some((candidate) => candidate.type === "catalog"), false);
  assert.equal(reply.actions.some((candidate) => candidate.type === "creative"), false);
  return action;
}

test("ten agents sit on the bench", () => {
  assert.equal(ROSTER.length, 10);
  assert.ok(ROSTER.some((a) => a.model === "fable" && a.role === "generation"));
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
  assert.equal(routeAgent("generate a lamp").id, "creative");
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
  "round-table prompts generate editable geometry without a catalog part",
  withoutHosted(async () => {
    for (const message of ["make a round table", "circular top with one central leg"]) {
      const project = emptyProject();
      const reply = await chat(message, { project });
      assert.equal(reply.backend, "local-steward");
      assertGeneratedRoundTable(reply);
      assert.deepEqual(project.pieces, []);
      assert.match(reply.text, /^Generated editable 3D:/);
      assert.doesNotMatch(reply.text, /spawn|on the shelf|LACK|Creative staged/i);
    }
  }),
);

test(
  "generate it reuses recent circular-table context",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("generate it", {
      project,
      history: [
        { role: "user", content: "I want a circular top table" },
        { role: "assistant", content: "A single central pedestal will keep the form clean." },
      ],
    });
    assertGeneratedRoundTable(reply);
    assert.deepEqual(project.pieces, []);
  }),
);

test("generated round-table mesh becomes actual colored triangle geometry", () => {
  const reply = planCreativeActions("build a 900 mm diameter round table with one central leg");
  const action = assertGeneratedRoundTable(reply);
  const geometry = buildAiMeshGeometry(action.mesh);
  assert.ok(geometry.positions instanceof Float32Array);
  assert.ok(geometry.colors instanceof Float32Array);
  assert.ok(geometry.triangleCount > 100);
  assert.deepEqual(geometry.dimensionsMm, { x: 900, y: 900, z: 740 });
});

test(
  "put four legs generates four editable bodies instead of LACK parts",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("put four legs", { project });
    const mesh = reply.actions.find((action) => action.type === "mesh");
    assert.ok(mesh);
    assert.equal(mesh.mesh.components.length, 4);
    assert.ok(mesh.mesh.components.every((body) => /^Leg \d+$/.test(body.name)));
    assert.equal(reply.actions.some((action) => action.partId), false);
    assert.deepEqual(project.pieces, []);
    assert.doesNotMatch(reply.text, /arduino|firmware|sketch/i);
  }),
);

test(
  "generate a lamp emits lamp geometry, not a catalog table or electronics",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("generate a lamp", { project });
    const mesh = reply.actions.find((action) => action.type === "mesh");
    assert.ok(mesh);
    assert.deepEqual(mesh.mesh.components.map((body) => body.name), ["Base", "Stem", "Shade"]);
    assert.deepEqual(project.pieces, []);
    assert.equal(reply.actions.some((a) => a.type === "add" || a.type === "add_part"), false);
    assert.equal(reply.actions.some((a) => a.type === "isolate"), false);
    assert.doesNotMatch(reply.text, /arduino|nano|led|firmware/i);
  }),
);

test("chat reads part and step from scene context", async () => {
  const merged = mergeChatContext({
    scene: { partId: "lack-top", step: 4, interface: "watch", product: "LACK" },
  });
  assert.equal(merged.partId, "lack-top");
  assert.equal(merged.step, 4);
  assert.match(describeScene(merged.scene), /Watch step 4/);
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const reply = await chat("label it support", {
      scene: { partId: "lack-top", mode: "lab", lab: "desk" },
    });
    assert.ok(reply.actions.some((a) => a.type === "label" && a.partId === "lack-top" && a.label === "support"));
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

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

test("creative desk plans mesh, camera, label, and isolate actions", () => {
  const lamp = planCreativeActions("generate a lamp");
  assert.ok(lamp.actions.some((a) => a.type === "mesh"));
  assert.equal(lamp.actions.some((a) => a.type === "add"), false);
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

test("quick assembly questions use real GLiNER 2 analysis and current-guide grounding", async () => {
  assert.equal(shouldEscalate("which tool for this step?"), false);
  assert.equal(shouldEscalate("I am stuck on step 4"), false);
  assert.equal(shouldEscalate("fix the stripped insert and regenerate a clearer film for step 4"), true);
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    let request;
    const quick = await chat("which tool do I need?", {
      step: 4,
      guide: {
        title: "Custom shelf",
        steps: [
          {
            number: 4,
            body: "Fasten the rail to the wall.",
            toolRequired: "screwdriver",
            partsUsed: ["rail"],
            warnings: [],
          },
        ],
      },
      glinerInfer: async (value) => {
        request = value;
        return { guide_question: [{ step_number: "4", requested_detail: "tool" }] };
      },
    });
    assert.equal(request.operation, "extract_json");
    assert.equal(quick.backend, "gliner2:fastino/gliner2-base-v1");
    assert.equal(quick.gliner2.status, "ok");
    assert.match(quick.text, /screwdriver/);
    assert.deepEqual(quick.grounding.stepNumbers, [4]);
    assert.equal(quick.escalated, false);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("guide questions expose a visible local fallback when GLiNER 2 fails", async () => {
  const reply = await chat("which tool for step 2?", {
    step: 2,
    guide: {
      title: "Custom crate",
      steps: [
        {
          number: 2,
          body: "Fasten the side.",
          toolRequired: "hex key",
          partsUsed: [],
          warnings: [],
        },
      ],
    },
    glinerInfer: async () => {
      throw new Error("sidecar offline");
    },
  });
  assert.equal(reply.backend, "local-guide-fallback");
  assert.equal(reply.gliner2.status, "unavailable");
  assert.match(reply.text, /GLiNER 2 unavailable/);
  assert.match(reply.text, /hex key/);
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

test("hosted path answers open questions; shop creates stay on the local steward", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-hosted";
  try {
    let hostedCalls = 0;
    const fetchFn = async () => {
      hostedCalls += 1;
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  text: "A light oak foil keeps a north-facing lounge from going cold.",
                  actions: [{ type: "camera", az: 40, el: 30 }],
                }),
              },
            },
          ],
        }),
      };
    };

    const project = emptyProject();
    const created = await chat("add a lack table", {
      project,
      fetchFn: async () => {
        throw new Error("hosted should not run for shop creates");
      },
    });
    assert.equal(created.backend, "local-steward");
    assert.equal(created.actions.filter((a) => a.type === "add").length, 5);
    assert.equal(project.pieces.filter((p) => p.partId === "lack-leg").length, 4);
    assert.doesNotMatch(created.text, /arduino|firmware|sketch/i);

    const open = await chat("what wood tone suits a north-facing lounge?", { fetchFn });
    assert.match(open.backend, /^hosted:/);
    assert.ok(open.actions.some((a) => a.type === "camera"));
    assert.equal(hostedCalls, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("hosted AI can author a compound bench mesh without catalog ids", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-hosted";
  try {
    let request;
    const reply = await chat("build a round table with one central leg", {
      project: emptyProject(),
      fetchFn: async (_url, options) => {
        request = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: "Generated the requested editable 3D mesh.",
                    actions: [
                      {
                        type: "mesh",
                        mesh: {
                          name: "AI pedestal table",
                          components: [
                            { name: "Circular top", shape: "cylinder", sizeMm: [1000, 45, 1000], positionMm: [0, 717.5, 0] },
                            { name: "Central leg", shape: "cylinder", sizeMm: [150, 695, 150], positionMm: [0, 347.5, 0] },
                          ],
                        },
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        };
      },
    });
    assert.match(reply.backend, /^hosted:/);
    assert.equal(reply.actions.length, 1);
    assert.equal(reply.actions[0].type, "mesh");
    assert.equal(reply.actions[0].mesh.components.length, 2);
    assert.equal(reply.actions.some((action) => action.partId), false);
    assert.match(request.messages[0].content, /explicit indexed triangles|mesh requires verticesMm/);
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
        lab: "house",
        pieceCount: 1,
        selected: { name: "LACK table top", dimsMm: { x: 550, y: 50, z: 550 } },
      },
      photoName: "view.jpg",
    });
    assert.equal(reply.backend, "local-steward");
    assert.match(reply.text, /LACK table top/);
    assert.match(reply.text, /house mode/);
  }),
);

test("scan and generate stay on existing shop actions", () => {
  const scan = planCreativeActions("scan this object");
  assert.equal(scan.handles, true);
  assert.ok(scan.actions.some((a) => a.type === "scan"));
  const lamp = planCreativeActions("generate a lamp");
  assert.ok(lamp.actions.some((a) => a.type === "mesh"));
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

test(
  "room prompts use the same editable 3D generation pipeline",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("generate a 4.8 x 3.6 m warm living room corner with a table", { project });
    const mesh = reply.actions.find((action) => action.type === "mesh");
    assert.equal(mesh.mesh.kind, "scene");
    assert.ok(mesh.mesh.components.some((body) => body.name === "Floor"));
    assert.ok(mesh.mesh.components.some((body) => /Custom table · Tabletop/.test(body.name)));
    assert.equal(reply.actions.some((action) => action.type === "room"), false);
    assert.deepEqual(project.pieces, []);
    assert.match(reply.text, /^Generated editable 3D:/);
  }),
);

test(
  "lack-like modeling emits an unbranded mesh instead of a catalog placeholder",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("model a lack-like table", { project });
    assert.ok(reply.actions.some((action) => action.type === "mesh"));
    assert.equal(reply.actions.some((action) => action.type === "add"), false);
    assert.doesNotMatch(reply.text, /\bIKEA\b|\bLACK\b/);
    assert.deepEqual(project.pieces, []);
  }),
);

test(
  "hosted 3D generation uses the same mesh action for a room corner",
  async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-hosted";
    try {
      const project = emptyProject();
      const reply = await chat("generate a warm room corner", {
        project,
        fetchFn: async () => ({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  text: "Generated editable 3D.",
                  actions: [{
                    type: "mesh",
                    mesh: {
                      name: "Room corner",
                      kind: "scene",
                      components: [
                        { name: "Floor", shape: "box", sizeMm: [4000, 40, 3500], positionMm: [0, 20, 0] },
                        { name: "Wall", shape: "box", sizeMm: [4000, 2700, 80], positionMm: [0, 1350, 1750] },
                      ],
                    },
                  }],
                }),
              },
            }],
          }),
        }),
      });
      assert.match(reply.backend, /^hosted:/);
      assert.equal(reply.actions.length, 1);
      assert.equal(reply.actions[0].type, "mesh");
      assert.equal(reply.actions[0].mesh.kind, "scene");
      assert.deepEqual(project.pieces, []);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  },
);

test(
  "make a table emits a compound mesh rather than a square placeholder",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("make a table", { project });
    assert.equal(reply.backend, "local-steward");
    const mesh = reply.actions.find((action) => action.type === "mesh");
    assert.ok(mesh);
    assert.equal(mesh.mesh.components.length, 5);
    assert.deepEqual(project.pieces, []);
  }),
);

test("optional furniture desks include CAD, 3D generation and assembly", async () => {
  assert.equal(isFurnitureBuildAsk("build this furniture"), true);
  assert.equal(isFurnitureBuildAsk("add a lack table"), false);
  const desks = furnitureBuildDesks();
  assert.deepEqual(desks.map((desk) => desk.id), ["cad", "creative", "assembler"]);
  assert.match(manyAgentsNote(desks), /Many agents: CAD, 3D Generator, Assembler/);
  assert.match(String(runFurnitureDesks), /Promise\.all/);
});

test(
  "chat build this furniture stays on the single 3D generation pipeline",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("build this furniture", { project });
    assert.equal(reply.manyAgents, undefined);
    assert.equal(reply.actions.length, 1);
    assert.equal(reply.actions[0].type, "mesh");
    assert.equal(reply.actions[0].partId, undefined);
    assert.match(reply.text, /^Generated editable 3D:/);
    assert.deepEqual(project.pieces, []);
    const parallel = await runFurnitureDesks("build this furniture", { project: emptyProject() });
    assert.equal(parallel.manyAgents, true);
  }),
);

test("hosted failure still answers from the local steward", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-hosted";
  try {
    const reply = await chat("what wood tone suits a north-facing lounge?", {
      fetchFn: async () => ({
        ok: false,
        json: async () => ({ error: { message: "nope" } }),
      }),
    });
    assert.equal(reply.backend, "local-steward");
    assert.ok(String(reply.text || "").length > 0);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

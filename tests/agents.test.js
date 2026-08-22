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

function assertRoundTableAction(reply) {
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
  "round-table descriptions spawn circular geometry instead of catalog or square-table results",
  withoutHosted(async () => {
    for (const message of ["make a round table", "circular top with one central leg"]) {
      const project = emptyProject();
      const reply = await chat(message, { project });
      assert.equal(reply.backend, "local-steward");
      assertRoundTableAction(reply);
      assert.deepEqual(project.pieces, []);
      assert.doesNotMatch(reply.text, /on the shelf|LACK|Creative staged/i);
    }
  }),
);

test(
  "spawn it reuses recent circular-table context",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("spawn it", {
      project,
      history: [
        { role: "user", content: "I want a circular top table" },
        { role: "assistant", content: "A single central pedestal will keep the form clean." },
      ],
    });
    assertRoundTableAction(reply);
    assert.deepEqual(project.pieces, []);
  }),
);

test("round-table mesh action becomes actual colored triangle geometry", () => {
  const reply = planCreativeActions("build a 900 mm diameter round table with one central leg");
  const action = assertRoundTableAction(reply);
  const geometry = buildAiMeshGeometry(action.mesh);
  assert.ok(geometry.positions instanceof Float32Array);
  assert.ok(geometry.colors instanceof Float32Array);
  assert.ok(geometry.triangleCount > 100);
  assert.deepEqual(geometry.dimensionsMm, { x: 900, y: 900, z: 740 });
});

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

test(
  "local steward creates a room mesh action and generic table placeholder",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("make a warm living room with a table", {
      project,
      room: { widthM: 4.8, depthM: 3.6 },
    });
    const room = reply.actions.find((action) => action.type === "room");
    const table = reply.actions.find(
      (action) => action.type === "add" && action.partId === "generic-side-table",
    );
    assert.equal(room.room.kind, "living room");
    assert.equal(room.room.widthM, 4.8);
    assert.equal(room.room.depthM, 3.6);
    assert.ok(table);
    assert.equal(table.applied, true);
    assert.equal(project.pieces.length, 1);
    assert.equal(project.pieces[0].partId, "generic-side-table");
    assert.match(reply.text, /^Using 550×550×450 mm side-table proportions/);
  }),
);

test(
  "lack-like modeling copy gives specs before placing an unbranded placeholder",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("model a lack-like table", { project });
    assert.match(reply.text, /^Using 550×550×450 mm side-table proportions/);
    assert.doesNotMatch(reply.text, /\bIKEA\b|\bLACK\b/);
    assert.deepEqual(project.pieces.map((piece) => piece.partId), ["generic-side-table"]);
  }),
);

test(
  "local steward creates a room and table even when a hosted key is set",
  async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-hosted";
    try {
      const project = emptyProject();
      const reply = await chat("make a warm living room with a table", {
        project,
        room: { widthM: 4.8, depthM: 3.6 },
        fetchFn: async () => {
          throw new Error("hosted should not run for room and table creates");
        },
      });
      assert.equal(reply.backend, "local-steward");
      assert.ok(reply.actions.some((action) => action.type === "room"));
      assert.ok(reply.actions.some((action) => action.type === "add" && action.partId === "generic-side-table"));
      assert.equal(project.pieces[0].partId, "generic-side-table");
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  },
);

test(
  "make a table places the generic side-table placeholder",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("make a table", { project });
    assert.equal(reply.backend, "local-steward");
    assert.ok(reply.actions.some((action) => action.type === "add" && action.partId === "generic-side-table"));
    assert.deepEqual(project.pieces.map((piece) => piece.partId), ["generic-side-table"]);
  }),
);

test("build this furniture runs CAD, Creative and Assembler in parallel", async () => {
  assert.equal(isFurnitureBuildAsk("build this furniture"), true);
  assert.equal(isFurnitureBuildAsk("add a lack table"), false);
  const desks = furnitureBuildDesks();
  assert.deepEqual(desks.map((desk) => desk.id), ["cad", "creative", "assembler"]);
  assert.match(manyAgentsNote(desks), /Many agents: CAD, Creative, Assembler/);
  assert.match(String(runFurnitureDesks), /Promise\.all/);
});

test(
  "chat build this furniture notes many agents and places a table",
  withoutHosted(async () => {
    const project = emptyProject();
    const reply = await chat("build this furniture", { project });
    assert.equal(reply.manyAgents, true);
    assert.equal(reply.from, "many-agents");
    assert.match(reply.text, /Many agents: CAD, Creative, Assembler ran in parallel/);
    assert.ok(reply.desks.some((desk) => desk.id === "cad"));
    assert.ok(reply.desks.some((desk) => desk.id === "creative"));
    assert.ok(reply.desks.some((desk) => desk.id === "assembler"));
    assert.ok(reply.actions.some((action) => action.type === "add" && action.partId === "generic-side-table"));
    assert.ok(reply.actions.some((action) => action.type === "cad"));
    assert.ok(reply.actions.some((action) => action.type === "ikeafy"));
    assert.equal(project.pieces[0].partId, "generic-side-table");
    assert.equal(project.labTools.fusion.kind, "parametric-model");
    assert.equal(project.labTools.blender.kind, "scene");
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

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyInstructions,
  attachBroken,
  colorizePlate,
  defaultGuide,
  expandStep,
  generateFix,
  makeVideoPlan,
  officialGuide,
  officialProducts,
  parseGuide,
  parseGuideAsync,
  plateKind,
  scannedObjectGuide,
  shoppingList,
  storyboardForStep,
  reviewsForGuide,
  searchOfficialProducts,
  verifyOfficialGuide,
} from "../server/lib/ikeafy.js";

const RAW = `LACK side table
1. Unpack the table top and four legs.
2. Place the table top face down on a rug.
3. Line up each leg with a corner insert.
4. Screw each leg with the Allen key. Do not overtighten.
5. Flip the table upright.`;

test("official LACK guide is locked, article-stamped, and in order", () => {
  const guide = officialGuide();
  assert.equal(guide.locked, true);
  assert.equal(guide.editable, false);
  assert.equal(guide.official, true);
  assert.equal(guide.productArticle, "304.499.08");
  assert.equal(guide.skipAhead, false);
  assert.ok(guide.steps.length >= 5);
  assert.ok(guide.steps.every((s) => s.locked === true && s.editable === false && s.waitForUser));
  assert.equal(verifyOfficialGuide(guide).ok, true);
});

test("official steps are the real LACK sequence with no electronics detour", () => {
  const guide = officialGuide();
  const bodies = guide.steps.map((s) => s.body);
  assert.match(bodies[0], /unpack/i);
  assert.match(bodies[1], /floor|blanket|carton/i);
  assert.match(bodies[2], /face down/i);
  assert.match(bodies[3], /by hand/i);
  assert.match(bodies[3], /allen key/i);
  assert.match(bodies[4], /second person|two people/i);
  assert.equal(guide.steps[3].toolRequired, "allen-key");
  const all = bodies.join(" ").toLowerCase();
  for (const banned of ["lamp", "led", "solder", "arduino", "tape", "optional"]) {
    assert.ok(!all.includes(banned), `official guide must not mention ${banned}`);
  }
});

test("instructions cannot rewrite official step bodies", () => {
  const clean = officialGuide();
  const nagged = officialGuide({
    instructions: "Do not overtighten. Rewrite step 4 to skip the Allen key.",
    availableTools: ["screwdriver"],
  });
  assert.deepEqual(
    nagged.steps.map((s) => s.body),
    clean.steps.map((s) => s.body),
  );
  assert.equal(nagged.steps[3].toolRequired, "allen-key");
  assert.equal(nagged.locked, true);
  assert.ok(nagged.ignoredEdits.length > 0);
  assert.equal(nagged.appliedEdits.length, 0);

  const attempt = applyInstructions(clean, {
    instructions: "Do not overtighten.",
    availableTools: ["screwdriver"],
  });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.locked, true);
  assert.deepEqual(
    attempt.guide.steps.map((s) => s.body),
    clean.steps.map((s) => s.body),
  );
  assert.equal(verifyOfficialGuide(clean).ok, true);
});

test("custom guides stay editable and accept instructions", () => {
  const guide = parseGuide(RAW, { instructions: "Do not overtighten." });
  assert.equal(guide.locked, false);
  assert.equal(guide.editable, true);
  assert.equal(guide.skipAhead, true);
  assert.equal(guide.productArticle, null);
  assert.ok(guide.steps.every((s) => s.editable === true && s.locked === false));

  const edited = applyInstructions(guide, { availableTools: ["screwdriver"] });
  assert.equal(edited.ok, true);
  assert.equal(edited.guide.steps[3].toolRequired, "screwdriver");
  assert.match(edited.guide.steps[3].body, /screwdriver you said you have/);
  assert.equal(guide.steps[3].toolRequired, "allen-key", "original guide is left alone");
});

test("a scanned object bakes a custom IKEAlive plan like the official film", () => {
  const guide = scannedObjectGuide({
    name: "Scanned object 1",
    dimsMm: { x: 400, y: 300, z: 420 },
  });
  assert.equal(guide.official, false);
  assert.equal(guide.locked, false);
  assert.equal(guide.source, "scan");
  assert.ok(guide.steps.length >= 5);
  assert.match(guide.raw, /400 × 300 × 420 mm/);
  assert.match(guide.raw, /specs needed for an exact IKEA article/i);
  assert.equal(plateKind(guide, guide.steps[0]), "table");
  assert.equal(guide.steps[0].number, 1);
  assert.equal(guide.steps[4].number, 5);
});

test("a square 550 mm scan uses table assembly language", () => {
  const guide = scannedObjectGuide({ name: "Test table", dimsMm: { x: 550, y: 550, z: 450 } });
  assert.match(guide.steps[0].body, /top and four supports/i);
  assert.match(guide.steps[2].body, /face down/i);
  assert.equal(plateKind(guide, guide.steps[3]), "table");
});

test("official products list the LACK side table", () => {
  const products = officialProducts();
  const lack = products.find((p) => p.article === "304.499.08");
  assert.ok(lack, "LACK side table is an official product");
  assert.match(lack.name, /LACK/);
  assert.equal(lack.partId, "lack-table");
  assert.equal(lack.unlocked, true);
  assert.equal(officialGuide(lack.article).productArticle, lack.article);
  assert.equal(officialGuide("000.000.00").ok, false);
});

test("KALLAX, BILLY and MALM sit locked in the catalog until transcribed", () => {
  const products = officialProducts();
  for (const name of ["KALLAX", "BILLY", "MALM"]) {
    const hit = products.find((p) => p.name.includes(name));
    assert.ok(hit, `${name} should be searchable`);
    assert.equal(hit.unlocked, false);
    assert.equal(hit.locked, true);
  }
  const kallax = officialGuide("802.758.87");
  assert.equal(kallax.ok, false);
  assert.equal(kallax.locked, true);
  assert.match(kallax.reason, /not transcribed/i);
  assert.equal(searchOfficialProducts("billy")[0].name.includes("BILLY"), true);
});

test("locked guide keeps the rest of the pipeline working", () => {
  const guide = defaultGuide();
  assert.equal(guide.locked, true);
  const film = makeVideoPlan(guide);
  assert.equal(film.skipAhead, false);
  assert.equal(film.locked, true);
  assert.ok(storyboardForStep(guide, 4).length >= 3);
  assert.ok(colorizePlate(guide.steps[3]).fills.length > 0);
  assert.equal(expandStep(guide, 4).ok, true);
  assert.equal(reviewsForGuide(guide).length, guide.steps.length);
  assert.equal(attachBroken({ guide, stepNumber: 4, note: "insert spun" }).ok, true);
  assert.ok(shoppingList(guide).lines.length > 0);
});

test("parses numbered steps into JSON", () => {
  const guide = parseGuide(RAW, {
    instructions: "Do not overtighten. I have an allen-key.",
    availableTools: ["allen-key"],
  });
  assert.equal(guide.steps.length, 5);
  assert.equal(guide.steps[3].action, "fasten");
  assert.equal(guide.steps[3].toolRequired, "allen-key");
  assert.ok(guide.steps[3].partsUsed.includes("lack-leg"));
  assert.ok(guide.steps[3].body.includes("Stop when the shoulder"));
});

test("video plan is one continuous theme and waits", () => {
  const guide = parseGuide(RAW);
  const film = makeVideoPlan(guide);
  assert.equal(film.continuous, true);
  assert.equal(film.theme.setting, "birch workshop");
  assert.ok(film.steps.every((s) => s.waitForUser && s.frames.length >= 3));
});

test("colorize uses catalog fills", () => {
  const guide = parseGuide(RAW);
  const plate = colorizePlate(guide.steps[0]);
  assert.equal(plate.to, "catalog-real");
  assert.ok(plate.fills.some((f) => f.color.startsWith("#")));
});

test("expand and broken part attach to a step", () => {
  const guide = parseGuide(RAW);
  const exp = expandStep(guide, 4, { stuckNote: "insert is spinning" });
  assert.match(exp.step.detail, /insert spinning|snug|Particleboard/i);
  const broken = attachBroken({ guide, stepNumber: 4, note: "corner insert ripped" });
  assert.equal(broken.ok, true);
  assert.ok(broken.spare.id);
  const fix = generateFix("r1");
  assert.match(fix.fix, /glue|M6/i);
});

test("empty custom input is not the official LACK table", () => {
  const guide = parseGuide("");
  assert.equal(guide.steps.length, 0);
  assert.equal(guide.locked, false);
  assert.doesNotMatch(guide.title, /LACK/i);
  assert.equal(guide.raw, "");
});

test("custom numbered text keeps its own steps", () => {
  const guide = parseGuide(`Wall shelf\n1. Hang the rail on the two wall plugs.\n2. Slot the shelf onto the rail.`);
  assert.equal(guide.steps.length, 2);
  assert.match(guide.steps[0].body, /rail/);
  assert.ok(!guide.steps.some((step) => /table top face down/i.test(step.body)));
  assert.ok(!guide.bom.included.some((line) => line.id === "allen-key"));
  assert.equal(plateKind(guide, guide.steps[0]), "bookcase");
  assert.ok(reviewsForGuide(guide).every((row) => row.reviews.length === 0));
});

test("a BILLY-style custom guide does not become the LACK table", () => {
  const guide = parseGuide(
    `BILLY bookcase\n1. Attach a side panel to the base with dowels.\n2. Slide in the shelves.\n3. Fasten the top with screws.`,
  );
  assert.match(guide.title, /BILLY/i);
  assert.doesNotMatch(guide.title, /LACK/i);
  assert.equal(plateKind(guide, guide.steps[0]), "bookcase");
  assert.equal(storyboardForStep(guide, 1)[0].kind, "bookcase");
  assert.ok(reviewsForGuide(guide).every((row) => row.reviews.length === 0));
});

test("parseGuideAsync visibly uses the local parser when GLiNER 2 returns no steps", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const guide = await parseGuideAsync(
      `Crate\n1. Screw the side onto the base.`,
      {},
      { glinerInfer: async () => ({}) },
    );
    assert.equal(guide.parser, "local-parser");
    assert.equal(guide.steps.length, 1);
    assert.match(guide.steps[0].body, /Screw the side/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("parseGuideAsync surfaces an actionable error when GLiNER 2 runtime fails on PDF text", async () => {
  const guide = await parseGuideAsync(
    `Crate\n1. Screw the side onto the base.`,
    {},
    {
      requireGliner: true,
      glinerInfer: async () => {
        const error = new Error("GLiNER 2 local runtime is unavailable (sidecar exited). Run `npm run setup:gliner2` from the project root, then restart IKEAlive.");
        error.name = "Gliner2RuntimeError";
        error.code = "GLINER2_RUNTIME_UNAVAILABLE";
        throw error;
      },
    },
  );
  assert.equal(guide.steps.length, 0);
  assert.match(guide.parseError, /setup:gliner2/);
  assert.doesNotMatch(guide.parser, /gliner2/);
});

test("parseGuideAsync keeps a local fallback for non-PDF text when GLiNER 2 is down", async () => {
  const guide = await parseGuideAsync(
    `Crate\n1. Screw the side onto the base.`,
    {},
    {
      glinerInfer: async () => {
        const error = new Error("GLiNER 2 local runtime is unavailable (sidecar exited). Run `npm run setup:gliner2`.");
        error.name = "Gliner2RuntimeError";
        error.code = "GLINER2_RUNTIME_UNAVAILABLE";
        throw error;
      },
    },
  );
  assert.equal(guide.parser, "local-parser");
  assert.equal(guide.steps.length, 1);
  assert.match(guide.parseWarning, /setup:gliner2|unavailable/i);
});

test("drawing PDF still tries fal when text-side GLiNER fails but fal+normalize succeed", async () => {
  let falCalls = 0;
  let glinerCalls = 0;
  const guide = await parseGuideAsync(
    "BILLY.pdf: 16 pages; the first 8 plates were read.",
    { images: [{ name: "BILLY p1", dataUrl: "data:image/jpeg;base64,abc" }] },
    {
      falVisionFn: async () => {
        falCalls += 1;
        return {
          title: "BILLY bookcase",
          steps: [{ number: 1, body: "Fasten side panel 1 to base 2 with dowels.", action: "fasten" }],
        };
      },
      glinerInfer: async ({ text }) => {
        glinerCalls += 1;
        if (glinerCalls === 1) {
          const error = new Error("temporary extract failure");
          error.name = "Gliner2RuntimeError";
          error.code = "GLINER2_INFERENCE_ERROR";
          throw error;
        }
        if (!String(text).includes("Fasten side panel 1")) return {};
        return {
          assembly_guide: [{ title: "BILLY bookcase" }],
          assembly_step: [
            {
              sequence_number: "1",
              instruction: "Fasten side panel 1 to base 2 with dowels.",
              action: "fasten",
              parts: ["side panel 1", "base 2", "dowels"],
              tool: "",
              warnings: [],
            },
          ],
        };
      },
    },
  );
  assert.equal(falCalls, 1);
  assert.ok(glinerCalls >= 2);
  assert.equal(guide.parser, "gliner2:fastino/gliner2-base-v1+fal-plate-vision");
  assert.equal(guide.steps.length, 1);
});

test("text-rich PDF uses mocked GLiNER 2 without fal plate vision", async () => {
  let request;
  const guide = await parseGuideAsync(
    "shelf.pdf: 1 page.\nPage 1: Wall shelf. Step 1. Hang the rail with two wall plugs and check the wall type.",
    { images: [{ name: "shelf p1", dataUrl: "data:image/jpeg;base64,abc" }] },
    {
      glinerInfer: async (value) => {
        request = value;
        return {
          assembly_guide: [{ title: "Wall shelf" }],
          assembly_step: [
            {
              sequence_number: "1",
              instruction: "Hang the rail with two wall plugs.",
              action: "place",
              parts: ["rail", "wall plugs"],
              tool: "screwdriver",
              warnings: ["Check the wall type"],
            },
          ],
        };
      },
      falVisionFn: async () => assert.fail("fal vision must not run when GLiNER 2 has grounded PDF steps"),
    },
  );
  assert.equal(request.operation, "extract_json");
  assert.ok(request.schema.assembly_step);
  assert.equal(guide.parser, "gliner2:fastino/gliner2-base-v1");
  assert.equal(guide.title, "Wall shelf");
  assert.equal(guide.steps[0].toolRequired, "screwdriver");
  assert.deepEqual(guide.steps[0].warnings, ["Check the wall type"]);
  assert.equal(guide.locked, false);
});

test("PDF plates are not parsed as plain text without fal vision", async () => {
  const previous = process.env.FAL_KEY;
  delete process.env.FAL_KEY;
  try {
    const images = [{ name: "billy-1.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,abc" }];
    const guide = await parseGuideAsync(
      "%PDF-1.4 stream junk from a drawing booklet",
      { images },
      { glinerInfer: async () => ({}) },
    );
    assert.equal(guide.steps.length, 0);
    assert.equal(
      guide.parseError,
      "GLiNER 2 found insufficient extractable PDF text. Set FAL_KEY so fal plate vision can read the drawing plates.",
    );
    assert.doesNotMatch(guide.title, /LACK/i);
    assert.doesNotMatch(String(guide.raw || ""), /stream junk/);
  } finally {
    if (previous === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previous;
  }
});

test("PDF plate vision surfaces a safe fal failure", async () => {
  const guide = await parseGuideAsync(
    "BILLY.pdf: 16 pages; the first 8 plates were read.",
    { images: [{ name: "BILLY p1", dataUrl: "data:image/jpeg;base64,abc" }] },
    {
      glinerInfer: async () => ({}),
      falVisionFn: async () => {
        throw new Error("fal plate vision failed (HTTP 400): model cannot process images");
      },
    },
  );
  assert.equal(guide.steps.length, 0);
  assert.match(guide.parseError, /HTTP 400/);
  assert.match(guide.parseError, /cannot process images/);
  assert.doesNotMatch(guide.parseError, /base64/);
});

test("drawing PDF uses fal vision then GLiNER 2 normalization without OpenAI", async () => {
  const previousOpenAi = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let falRequest;
  let glinerCalls = 0;
  try {
    const guide = await parseGuideAsync(
      "BILLY.pdf: 16 pages; the first 8 plates were read.",
      { images: [{ name: "BILLY p1", dataUrl: "data:image/jpeg;base64,abc" }] },
      {
        falVisionFn: async (request) => {
          falRequest = request;
          return {
            title: "BILLY bookcase",
            steps: [{ number: 1, body: "Fasten side panel 1 to base 2 with dowels.", action: "fasten" }],
          };
        },
        glinerInfer: async ({ text }) => {
          glinerCalls += 1;
          if (!String(text).includes("Fasten side panel 1")) return {};
          return {
            assembly_guide: [{ title: "BILLY bookcase" }],
            assembly_step: [
              {
                sequence_number: "1",
                instruction: "Fasten side panel 1 to base 2 with dowels.",
                action: "fasten",
                parts: ["side panel 1", "base 2", "dowels"],
                tool: "",
                warnings: [],
              },
            ],
          };
        },
      },
    );
    assert.equal(guide.title, "BILLY bookcase");
    assert.equal(guide.steps.length, 1);
    assert.equal(guide.parser, "gliner2:fastino/gliner2-base-v1+fal-plate-vision");
    assert.ok(glinerCalls >= 2, "GLiNER runs on extracted PDF text and fal vision output");
    assert.equal(falRequest.endpoint, "https://fal.run/openrouter/router/vision");
    assert.equal(falRequest.model, "google/gemini-2.5-flash");
    assert.equal(falRequest.image_urls.length, 1);
    assert.doesNotMatch(guide.title, /LACK/i);
  } finally {
    if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAi;
  }
});

test("fal vision structured JSON is used when GLiNER normalize returns empty steps", async () => {
  let falCalls = 0;
  const guide = await parseGuideAsync(
    "ALHULT.pdf: drawing plates with little extractable text.",
    { images: [{ name: "ALHULT p1", dataUrl: "data:image/jpeg;base64,abc" }] },
    {
      falVisionFn: async () => {
        falCalls += 1;
        return {
          title: "ALHULT cabinet",
          steps: [
            { number: 1, action: "place", body: "Place side panel A against base B." },
            { number: 2, action: "fasten", body: "Fasten with screws 100001.", partsUsed: ["100001"] },
          ],
        };
      },
      // Mimic the production failure: GLiNER returns schema keys but no usable instruction bodies.
      glinerInfer: async () => ({
        assembly_guide: [{ title: "ALHULT cabinet" }],
        assembly_step: [{ sequence_number: "1", instruction: "", action: "", parts: [], tool: "", warnings: [] }],
      }),
    },
  );
  assert.equal(falCalls, 1);
  assert.equal(guide.parser, "fal-plate-vision");
  assert.equal(guide.title, "ALHULT cabinet");
  assert.equal(guide.steps.length, 2);
  assert.match(guide.steps[0].body, /side panel A/i);
  assert.match(guide.steps[1].body, /screws 100001/i);
  assert.equal(guide.parseError, undefined);
});

test("fal vision still yields steps when GLiNER sidecar is unavailable", async () => {
  const guide = await parseGuideAsync(
    "ALHULT.pdf: drawing only.",
    { images: [{ name: "ALHULT p1", dataUrl: "data:image/jpeg;base64,abc" }] },
    {
      falVisionFn: async () => ({
        title: "ALHULT",
        steps: [{ number: 1, body: "Attach the door hinge.", action: "fasten" }],
      }),
      glinerInfer: async () => {
        const error = new Error("GLiNER 2 local runtime is unavailable (sidecar exited).");
        error.name = "Gliner2RuntimeError";
        error.code = "GLINER2_RUNTIME_UNAVAILABLE";
        throw error;
      },
    },
  );
  assert.equal(guide.parser, "fal-plate-vision");
  assert.equal(guide.steps.length, 1);
  assert.match(guide.steps[0].body, /door hinge/i);
});

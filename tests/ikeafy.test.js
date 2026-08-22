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

test("parseGuideAsync stays local without an OpenAI key", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const guide = await parseGuideAsync(`Crate\n1. Screw the side onto the base.`);
    assert.equal(guide.parser, "local-gliner-standin");
    assert.equal(guide.steps.length, 1);
    assert.match(guide.steps[0].body, /Screw the side/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("parseGuideAsync uses the OpenAI result for this input, not LACK", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  let sent = "";
  const fetchFn = async (_url, init = {}) => {
    sent = String(init.body || "");
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Wall shelf",
                steps: [
                  {
                    number: 1,
                    action: "place",
                    body: "Hang the rail on the two wall plugs.",
                    partsUsed: [],
                    toolRequired: "screwdriver",
                    warnings: [],
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
  };
  try {
    const guide = await parseGuideAsync("Hang the rail on the two wall plugs.", {}, { fetchFn });
    assert.equal(guide.parser, "openai");
    assert.equal(guide.title, "Wall shelf");
    assert.equal(guide.steps.length, 1);
    assert.match(guide.steps[0].body, /rail/);
    assert.doesNotMatch(guide.title, /LACK/i);
    assert.match(sent, /Hang the rail on the two wall plugs/);
    assert.match(sent, /Do not invent a LACK table/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

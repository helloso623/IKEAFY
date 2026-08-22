import { bomFromIds, getPart, listParts, searchParts } from "./catalog.js";

const LACK_GUIDE = `LACK side table
1. Unpack the table top and four legs. Keep the Allen key from the bag.
2. Put a rug or the box lid on the floor. Place the table top face down.
3. Line up each leg with a metal insert in a corner.
4. Screw each leg in by hand, then snug with the Allen key. Do not overtighten.
5. Flip the table upright with a friend. Check it does not wobble.
6. Optional: tape cable runs under the top and add the lamp board.`;

const OFFICIAL_LACK_GUIDE = `LACK side table 55×55
1. Unpack the flat pack: one 55×55 cm table top, four legs, and the fittings bag with the Allen key. Count them against the parts list before you start.
2. Put the flattened carton or a blanket on the floor. You need about 1.2 m of clear space so the foil finish and your floor both survive.
3. Place the table top face down in the middle of the pad, underside up, with a corner insert visible at each corner.
4. Screw each leg into its corner insert by hand until the shoulder meets the top, then snug it with the Allen key. Do not overtighten — the insert strips out of the particleboard.
5. Flip the table upright with a second person, one of you at each side. Set it down and check that all four legs sit flat and the top does not rock.`;

const OFFICIAL_PRODUCTS = [
  {
    article: "304.499.08",
    name: "LACK side table",
    size: "55×55 cm, 45 cm high",
    partId: "lack-table",
    kit: "lack-kit",
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=LACK+side+table",
    guide: OFFICIAL_LACK_GUIDE,
    stepCount: 5,
    toolsIncluded: ["allen-key"],
    people: 2,
  },
];

const DEFAULT_OFFICIAL_ARTICLE = OFFICIAL_PRODUCTS[0].article;

const SAMPLE_REVIEWS = [
  {
    id: "r1",
    step: 4,
    stars: 2,
    author: "Sam",
    text: "The insert spun in the particleboard when I cranked the Allen key. Leg never got tight.",
    difficulty: "insert spin / stripped corner",
    sparePartId: "m6-screw",
    fix: "Back the leg out. Add a dab of wood glue or a longer M6. Let it cure before load.",
  },
  {
    id: "r2",
    step: 5,
    stars: 3,
    author: "Priya",
    text: "Flipping alone cracked the foil on one corner. Table also wobbles on my old floor.",
    difficulty: "solo flip / wobble on uneven floor",
    sparePartId: "lack-leg",
    fix: "Flip with two people. Shim the short leg or swap it. Felt pads help.",
  },
  {
    id: "r3",
    step: 2,
    stars: 4,
    author: "Lee",
    text: "Did this on hardwood and scratched the top. Use the box as a mat.",
    difficulty: "finish scratches",
    sparePartId: "lack-top",
    fix: "Always pad the face. A scratched top can be flipped if the underside is clean.",
  },
  {
    id: "r4",
    step: 6,
    stars: 5,
    author: "Noor",
    text: "Gaffer under the top holds the USB cable. Electrical tape peeled after a week.",
    difficulty: "tape peel on underside",
    sparePartId: "tape-gaffer",
    fix: "Use gaffer, not packing tape. Degrease the foil first.",
  },
];

const ACTION_WORDS = [
  ["unpack", "unpack"],
  ["place", "place"],
  ["put", "place"],
  ["line", "align"],
  ["screw", "fasten"],
  ["tighten", "fasten"],
  ["flip", "flip"],
  ["check", "inspect"],
  ["tape", "tape"],
  ["add", "install"],
  ["solder", "solder"],
  ["wire", "wire"],
];

function inferAction(text) {
  const lower = text.toLowerCase();
  for (const [needle, action] of ACTION_WORDS) {
    if (lower.includes(needle)) return action;
  }
  return "assemble";
}

function inferParts(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const part of listParts()) {
    const tokens = part.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (tokens.some((t) => lower.includes(t)) || lower.includes(part.id.replace(/-/g, " "))) {
      hits.push(part.id);
    }
  }
  if (/leg/.test(lower) && !hits.includes("lack-leg")) hits.push("lack-leg");
  if (/top|table/.test(lower) && !hits.includes("lack-top")) hits.push("lack-top");
  if (/allen/.test(lower) && !hits.includes("allen-key")) hits.push("allen-key");
  if (/tape/.test(lower) && !hits.includes("tape-gaffer")) hits.push("tape-gaffer");
  return [...new Set(hits)];
}

function inferTool(text, availableTools = []) {
  const lower = text.toLowerCase();
  if (/allen|hex/.test(lower)) return "allen-key";
  if (/screw driver|phillips/.test(lower)) return "screwdriver";
  if (/solder/.test(lower)) return "soldering-iron";
  if (/meter|volt/.test(lower)) return "multimeter";
  if (availableTools.length && /tool/.test(lower)) return availableTools[0];
  return null;
}

function cloneStep(step) {
  return { ...step, partsUsed: [...step.partsUsed], warnings: [...step.warnings], image: { ...step.image } };
}

function editStepsFromInstructions(steps, { instructions = "", availableTools = [] } = {}) {
  const edits = [];
  const extra = String(instructions).toLowerCase();
  if (extra.includes("no overtighten") || extra.includes("do not overtighten")) {
    const fasten = steps.find((s) => s.action === "fasten");
    if (fasten) {
      fasten.body += " Stop when the shoulder meets the insert — no extra crank.";
      edits.push({ kind: "torque-note", step: fasten.number });
    }
  }
  if (availableTools.length) {
    for (const step of steps) {
      if (step.toolRequired && !availableTools.includes(step.toolRequired)) {
        step.toolRequired = availableTools[0];
        step.body += ` Use the ${availableTools[0]} you said you have.`;
        edits.push({ kind: "tool-swap", step: step.number, tool: availableTools[0] });
      }
    }
  }
  return edits;
}

export function parseGuide(
  raw,
  { instructions = "", availableTools = [], official = false, productArticle = null } = {},
) {
  const locked = Boolean(official);
  const text = String(raw || "").trim() || LACK_GUIDE;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = lines[0].replace(/^\d+[\.)]\s*/, "");
  const stepLines = lines.filter((l) => /^\d+[\.)]/.test(l));
  const fallback = lines.slice(1);
  const source = stepLines.length ? stepLines : fallback;
  const steps = source.map((line, i) => {
    const body = line.replace(/^\d+[\.)]\s*/, "");
    const partIds = inferParts(body);
    const tool = inferTool(body, availableTools);
    const reviews = SAMPLE_REVIEWS.filter((r) => r.step === i + 1);
    return {
      number: i + 1,
      action: inferAction(body),
      body,
      partsUsed: partIds,
      toolRequired: tool,
      warnings: reviews.map((r) => r.difficulty),
      waitForUser: true,
      locked,
      editable: !locked,
      image: {
        bw: `plate-${i + 1}-bw`,
        color: `plate-${i + 1}-color`,
        theme: "birch-workshop",
      },
    };
  });

  let appliedEdits = [];
  let ignoredEdits = [];
  if (instructions || availableTools.length) {
    if (locked) {
      // Run the edit pass on throwaway clones so we can report what an
      // instruction wanted without ever rewriting an official body.
      ignoredEdits = editStepsFromInstructions(steps.map(cloneStep), { instructions, availableTools });
    } else if (instructions) {
      appliedEdits = editStepsFromInstructions(steps, { instructions, availableTools });
    }
  }

  const partIds = [...new Set(steps.flatMap((s) => s.partsUsed))];
  if (!partIds.includes("allen-key")) partIds.push("allen-key");
  const bom = bomFromIds(partIds);
  return {
    title: /lack|table|linmon|eket/i.test(title) ? title : `${title} (IKEAlive)`,
    official: locked,
    locked,
    editable: !locked,
    skipAhead: !locked,
    productArticle: locked ? productArticle || DEFAULT_OFFICIAL_ARTICLE : null,
    theme: {
      setting: "birch workshop",
      light: "north window",
      material: "particleboard foil + steel inserts",
      accent: "#ffda1a",
    },
    steps,
    bom,
    partners: {
      parser: "local-gliner-standin",
      video: "local-storyboard",
      search: "catalog-list",
    },
    raw: text,
    instructions,
    appliedEdits,
    ignoredEdits,
  };
}

export function officialProducts() {
  return OFFICIAL_PRODUCTS.map((p) => ({ ...p, toolsIncluded: [...p.toolsIncluded] }));
}

function findOfficialProduct(article) {
  if (!article) return OFFICIAL_PRODUCTS[0];
  const wanted = String(article).trim();
  return (
    OFFICIAL_PRODUCTS.find((p) => p.article === wanted) ||
    OFFICIAL_PRODUCTS.find((p) => p.name.toLowerCase() === wanted.toLowerCase()) ||
    null
  );
}

export function officialGuide(options = {}) {
  const opts = typeof options === "string" ? { article: options } : options || {};
  const product = findOfficialProduct(opts.article);
  if (!product) {
    return { ok: false, reason: `No official guide for article ${opts.article}.`, products: officialProducts() };
  }
  const guide = parseGuide(product.guide, {
    instructions: opts.instructions || "",
    availableTools: opts.availableTools || [],
    official: true,
    productArticle: product.article,
  });
  return {
    ...guide,
    product: {
      article: product.article,
      name: product.name,
      size: product.size,
      partId: product.partId,
      store: product.store,
      storeUrl: product.storeUrl,
      people: product.people,
      toolsIncluded: [...product.toolsIncluded],
    },
    lockNote:
      "Official IKEA-style instructions. Steps are read-only and run in order — expand a step instead of rewriting it.",
  };
}

export function applyInstructions(guide, { instructions = "", availableTools = [] } = {}) {
  if (!guide || !Array.isArray(guide.steps)) return { ok: false, reason: "No guide." };
  if (guide.locked) {
    const ignoredEdits = editStepsFromInstructions(guide.steps.map(cloneStep), { instructions, availableTools });
    return {
      ok: false,
      locked: true,
      reason: "Official guide is locked. Instructions cannot rewrite official steps.",
      guide,
      appliedEdits: [],
      ignoredEdits,
    };
  }
  const steps = guide.steps.map(cloneStep);
  const appliedEdits = editStepsFromInstructions(steps, { instructions, availableTools });
  return {
    ok: true,
    locked: false,
    guide: {
      ...guide,
      steps,
      instructions: [guide.instructions, instructions].filter(Boolean).join(" ").trim(),
      appliedEdits: [...(guide.appliedEdits || []), ...appliedEdits],
    },
    appliedEdits,
    ignoredEdits: [],
  };
}

export function verifyOfficialGuide(guide) {
  if (!guide || !Array.isArray(guide.steps)) return { ok: false, reason: "No guide." };
  if (!guide.locked) return { ok: true, locked: false, official: false, drift: [] };
  const product = findOfficialProduct(guide.productArticle);
  if (!product) return { ok: false, locked: true, reason: "Unknown official article.", drift: [] };
  const canonical = parseGuide(product.guide, { official: true, productArticle: product.article });
  const drift = canonical.steps
    .filter((s, i) => guide.steps[i]?.body !== s.body)
    .map((s) => s.number)
    .concat(guide.steps.length === canonical.steps.length ? [] : ["step-count"]);
  return { ok: drift.length === 0, locked: true, official: true, article: product.article, drift };
}

export function expandStep(guide, stepNumber, { stuckNote = "" } = {}) {
  const step = guide.steps.find((s) => s.number === Number(stepNumber));
  if (!step) return { ok: false, reason: "No such step." };
  const reviews = SAMPLE_REVIEWS.filter((r) => r.step === step.number);
  const detail = [
    `Step ${step.number} — ${step.action.toUpperCase()}`,
    step.body,
    stuckNote ? `You said: ${stuckNote}` : "Slow version:",
    "1. Clear a 1.2 m patch of floor.",
    "2. Identify the exact faces and holes before you commit.",
    "3. Start the fastener by hand so you do not cross-thread.",
    "4. Stop at snug. Particleboard inserts hate extra torque.",
    reviews[0] ? `Watch-out from reviews: ${reviews[0].difficulty}. ${reviews[0].fix}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    ok: true,
    step: { ...step, expanded: true, detail },
    reviews,
  };
}

export function storyboardForStep(guide, stepNumber) {
  const step = guide.steps.find((s) => s.number === Number(stepNumber));
  if (!step) return [];
  const captions = [
    `Step ${step.number}: ${step.action}`,
    step.body,
    step.toolRequired ? `Tool: ${step.toolRequired}` : "Hands only",
    step.warnings[0] ? `Watch: ${step.warnings[0]}` : "This plate is done.",
  ];
  return captions.map((caption, i) => ({
    frame: i,
    durationMs: 1100,
    camera: { az: 35 + i * 12, el: 28 - i * 2, zoom: 1.1 - i * 0.05 },
    explode: i * 0.08,
    caption,
    theme: guide.theme,
    parts: step.partsUsed,
  }));
}

export function makeVideoPlan(guide) {
  return {
    title: `${guide.title} — IKEAlive reel`,
    theme: guide.theme,
    partner: { name: "Veed", status: "proposed", fallback: "local canvas storyboard" },
    continuous: true,
    locked: Boolean(guide.locked),
    skipAhead: guide.skipAhead !== false,
    steps: guide.steps.map((step) => ({
      number: step.number,
      waitForUser: step.waitForUser,
      frames: storyboardForStep(guide, step.number),
    })),
  };
}

export function colorizePlate(step, catalogHits = []) {
  const parts = (step.partsUsed || []).map((id) => getPart(id)).filter(Boolean);
  const extras = catalogHits.map((id) => getPart(id)).filter(Boolean);
  const palette = [...parts, ...extras].map((p) => ({
    id: p.id,
    color: p.color,
    texture: p.texture,
    name: p.name,
  }));
  return {
    from: "black-white-line",
    to: "catalog-real",
    theme: "birch-workshop",
    fills: palette.length
      ? palette
      : [{ id: "workshop", color: "#f3efe6", texture: "birch-foil", name: "bench" }],
    note: "Line plate is painted with catalog materials, not a live product photo scrape.",
  };
}

export function reviewsForGuide(guide) {
  return guide.steps.map((step) => {
    const reviews = SAMPLE_REVIEWS.filter((r) => r.step === step.number);
    return {
      step: step.number,
      difficulties: reviews.map((r) => r.difficulty),
      reviews,
    };
  });
}

export function attachBroken({ guide, stepNumber, note = "", photoName = "broken.jpg" }) {
  const step = guide.steps.find((s) => s.number === Number(stepNumber));
  if (!step) return { ok: false, reason: "No such step." };
  const review = SAMPLE_REVIEWS.find((r) => r.step === step.number) || SAMPLE_REVIEWS[0];
  const spare = getPart(review.sparePartId);
  return {
    ok: true,
    step: step.number,
    photoName,
    note,
    identified: review.difficulty,
    spare: spare
      ? { id: spare.id, name: spare.name, store: spare.store, storeUrl: spare.storeUrl, cost: spare.cost }
      : null,
    fix: review.fix,
  };
}

export function generateFix(reviewId) {
  const review = SAMPLE_REVIEWS.find((r) => r.id === reviewId);
  if (!review) return { ok: false, reason: "Unknown review." };
  const spare = getPart(review.sparePartId);
  return {
    ok: true,
    review,
    fix: review.fix,
    spare: spare
      ? { id: spare.id, name: spare.name, store: spare.store, storeUrl: spare.storeUrl, cost: spare.cost }
      : null,
  };
}

export function defaultGuide() {
  return officialGuide({ availableTools: ["allen-key"] });
}

export function remixGuide() {
  return parseGuide(LACK_GUIDE, {
    instructions: "Do not overtighten. Allen key is in the bag.",
    availableTools: ["allen-key"],
  });
}

export { LACK_GUIDE, OFFICIAL_LACK_GUIDE, OFFICIAL_PRODUCTS, SAMPLE_REVIEWS };

export function shoppingList(guide) {
  const ids = [...new Set(guide.steps.flatMap((s) => [s.toolRequired, ...s.partsUsed].filter(Boolean)))];
  const bom = bomFromIds(ids);
  const extras = searchParts({ category: "tool" }).filter((p) => p.extra);
  return {
    ...bom,
    suggestedExtras: extras.map((p) => ({
      id: p.id,
      name: p.name,
      store: p.store,
      storeUrl: p.storeUrl,
      cost: p.cost,
      why: "Not in the flat-pack. Handy if a fastener strips.",
    })),
  };
}

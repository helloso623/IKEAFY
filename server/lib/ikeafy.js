import { bomFromIds, getPart, listParts, searchParts, retailerOffers } from "./catalog.js";
import { usableOpenAiKey } from "./secrets.js";

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

/** Visible in search, but there is no transcribed sheet yet. */
const LOCKED_CATALOG = [
  {
    article: "802.758.87",
    name: "KALLAX shelf unit",
    size: "77×147 cm",
    partId: "kallax",
    kit: null,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=KALLAX",
    stepCount: 0,
    toolsIncluded: [],
    people: 2,
  },
  {
    article: "002.638.50",
    name: "BILLY bookcase",
    size: "80×28×202 cm",
    partId: "billy",
    kit: null,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=BILLY",
    stepCount: 0,
    toolsIncluded: [],
    people: 2,
  },
  {
    article: "802.314.86",
    name: "MALM chest of 3 drawers",
    size: "80×78 cm",
    partId: "malm",
    kit: null,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=MALM",
    stepCount: 0,
    toolsIncluded: [],
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
  const text = String(raw || "").trim();
  if (!text) {
    return emptyGuide({ locked, productArticle, instructions });
  }
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

  return finishGuide({
    title,
    steps,
    locked,
    productArticle,
    instructions,
    appliedEdits,
    ignoredEdits,
    raw: text,
    parser: "local-gliner-standin",
  });
}

function emptyGuide({ locked = false, productArticle = null, instructions = "" } = {}) {
  return finishGuide({
    title: "",
    steps: [],
    locked,
    productArticle,
    instructions,
    appliedEdits: [],
    ignoredEdits: [],
    raw: "",
    parser: "local-gliner-standin",
  });
}

function finishGuide({
  title,
  steps,
  locked,
  productArticle,
  instructions,
  appliedEdits,
  ignoredEdits,
  raw,
  parser,
}) {
  const partIds = [...new Set(steps.flatMap((s) => s.partsUsed))];
  if (locked && !partIds.includes("allen-key")) partIds.push("allen-key");
  const bom = bomFromIds(partIds);
  const named = String(title || "").trim() || "Untitled build";
  return {
    title: /lack|table|linmon|eket/i.test(named) ? named : `${named} (IKEAlive)`,
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
    parser,
    partners: {
      parser,
      video: "seedance-2.5",
      search: "catalog-list",
    },
    raw,
    instructions,
    appliedEdits,
    ignoredEdits,
  };
}

const ALLOWED_ACTIONS = new Set(ACTION_WORDS.map(([, action]) => action).concat("assemble", "prepare"));

function resolvePartIds(names = []) {
  const ids = [];
  for (const name of names) {
    const token = String(name || "").trim();
    if (!token) continue;
    if (getPart(token)) ids.push(token);
    else ids.push(...inferParts(token));
  }
  return [...new Set(ids)];
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[0]);
  } catch {
    return null;
  }
}

function guideFromModel(parsed, { raw, instructions = "", availableTools = [] } = {}) {
  if (!parsed || !Array.isArray(parsed.steps) || !parsed.steps.length) return null;
  const steps = parsed.steps.map((step, i) => {
    const body = String(step.body || step.instruction || step.text || "").trim();
    const action = ALLOWED_ACTIONS.has(step.action) ? step.action : inferAction(body);
    return {
      number: i + 1,
      action,
      body: body || `Step ${i + 1}`,
      partsUsed: resolvePartIds(step.partsUsed || step.parts || []),
      toolRequired: step.toolRequired || inferTool(body, availableTools),
      warnings: Array.isArray(step.warnings) ? step.warnings.map(String) : [],
      waitForUser: true,
      locked: false,
      editable: true,
      image: {
        bw: `plate-${i + 1}-bw`,
        color: `plate-${i + 1}-color`,
        theme: "birch-workshop",
      },
    };
  });
  return finishGuide({
    title: parsed.title || "Custom build",
    steps,
    locked: false,
    productArticle: null,
    instructions,
    appliedEdits: [],
    ignoredEdits: [],
    raw,
    parser: "openai",
  });
}

async function extractGuideWithOpenAI(
  { raw, images = [], instructions = "", availableTools = [] } = {},
  { fetchFn = fetch } = {},
) {
  const key = usableOpenAiKey();
  if (!key) return null;
  const catalogHint = listParts()
    .slice(0, 48)
    .map((p) => `${p.id} (${p.name})`)
    .join("; ");
  const model = process.env.OPENAI_MODEL_HARD || process.env.OPENAI_MODEL_EASY || "gpt-4.1-mini";
  const userContent = [];
  const brief = [
    raw ? `Guide text:\n${String(raw).slice(0, 12000)}` : "The builder attached photos of a building guide.",
    instructions ? `Builder notes / tools: ${instructions}` : "",
    availableTools.length ? `Tools on hand: ${availableTools.join(", ")}` : "",
    "Turn this into assembly steps for THIS input. Do not substitute an IKEA LACK table unless the input is actually about LACK.",
  ]
    .filter(Boolean)
    .join("\n\n");
  userContent.push({ type: "text", text: brief });
  for (const image of images.slice(0, 4)) {
    const url = image.dataUrl || image.url;
    if (!url || !String(url).startsWith("data:image")) continue;
    userContent.push({ type: "image_url", image_url: { url } });
  }
  if (userContent.length === 1 && !raw) return null;

  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You parse building guides into IKEAFY JSON. Catalog part ids you may use: ${catalogHint}. Actions: unpack, place, align, fasten, flip, inspect, install, tape, solder, wire, assemble, prepare. Reply with JSON {"title":string,"steps":[{"number":1,"action":"assemble","body":"one clear instruction","partsUsed":["part-id"],"toolRequired":null,"warnings":[]}]}. Keep each body to one move. Do not invent a LACK table.`,
        },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const parsed = parseJsonObject(json.choices?.[0]?.message?.content);
  return guideFromModel(parsed, { raw, instructions, availableTools });
}

/**
 * Custom guides go through OpenAI when a key is set so pasted text and dropped
 * photos become the actual steps. Official sheets stay on the transcribed text.
 */
export async function parseGuideAsync(
  raw,
  { instructions = "", availableTools = [], official = false, productArticle = null, images = [] } = {},
  deps = {},
) {
  if (official) return parseGuide(raw, { instructions, availableTools, official, productArticle });
  const local = parseGuide(raw, { instructions, availableTools });
  try {
    const hosted = await extractGuideWithOpenAI({ raw, images, instructions, availableTools }, deps);
    if (hosted?.steps?.length) return hosted;
  } catch {
    // Fall through to the local parser — never leak the key.
  }
  return local;
}

export function officialProducts() {
  return [
    ...OFFICIAL_PRODUCTS.map((p) => ({
      ...p,
      toolsIncluded: [...p.toolsIncluded],
      unlocked: true,
      locked: false,
    })),
    ...LOCKED_CATALOG.map((p) => ({
      ...p,
      toolsIncluded: [...p.toolsIncluded],
      unlocked: false,
      locked: true,
    })),
  ];
}

export function searchOfficialProducts(query = "") {
  const q = String(query || "").trim().toLowerCase();
  const all = officialProducts();
  if (!q) return all;
  return all.filter((p) => `${p.name} ${p.article} ${p.size || ""}`.toLowerCase().includes(q));
}

function findLockedProduct(article) {
  if (!article) return null;
  const wanted = String(article).trim().toLowerCase();
  return (
    LOCKED_CATALOG.find((p) => p.article === String(article).trim()) ||
    LOCKED_CATALOG.find((p) => p.name.toLowerCase() === wanted) ||
    LOCKED_CATALOG.find((p) => p.name.toLowerCase().includes(wanted)) ||
    null
  );
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
    const lockedHit = findLockedProduct(opts.article);
    if (lockedHit) {
      return {
        ok: false,
        locked: true,
        reason: `${lockedHit.name} is in the catalog but its official sheet is not transcribed yet.`,
        product: lockedHit,
        products: officialProducts(),
      };
    }
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
    partner: { name: "ByteDance Seedance 2.5", status: "optional", fallback: "local canvas storyboard" },
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
    partner: "tavily-standin",
    suggestedExtras: extras.map((p) => ({
      id: p.id,
      name: p.name,
      store: p.store,
      storeUrl: p.storeUrl,
      cost: p.cost,
      badge: "to purchase",
      retailers: retailerOffers(p).offers,
      why: "Not in the flat-pack. Handy if a fastener strips.",
    })),
  };
}

import { bomFromIds, getPart, listParts, searchParts } from "./catalog.js";

const LACK_GUIDE = `LACK side table
1. Unpack the table top and four legs. Keep the Allen key from the bag.
2. Put a rug or the box lid on the floor. Place the table top face down.
3. Line up each leg with a metal insert in a corner.
4. Screw each leg in by hand, then snug with the Allen key. Do not overtighten.
5. Flip the table upright with a friend. Check it does not wobble.
6. Optional: tape cable runs under the top and add the lamp board.`;

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

export function parseGuide(raw, { instructions = "", availableTools = [] } = {}) {
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
      image: {
        bw: `plate-${i + 1}-bw`,
        color: `plate-${i + 1}-color`,
        theme: "birch-workshop",
      },
    };
  });

  if (instructions) {
    const extra = String(instructions).toLowerCase();
    if (extra.includes("no overtighten") || extra.includes("do not overtighten")) {
      const fasten = steps.find((s) => s.action === "fasten");
      if (fasten) fasten.body += " Stop when the shoulder meets the insert — no extra crank.";
    }
    if (availableTools.length) {
      for (const step of steps) {
        if (step.toolRequired && !availableTools.includes(step.toolRequired)) {
          step.toolRequired = availableTools[0];
          step.body += ` Use the ${availableTools[0]} you said you have.`;
        }
      }
    }
  }

  const partIds = [...new Set(steps.flatMap((s) => s.partsUsed))];
  if (!partIds.includes("allen-key")) partIds.push("allen-key");
  const bom = bomFromIds(partIds);
  return {
    title: /lack|table|linmon|eket/i.test(title) ? title : `${title} (IKEAFY)`,
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
  };
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
    step.warnings[0] ? `Watch: ${step.warnings[0]}` : "Looks good — continue when ready.",
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
    title: `${guide.title} — IKEAFY film`,
    theme: guide.theme,
    partner: { name: "Veed", status: "proposed", fallback: "local canvas storyboard" },
    continuous: true,
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
  return parseGuide(LACK_GUIDE, {
    instructions: "Do not overtighten. Allen key is in the bag.",
    availableTools: ["allen-key"],
  });
}

export { LACK_GUIDE, SAMPLE_REVIEWS };

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

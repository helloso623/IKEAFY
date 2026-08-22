import { bomFromIds, getPart, listParts } from "./catalog.js";
import { classifyTools, enrichShopping, neededTools } from "./tavily.js";
import {
  ensureGliner2Ready,
  extractGuideWithGliner2,
  formatGliner2FailureReason,
  GLINER2_BACKEND,
  isGliner2RuntimeError,
} from "./gliner2.js";
import { FAL_PLATE_VISION_REQUIRED, parseFalVisionGuide, readPlatesWithFal } from "./plate-vision.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

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

function inferParts(text, title = "") {
  const lower = `${title} ${text}`.toLowerCase();
  const hits = [];
  for (const part of listParts()) {
    const tokens = part.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (tokens.some((t) => lower.includes(t)) || lower.includes(part.id.replace(/-/g, " "))) {
      hits.push(part.id);
    }
  }
  if (/leg/.test(lower) && /lack/.test(lower) && !hits.includes("lack-leg")) hits.push("lack-leg");
  if (/lack/.test(lower) && /top|table/.test(lower) && !hits.includes("lack-top")) hits.push("lack-top");
  if (/allen/.test(lower) && !hits.includes("allen-key")) hits.push("allen-key");
  if (/tape/.test(lower) && !hits.includes("tape-gaffer")) hits.push("tape-gaffer");
  return [...new Set(hits)];
}

function inferTool(text, availableTools = []) {
  const lower = text.toLowerCase();
  if (/allen|hex/.test(lower)) return "allen-key";
  if (/screwdriver|phillips|pozi/.test(lower)) return "screwdriver";
  if (/\bmallet\b|\bhammer\b/.test(lower)) return "hammer";
  if (/\bdrill\b/.test(lower)) return "drill";
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
    const partIds = inferParts(body, title);
    const tool = inferTool(body, availableTools);
    const reviews = locked ? SAMPLE_REVIEWS.filter((r) => r.step === i + 1) : [];
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
    parser: "local-parser",
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
    parser: "local-parser",
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
    title: named,
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

function guideFromModel(parsed, { raw, instructions = "", availableTools = [], parser = "model" } = {}) {
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
    parser,
  });
}

function hasGroundedGlinerSteps(extracted, source, { plates = false } = {}) {
  const steps = Array.isArray(extracted?.steps) ? extracted.steps.filter((step) => String(step?.body || "").trim()) : [];
  if (!steps.length) return false;
  if (!plates) return true;
  const text = String(source || "").toLowerCase();
  const explicitlyNumbered = /\bstep\s*\d+\b/i.test(text);
  const grounded = steps.filter((step) => {
    const tokens = String(step.body || "")
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g);
    if (!tokens?.length) return false;
    return tokens.filter((token) => text.includes(token)).length >= Math.min(3, tokens.length);
  });
  return grounded.length === steps.length && (steps.length >= 2 || explicitlyNumbered);
}

function safeModelText(value) {
  return String(value || "")
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[image data]")
    .replace(/[A-Za-z0-9+/=]{100,}/g, "[base64 data]")
    .replace(/\b(?:Key|Bearer)\s+\S+/gi, "[redacted authorization]")
    .slice(0, 800);
}

function glinerUnavailableReason(error) {
  return formatGliner2FailureReason(error);
}

/**
 * Custom guide text goes through Pioneer/Fastino GLiNER 2 first. Diagram-only
 * plates keep a fal vision path, then GLiNER 2 normalizes that output. When
 * normalization yields no steps, structured fal JSON (or a local parse of the
 * vision text) is used so a successful vision call is not discarded. Official
 * sheets stay on their locked transcription.
 */
export async function parseGuideAsync(
  raw,
  { instructions = "", availableTools = [], official = false, productArticle = null, images = [] } = {},
  deps = {},
) {
  if (official) return parseGuide(raw, { instructions, availableTools, official, productArticle });
  const plates = (images || []).filter((image) =>
    String(image?.dataUrl || image?.url || "").startsWith("data:image"),
  );
  const modelText = String(raw || "").trim();
  let glinerStatus = modelText ? "no grounded steps" : "no readable text";
  if (modelText) {
    const requestId = deps.requestId || null;
    ikealiveLog("parse", "GLiNER 2 extracted text", {
      requestId,
      textChars: modelText.length,
      sentChars: Math.min(modelText.length, 24_000),
      plates: plates.length,
    });
    try {
      const extracted = await extractGuideWithGliner2(raw, {
        ...deps,
        // Non-PDF paste/plans fall back locally — fail fast if the sidecar is broken.
        glinerStartupTimeoutMs:
          deps.glinerStartupTimeoutMs ?? (deps.requireGliner || plates.length ? undefined : 15_000),
      });
      const modeled = guideFromModel(extracted, {
        raw,
        instructions,
        availableTools,
        parser: GLINER2_BACKEND,
      });
      if (modeled?.steps?.length && hasGroundedGlinerSteps(extracted, modelText, { plates: Boolean(plates.length) })) {
        ikealiveLog("parse", "GLiNER 2 ok", { title: modeled.title, steps: modeled.steps.length });
        return modeled;
      }
      glinerStatus = modeled?.steps?.length ? "steps not grounded in extracted PDF text" : "no grounded steps";
    } catch (error) {
      const reason = glinerUnavailableReason(error);
      if (plates.length) {
        // Plate PDFs can still use fal vision + normalize / structured fallback.
        ikealiveLog("parse", "GLiNER 2 unavailable; trying fal plate vision", { requestId, reason });
        glinerStatus = reason;
      } else if (deps.requireGliner) {
        ikealiveWarn("parse", "GLiNER 2 unavailable", { requestId, reason });
        const guide = emptyGuide({ instructions });
        guide.parseError = reason;
        return guide;
      } else {
        ikealiveWarn("parse", "GLiNER 2 unavailable", { requestId, reason });
        const local = parseGuide(raw, { instructions, availableTools });
        if (local?.steps?.length) {
          local.parseWarning = reason;
          return local;
        }
        const guide = emptyGuide({ instructions });
        guide.parseError = reason;
        return guide;
      }
    }
  }
  if (plates.length) {
    const requestId = deps.requestId || null;
    ikealiveLog("parse", "gliner2 insufficient; using fal plate vision", {
      requestId,
      reason: glinerStatus,
      plates: plates.length,
    });
    // Fail fast on missing fal before starting the local GLiNER sidecar (avoids assembly hang).
    if (!process.env.FAL_KEY && !deps.falVisionFn) {
      const guide = emptyGuide({ instructions });
      guide.parseError = FAL_PLATE_VISION_REQUIRED;
      return guide;
    }
    try {
      try {
        await ensureGliner2Ready(deps);
      } catch (error) {
        // Vision JSON can still become steps without GLiNER; keep going.
        ikealiveWarn("parse", "GLiNER 2 not ready before fal vision", {
          requestId,
          reason: glinerUnavailableReason(error),
        });
      }
      const visionText = await readPlatesWithFal(
        { raw, images: plates, instructions, availableTools, requestId },
        deps,
      );
      let normalized = null;
      let normalizeFailureReason = null;
      try {
        normalized = await extractGuideWithGliner2(visionText, deps);
      } catch (error) {
        normalizeFailureReason = glinerUnavailableReason(error);
      }
      const fromGliner = guideFromModel(normalized, {
        raw: visionText,
        instructions,
        availableTools,
        parser: `${GLINER2_BACKEND}+fal-plate-vision`,
      });
      if (fromGliner?.steps?.length) {
        ikealiveLog("parse", "fal vision normalized by GLiNER 2", {
          requestId,
          title: fromGliner.title,
          steps: fromGliner.steps.length,
        });
        return fromGliner;
      }

      // fal already returns {title, steps:[{body,...}]}; use it when GLiNER grounding is empty.
      const structured = parseFalVisionGuide(visionText);
      const fromVision = guideFromModel(structured, {
        raw: visionText,
        instructions,
        availableTools,
        parser: "fal-plate-vision",
      });
      if (fromVision?.steps?.length) {
        if (normalizeFailureReason) {
          // Fal succeeded; Pioneer TLS / GLiNER normalize miss is informational, not alarming.
          ikealiveLog("parse", "GLiNER 2 vision normalize skipped; fal structured steps used", {
            requestId,
            reason: normalizeFailureReason,
            title: fromVision.title,
            steps: fromVision.steps.length,
          });
        } else {
          ikealiveLog("parse", "fal vision structured steps used directly", {
            requestId,
            title: fromVision.title,
            steps: fromVision.steps.length,
            glinerStatus: normalized ? "empty steps" : "normalize skipped or failed",
          });
        }
        return fromVision;
      }

      if (normalizeFailureReason) {
        ikealiveWarn("parse", "GLiNER 2 vision normalize failed", {
          requestId,
          reason: normalizeFailureReason,
        });
      }

      const local = parseGuide(visionText, { instructions, availableTools });
      if (local?.steps?.length) {
        local.parser = "fal-plate-vision+local-parser";
        local.partners = { ...local.partners, parser: local.parser };
        ikealiveLog("parse", "fal vision local-parser fallback", {
          requestId,
          title: local.title,
          steps: local.steps.length,
        });
        return local;
      }

      throw new Error("fal plate vision returned text that could not be turned into assembly steps.");
    } catch (error) {
      const reason = isGliner2RuntimeError(error)
        ? glinerUnavailableReason(error)
        : safeModelText(error?.message || error);
      ikealiveWarn("parse", "fal plate vision failed", { requestId, reason });
      const guide = emptyGuide({ instructions });
      guide.parseError = reason || "fal plate vision could not read those PDF plates.";
      return guide;
    }
  }
  const local = parseGuide(raw, { instructions, availableTools });
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
    kind: plateKind(guide, step),
  }));
}

/** Camera + catalog parts for the Three.js workshop. No Seedance, no fal. */
export function scenePlanForStep(guide, stepNumber, frameIndex = 0) {
  const frames = storyboardForStep(guide, stepNumber);
  const step = guide?.steps?.find((s) => Number(s.number) === Number(stepNumber));
  const last = Math.max(0, frames.length - 1);
  const idx = Math.max(0, Math.min(Number(frameIndex) || 0, last));
  const frame = frames[idx] || {};
  const camera = frame.camera || { az: 42, el: 28, zoom: 1 };
  return {
    number: Number(step?.number || stepNumber) || 0,
    engine: "workshop",
    parts: [...new Set((frame.parts || step?.partsUsed || []).filter(Boolean))],
    camera: { az: camera.az, el: camera.el, zoom: camera.zoom },
    explode: Number(frame.explode) || 0,
    caption: frame.caption || step?.body || `Step ${stepNumber}`,
    frame: idx,
    frames: frames.length,
  };
}

export function plateKind(guide, step = {}) {
  const blob = `${guide?.title || ""} ${step.body || ""} ${(step.partsUsed || []).join(" ")} ${
    guide?.raw || ""
  }`.toLowerCase();
  if (/billy|kallax|bookcase|bookshelf|shelf unit|wall shelf/.test(blob)) return "bookcase";
  if ((step.partsUsed || []).some((id) => id === "generic-side-table" || /^lack-/.test(id) || id === "test-table")) {
    return "table";
  }
  if (/test table|generic|scanned object|side table|table top/.test(blob) && !/bookcase|shelf/.test(blob)) return "table";
  return "box";
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
  if (!guide?.locked) {
    return (guide?.steps || []).map((step) => ({
      step: step.number,
      difficulties: step.warnings || [],
      reviews: [],
    }));
  }
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

function mmPart(dimsMm, fallback = 550) {
  const n = Math.round(Number(dimsMm) || fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Custom IKEAlive step plan for a scanned (or placeholder) object.
 * Same shape as the official film — numbered plates — generated for this object.
 */
export function scannedObjectGuide({ name = "", dimsMm = {}, notes = "" } = {}) {
  const x = mmPart(dimsMm.x, 550);
  const y = mmPart(dimsMm.y, 550);
  const z = mmPart(dimsMm.z, 450);
  const title = String(name || "").trim() || "Scanned object";
  const tableLike = x >= 280 && y >= 280 && z >= 220 && z <= 1100;
  const space = Math.max(1.2, (Math.max(x, y) + 250) / 1000).toFixed(1);
  const raw = tableLike
    ? `${title} — ${x} × ${y} × ${z} mm
1. Unpack the top and four supports. Check them against the measured ${x} × ${y} × ${z} mm envelope. Specs needed for an exact IKEA article.
2. Put a rug or the box lid on the floor. Keep about ${space} m of clear space so the finish and the floor both survive.
3. Place the top face down in the middle of the pad, underside up, with a corner ready at each corner.
4. Fasten each support into a corner until the shoulder meets the top. Do not overtighten.
5. Flip the piece upright with a second person if it is awkward. Set it down and check that it sits flat and does not rock.`
    : `${title} — ${x} × ${y} × ${z} mm
1. Unpack the scanned object and count every part against the measured ${x} × ${y} × ${z} mm envelope. Specs needed for an exact IKEA article.
2. Put a rug or the box lid on the floor. Keep about ${space} m of clear space around the footprint.
3. Place the body on its stable face in the middle of the pad so the joints you will fasten are facing you.
4. Fasten the supports or fittings until they sit flush. Do not overtighten.
5. Stand the piece upright with a second person if it is large. Check it does not wobble.`;
  const guide = parseGuide(raw, { instructions: notes, official: false });
  return {
    ...guide,
    source: "scan",
    scanned: { name: title, dimsMm: { x, y, z }, tableLike },
  };
}

export function remixGuide() {
  return parseGuide(LACK_GUIDE, {
    instructions: "Do not overtighten. Allen key is in the bag.",
    availableTools: ["allen-key"],
  });
}

export { LACK_GUIDE, OFFICIAL_LACK_GUIDE, OFFICIAL_PRODUCTS, SAMPLE_REVIEWS };

export function shoppingList(guide) {
  const partIds = [...new Set((guide?.steps || []).flatMap((s) => s.partsUsed || []))];
  const toolIds = neededTools(guide);
  const bom = bomFromIds([...partIds, ...toolIds]);
  const classified = classifyTools(bom, guide);
  return {
    ...classified,
    partner: "tavily-standin",
    live: false,
    suggestedExtras: classified.missing,
  };
}

export async function shoppingListAsync(guide, deps = {}) {
  return enrichShopping(shoppingList(guide), deps);
}

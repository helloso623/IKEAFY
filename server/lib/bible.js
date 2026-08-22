/**
 * Locked scene bible: product, setting, camera, and palette are derived once
 * per assembly run and reused for every Seedance / Nano Banana / Tripo prompt.
 * Only the current plate's action and body may change.
 */

import { ikealiveLog } from "./log.js";

const KNOWN_SKUS = [
  { sku: "BILLY", re: /\bbilly\b/i, name: "BILLY bookcase", size: "80×28×202 cm" },
  { sku: "LACK", re: /\black\b/i, name: "LACK side table", size: "55×55 cm, 45 cm high" },
  { sku: "KALLAX", re: /\bkallax\b/i, name: "KALLAX shelf unit", size: "77×147 cm" },
  { sku: "MALM", re: /\bmalm\b/i, name: "MALM chest of drawers", size: "80×78 cm" },
  { sku: "LINNMON", re: /\blinnmon\b/i, name: "LINNMON table top", size: "100×60 cm" },
  { sku: "ADILS", re: /\badils\b/i, name: "ADILS leg", size: "70 cm high" },
];

const SKU_FAMILIES = KNOWN_SKUS.map((row) => row.sku.toLowerCase());

const DEFAULT_SETTING = "birch workshop";
const DEFAULT_LIGHT = "soft north window light";
const DEFAULT_MATERIAL = "particleboard foil and steel fittings";
const DEFAULT_BACKGROUND = "pale walls, no set change";
const DEFAULT_PALETTE = "yellow #ffda1a accent";
const DEFAULT_CAMERA = "eye-level IKEA-manual framing, north window key light, same lens and distance";
const DEFAULT_PERSON =
  "the same adult builder in a cream linen shirt with rolled sleeves, no jewelry — same clothes in every shot that includes a person";

export function allocRenderSeed() {
  return 1 + Math.floor(Math.random() * 2_147_483_646);
}

function skuFromName(name) {
  const text = String(name || "");
  const known = KNOWN_SKUS.find((row) => row.re.test(text));
  return known ? known.sku : "CUSTOM";
}

function dimensionsFrom(text, fallback = null) {
  const blob = String(text || "");
  const match = blob.match(
    /(\d+(?:[.,]\d+)?\s*[×x]\s*\d+(?:[.,]\d+)?(?:\s*[×x]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm)?)/i,
  );
  if (match) return match[1].replace(/\s+/g, " ").replace(/x/gi, "×");
  return fallback;
}

function findStep(guide, stepNumber) {
  return (
    guide?.steps?.find((s) => Number(s.number) === Number(stepNumber)) || guide?.steps?.[0] || {}
  );
}

function identityFromGuide(guide) {
  const title = String(guide?.title || "").trim() || "this build";
  if (guide?.product?.name) {
    return {
      sku: skuFromName(guide.product.name),
      productName: guide.product.name,
      article: guide.product.article || guide.productArticle || null,
      dimensions: guide.product.size || dimensionsFrom(title),
    };
  }
  const known = KNOWN_SKUS.find((row) => row.re.test(title));
  if (known) {
    return {
      sku: known.sku,
      productName: title,
      article: guide?.productArticle || null,
      dimensions: dimensionsFrom(title, known.size),
    };
  }
  return {
    sku: skuFromName(title),
    productName: title,
    article: guide?.productArticle || null,
    dimensions: dimensionsFrom(title),
  };
}

function partsForPrompt(step, bible) {
  const locked = String(bible?.sku || "").toLowerCase();
  const used = (step?.partsUsed || []).filter((id) => {
    const lower = String(id || "").toLowerCase();
    return !SKU_FAMILIES.some((fam) => fam !== locked && lower.includes(fam));
  });
  if (used.length) return used.join(", ");
  return "the parts named in the instruction";
}

export function sceneBibleFromGuide(guide) {
  const theme = guide?.theme || {};
  const identity = identityFromGuide(guide);
  const material = theme.material || DEFAULT_MATERIAL;
  const setting = theme.setting || DEFAULT_SETTING;
  const light = theme.light || DEFAULT_LIGHT;
  const palette = theme.accent ? `yellow ${theme.accent} accent` : DEFAULT_PALETTE;
  const dimBit = identity.dimensions ? `, ${identity.dimensions}` : "";
  const lockText = [
    `Product (locked): this ${identity.productName}${dimBit}, ${material}. Always this ${identity.productName} — never swap to a different IKEA SKU mid-reel.`,
    `Setting (locked): ${setting}, ${light}, ${DEFAULT_BACKGROUND}, ${palette}.`,
    `Camera (locked): ${DEFAULT_CAMERA}.`,
    "Same workshop, same materials, same lighting as the rest of this build.",
  ].join(" ");
  return {
    sku: identity.sku,
    productName: identity.productName,
    article: identity.article,
    dimensions: identity.dimensions,
    material,
    setting,
    light,
    background: DEFAULT_BACKGROUND,
    palette,
    camera: DEFAULT_CAMERA,
    person: DEFAULT_PERSON,
    lockText,
    personText: `Person (locked): ${DEFAULT_PERSON}.`,
  };
}

export function ensureSceneLock(run, guide) {
  const source = run?.guide || guide;
  const bible = run?.bible || sceneBibleFromGuide(source);
  const seed = Number.isInteger(run?.seed) ? run.seed : allocRenderSeed();
  if (run) {
    run.bible = bible;
    run.seed = seed;
  }
  return { bible, seed };
}

export function logSceneBible({ bible, seed, stepNumber, mode } = {}) {
  ikealiveLog("render", "bible", {
    step: stepNumber ?? null,
    seed: Number.isInteger(seed) ? seed : null,
    sku: bible?.sku || null,
    product: bible?.productName || null,
    setting: bible?.setting || null,
    light: bible?.light || null,
    material: bible?.material || null,
    palette: bible?.palette || null,
    mode: mode || null,
  });
}

export function composeStepPrompt({ kind = "video", guide, stepNumber, extra = "", bible = null } = {}) {
  const locked = bible || sceneBibleFromGuide(guide);
  const step = findStep(guide, stepNumber);
  const body = String(step.body || "").trim();
  const title = locked.productName || guide?.title || "this build";
  const parts = partsForPrompt(step, locked);
  const tool = step.toolRequired ? `Use a ${step.toolRequired}.` : "Hands only.";
  const extraLimit = kind === "scene" ? 200 : 400;
  const extraBit = extra ? `Additional direction from the builder: ${String(extra).slice(0, extraLimit)}` : "";
  const opener =
    kind === "image"
      ? "Photoreal IKEA-style assembly instruction still, one clear plate."
      : kind === "scene"
        ? "A single textured 3D furniture model, IKEA-style flat-pack mid-assembly, isolated object."
        : "Photoreal IKEA-style assembly tutorial, one continuous shot.";
  const hands =
    kind === "video"
      ? "Show adult hands performing one clear assembly move at IKEA-manual pace."
      : kind === "image"
        ? "Show adult hands frozen mid-move on one assembly action, IKEA-manual framing."
        : null;
  const bans =
    kind === "scene"
      ? "No people, no hands, no text, no logos, no subtitles, no brand marks."
      : "No on-screen text, no logos, no subtitles, no brand marks.";
  const slot = kind === "scene" ? "mesh" : kind === "image" ? "still" : "shot";
  const plate = step.number || stepNumber || 1;
  const actionBit = step.action ? `Action: ${step.action}. Plate ${plate}.` : `Plate ${plate}.`;
  const text = [
    opener,
    locked.lockText,
    kind === "scene" ? null : locked.personText,
    bans,
    hands,
    `This is step ${plate} of "${title}": ${body || "Follow the plate."}`,
    actionBit,
    `Parts in this ${slot}: ${parts}. ${tool}`,
    extraBit,
  ]
    .filter(Boolean)
    .join(" ");
  return kind === "scene" ? text.slice(0, 1024) : text;
}

export { KNOWN_SKUS };

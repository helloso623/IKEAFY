import type { BuildPlan, BuildStep, Material, MaterialBadge } from "./types";
import { retailerLinks } from "./retailers";

const MAX_SOURCE_LENGTH = 4000;
const MAX_TITLE_LENGTH = 60;

type ToolKeyword = { pattern: RegExp; display: string };
type PartKeyword = { pattern: RegExp; display: string; badge: MaterialBadge };

const TOOL_KEYWORDS: ToolKeyword[] = [
  { pattern: /\bphillips\b/i, display: "Phillips screwdriver" },
  { pattern: /\bflathead\b/i, display: "Flathead screwdriver" },
  { pattern: /\bscrewdrivers?\b/i, display: "Screwdriver" },
  { pattern: /\ballen\s*keys?\b/i, display: "Allen key" },
  { pattern: /\bhex\s*keys?\b/i, display: "Allen key" },
  { pattern: /\ballen\s*wrench(?:es)?\b/i, display: "Allen key" },
  { pattern: /\bmallets?\b/i, display: "Mallet" },
  { pattern: /\bhammers?\b/i, display: "Hammer" },
  { pattern: /\bdrills?\b/i, display: "Drill" },
  { pattern: /\bwrench(?:es)?\b/i, display: "Wrench" },
  { pattern: /\bpliers\b/i, display: "Pliers" },
  { pattern: /\btape\s*measure\b/i, display: "Tape measure" },
  { pattern: /\bleveler?\b/i, display: "Level" },
  { pattern: /\butility\s*knife\b/i, display: "Utility knife" },
  { pattern: /\bscissors\b/i, display: "Scissors" },
];

const PART_KEYWORDS: PartKeyword[] = [
  { pattern: /\bback\s*panels?\b/i, display: "Back panel", badge: "purchase" },
  { pattern: /\bcam\s*locks?\b/i, display: "Cam lock", badge: "included" },
  { pattern: /\bcams?\b/i, display: "Cam", badge: "included" },
  { pattern: /\bscrews?\b/i, display: "Screw", badge: "included" },
  { pattern: /\bbolts?\b/i, display: "Bolt", badge: "included" },
  { pattern: /\bnuts?\b/i, display: "Nut", badge: "included" },
  { pattern: /\bwashers?\b/i, display: "Washer", badge: "included" },
  { pattern: /\bdowels?\b/i, display: "Dowel", badge: "included" },
  { pattern: /\bpegs?\b/i, display: "Peg", badge: "included" },
  { pattern: /\bnails?\b/i, display: "Nail", badge: "included" },
  { pattern: /\bplugs?\b/i, display: "Plug", badge: "included" },
  { pattern: /\bpins?\b/i, display: "Pin", badge: "included" },
  { pattern: /\bhinges?\b/i, display: "Hinge", badge: "included" },
  { pattern: /\bbrackets?\b/i, display: "Bracket", badge: "included" },
  { pattern: /\bconnectors?\b/i, display: "Connector", badge: "included" },
  { pattern: /\bpanels?\b/i, display: "Panel", badge: "purchase" },
  { pattern: /\bshel(?:f|ves)\b/i, display: "Shelf", badge: "purchase" },
  { pattern: /\blegs?\b/i, display: "Leg", badge: "purchase" },
  { pattern: /\brails?\b/i, display: "Rail", badge: "purchase" },
  { pattern: /\bplanks?\b/i, display: "Plank", badge: "purchase" },
  { pattern: /\bboards?\b/i, display: "Board", badge: "purchase" },
  { pattern: /\bfeet\b|\bfoot\b/i, display: "Foot", badge: "purchase" },
];

function detectTools(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, display } of TOOL_KEYWORDS) {
    if (pattern.test(text) && !found.includes(display)) {
      found.push(display);
    }
  }
  return found;
}

function detectParts(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, display } of PART_KEYWORDS) {
    if (pattern.test(text) && !found.includes(display)) {
      found.push(display);
    }
  }
  return found;
}

function partBadge(display: string): MaterialBadge {
  const match = PART_KEYWORDS.find((p) => p.display === display);
  return match ? match.badge : "included";
}

function makeTitle(action: string, index: number): string {
  const words = action.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return `Step ${index + 1}`;
  }
  const short = words.slice(0, 6).join(" ");
  return short.length > MAX_TITLE_LENGTH
    ? `${short.slice(0, MAX_TITLE_LENGTH).trim()}…`
    : short;
}

function splitIntoStepTexts(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const numberedStart = /^\s*(?:step\s+)?\d+\s*[.):-]\s+/i;

  const grouped: string[] = [];
  let current: string[] = [];
  let sawNumbered = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (numberedStart.test(line)) {
      sawNumbered = true;
      if (current.length > 0) {
        grouped.push(current.join(" ").trim());
      }
      current = [line.replace(numberedStart, "").trim()];
    } else if (line.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    grouped.push(current.join(" ").trim());
  }

  if (sawNumbered) {
    return grouped.filter((s) => s.length > 0);
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length >= 2) {
    return paragraphs;
  }

  const combined = paragraphs.join(" ") || normalized.replace(/\s+/g, " ").trim();
  if (!combined) {
    return [];
  }

  const sentences = combined
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length >= 2) {
    const mid = Math.ceil(sentences.length / 2);
    const first = sentences.slice(0, mid).join(" ").trim();
    const second = sentences.slice(mid).join(" ").trim();
    return [first, second].filter((s) => s.length > 0);
  }

  return [combined];
}

function buildMaterials(steps: BuildStep[]): Material[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const step of steps) {
    for (const part of step.parts) {
      if (!counts.has(part)) {
        counts.set(part, 0);
        order.push(part);
      }
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  return order.map((name) => ({
    name,
    quantity: Math.max(1, counts.get(name) ?? 1),
    badge: partBadge(name),
    retailers: retailerLinks(name),
  }));
}

function buildDifficulties(steps: BuildStep[], materials: Material[]): string[] {
  const tips: string[] = [];
  const joined = steps.map((s) => s.action).join(" ").toLowerCase();

  const screwMaterial = materials.find((m) => m.name === "Screw");
  const screwMentions = (joined.match(/\bscrews?\b/g) ?? []).length;
  if ((screwMaterial && screwMaterial.quantity >= 3) || screwMentions >= 3) {
    tips.push("Pre-sort screws by size before starting.");
  }

  if (/\bback\s*panels?\b/.test(joined) || /\bnails?\b/.test(joined)) {
    tips.push("Attaching the thin back panel can bow — work on a flat surface.");
  }

  tips.push("Keep all fittings grouped by step to avoid mixing sizes.");

  return tips.slice(0, 3);
}

export function parseGuide(
  text: string,
  opts?: { title?: string; instructions?: string },
): BuildPlan {
  const source = (text ?? "").trim();
  const stepTexts = splitIntoStepTexts(source);
  const effectiveStepTexts = stepTexts.length > 0 ? stepTexts : [source || "Assemble the item."];

  const steps: BuildStep[] = effectiveStepTexts.map((action, index) => {
    const trimmed = action.trim();
    return {
      number: index + 1,
      title: makeTitle(trimmed, index),
      action: trimmed || `Step ${index + 1}`,
      parts: detectParts(trimmed),
      tools: detectTools(trimmed),
    };
  });

  const materials = buildMaterials(steps);

  const toolSet: string[] = [];
  for (const step of steps) {
    for (const tool of step.tools) {
      if (!toolSet.includes(tool)) {
        toolSet.push(tool);
      }
    }
  }
  const tools = toolSet.length > 0 ? toolSet : ["Phillips screwdriver", "Allen key"];

  const difficulties = buildDifficulties(steps, materials);

  const firstLine = source
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const derivedTitle =
    opts?.title?.trim() ||
    (firstLine ? firstLine.slice(0, MAX_TITLE_LENGTH).trim() : "") ||
    "Custom build guide";

  const sourceValue = source.slice(0, MAX_SOURCE_LENGTH);

  return {
    title: derivedTitle,
    sourceType: "guide",
    sourceValue,
    instructions: opts?.instructions,
    origin: "parsed",
    steps,
    materials,
    tools,
    difficulties,
    sparePartsHint:
      "IKEA ships replacement fittings free — note the part number from your instruction booklet, or bring a photo of the damaged part to the store.",
  };
}

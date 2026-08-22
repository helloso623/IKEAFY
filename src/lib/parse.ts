import type { BuildPlan, BuildStep, Material, MaterialBadge } from "@/lib/types";
import { retailerLinks } from "@/lib/retailers";

/**
 * Heuristic, dependency-free parser that turns free-form IKEA-style assembly
 * text into a structured {@link BuildPlan}. No external APIs are used — every
 * signal (steps, tools, parts, cautions) is derived from keyword matching and
 * light text analysis so it runs fully offline and deterministically.
 */

type Keyword = {
  /** Canonical, display-ready name stored on the resulting plan. */
  canonical: string;
  /** Raw phrases to look for (case-insensitive, plural-tolerant). */
  patterns: string[];
};

const TOOL_KEYWORDS: Keyword[] = [
  { canonical: "Allen key", patterns: ["allen key", "hex key", "allen wrench", "hex wrench", "allen"] },
  { canonical: "Phillips screwdriver", patterns: ["phillips"] },
  { canonical: "Screwdriver", patterns: ["screwdriver"] },
  { canonical: "Drill", patterns: ["drill"] },
  { canonical: "Hammer", patterns: ["hammer"] },
  { canonical: "Mallet", patterns: ["mallet"] },
  { canonical: "Spanner", patterns: ["spanner"] },
  { canonical: "Wrench", patterns: ["wrench"] },
  { canonical: "Pencil", patterns: ["pencil"] },
  { canonical: "Tape measure", patterns: ["tape measure", "measuring tape"] },
  { canonical: "Level", patterns: ["spirit level", "level"] },
  { canonical: "Saw", patterns: ["saw"] },
  { canonical: "Clamp", patterns: ["clamp"] },
  { canonical: "Glue", patterns: ["wood glue", "glue"] },
];

const PART_KEYWORDS: Keyword[] = [
  { canonical: "Back panel", patterns: ["back panel"] },
  { canonical: "Cam lock", patterns: ["cam lock", "cam-lock", "camlock"] },
  { canonical: "Cam bolt", patterns: ["cam bolt", "cam-bolt"] },
  { canonical: "Wooden peg", patterns: ["wooden peg", "peg"] },
  { canonical: "Screw", patterns: ["screw"] },
  { canonical: "Bolt", patterns: ["bolt"] },
  { canonical: "Nut", patterns: ["nut"] },
  { canonical: "Washer", patterns: ["washer"] },
  { canonical: "Dowel", patterns: ["dowel"] },
  { canonical: "Panel", patterns: ["panel"] },
  { canonical: "Shelf", patterns: ["shelf", "shelves"] },
  { canonical: "Bracket", patterns: ["bracket"] },
  { canonical: "Hinge", patterns: ["hinge"] },
  { canonical: "Leg", patterns: ["leg"] },
  { canonical: "Rail", patterns: ["rail"] },
  { canonical: "Nail", patterns: ["nail"] },
  { canonical: "Plug", patterns: ["plug"] },
];

/** Parts that IKEA typically ships inside the box (fittings). */
const INCLUDED_PARTS = new Set<string>([
  "Screw",
  "Bolt",
  "Nut",
  "Washer",
  "Dowel",
  "Cam lock",
  "Cam bolt",
  "Wooden peg",
  "Bracket",
  "Hinge",
  "Nail",
  "Plug",
]);

const SPARE_PARTS_HINT =
  "IKEA ships replacement fittings (screws, cam locks, dowels) free. Note the part number from your instruction booklet; if you can't find it, visit the store's returns/exchanges desk.";

const GENERIC_TIP =
  "Lay out every part and fitting before you start, and dry-fit pieces to check orientation before final tightening.";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a case-insensitive, plural-tolerant, word-bounded matcher. */
function buildMatcher(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}s?\\b`, "gi");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isStepMarker(line: string): boolean {
  return (
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*step\s+\d+\b/i.test(line) ||
    /^\s*[-*]\s+/.test(line)
  );
}

function stripStepMarker(line: string): string {
  return line
    .replace(/^\s*step\s+\d+\s*[:.)-]*\s*/i, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/^\s*[-*]\s+/, "");
}

/**
 * Detect keywords in `text`. Longer/more-specific phrases are matched first and
 * removed from a working copy so nested phrases (e.g. "back panel" vs "panel",
 * "cam bolt" vs "bolt") aren't double counted.
 */
function detect(text: string, keywords: Keyword[]): { names: string[]; counts: Record<string, number> } {
  let work = ` ${text} `;
  const names: string[] = [];
  const counts: Record<string, number> = {};

  for (const keyword of keywords) {
    let total = 0;
    for (const pattern of keyword.patterns) {
      work = work.replace(buildMatcher(pattern), (match) => {
        total += 1;
        return " ".repeat(match.length);
      });
    }
    if (total > 0) {
      names.push(keyword.canonical);
      counts[keyword.canonical] = total;
    }
  }

  return { names, counts };
}

/** Produce a short, human-friendly step title from the full step text. */
function summarize(action: string, max = 50): string {
  if (action.length <= max) return action;
  const slice = action.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 20 ? slice.slice(0, lastSpace) : slice;
  return `${base.trim()}…`;
}

function deriveTitle(text: string, providedTitle?: string): string {
  const fromOpts = providedTitle?.trim();
  if (fromOpts) return fromOpts;

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => collapse(line))
    .find((line) => line.length > 0);

  if (!firstLine) return "Untitled build";
  if (firstLine.length <= 60) return firstLine;

  const slice = firstLine.slice(0, 60);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 20 ? slice.slice(0, lastSpace) : slice;
  return `${base.trim()}…`;
}

/** Split raw text into an array of cleaned step texts (always >= 1). */
function splitIntoSteps(text: string): string[] {
  const lines = text.split(/\r?\n/);

  if (lines.some(isStepMarker)) {
    const blocks: string[] = [];
    let current: string[] | null = null;

    for (const line of lines) {
      if (isStepMarker(line)) {
        if (current && collapse(current.join(" "))) blocks.push(current.join("\n"));
        current = [stripStepMarker(line)];
      } else if (current) {
        current.push(line);
      }
    }
    if (current && collapse(current.join(" "))) blocks.push(current.join("\n"));

    const cleaned = blocks.map(collapse).filter(Boolean);
    if (cleaned.length) return cleaned;
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map(collapse)
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  const single = paragraphs[0] ?? collapse(text);
  const sentences = single
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.length ? sentences : [single];
}

function makeMaterial(name: string, quantity: number): Material {
  const badge: MaterialBadge = INCLUDED_PARTS.has(name) ? "included" : "purchase";
  return {
    name,
    quantity: Math.max(1, quantity),
    badge,
    retailers: retailerLinks(name),
  };
}

function fallbackMaterials(): Material[] {
  return [
    { ...makeMaterial("Wood glue", 1), note: "Handy for reinforcing joints not fixed by fittings." },
    { ...makeMaterial("Felt floor pads", 1), note: "Protects your floors once the piece is assembled." },
  ];
}

function buildDifficulties(stepCount: number, partNames: string[], toolNames: string[]): string[] {
  const difficulties: string[] = [];

  if (stepCount >= 6) {
    difficulties.push(`This build has ${stepCount} steps — set aside enough time.`);
  }
  if (partNames.includes("Cam lock") || partNames.includes("Dowel")) {
    difficulties.push(
      "Cam-lock and dowel alignment is a common pain point — dry-fit before tightening."
    );
  }
  if (toolNames.includes("Drill")) {
    difficulties.push("Pre-drilling/over-tightening can strip the material — go slow.");
  }

  difficulties.push(GENERIC_TIP);
  return difficulties;
}

function emptyPlan(instructions?: string): BuildPlan {
  return {
    title: "Untitled build",
    sourceType: "guide",
    sourceValue: "",
    instructions,
    origin: "parsed",
    steps: [
      {
        number: 1,
        title: "Add build instructions",
        action:
          "No instructions were provided. Paste or type the steps from your IKEA guide to generate a build plan.",
        parts: [],
        tools: [],
      },
    ],
    materials: fallbackMaterials(),
    tools: [],
    difficulties: [GENERIC_TIP],
    sparePartsHint: SPARE_PARTS_HINT,
  };
}

export function parseGuide(
  text: string,
  opts?: { title?: string; instructions?: string }
): BuildPlan {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return emptyPlan(opts?.instructions);

  const title = deriveTitle(trimmed, opts?.title);
  const stepTexts = splitIntoSteps(trimmed);

  const steps: BuildStep[] = stepTexts.map((action, index) => ({
    number: index + 1,
    title: summarize(action),
    action,
    parts: detect(action, PART_KEYWORDS).names,
    tools: detect(action, TOOL_KEYWORDS).names,
  }));

  const partDetection = detect(trimmed, PART_KEYWORDS);
  const toolDetection = detect(trimmed, TOOL_KEYWORDS);

  const planTools = Array.from(
    new Set(steps.flatMap((step) => step.tools))
  ).sort((a, b) => a.localeCompare(b));

  const materials: Material[] = partDetection.names.length
    ? partDetection.names.map((name) => makeMaterial(name, partDetection.counts[name] ?? 1))
    : fallbackMaterials();

  const difficulties = buildDifficulties(steps.length, partDetection.names, toolDetection.names);

  return {
    title,
    sourceType: "guide",
    sourceValue: trimmed,
    instructions: opts?.instructions,
    origin: "parsed",
    steps,
    materials,
    tools: planTools,
    difficulties,
    sparePartsHint: SPARE_PARTS_HINT,
  };
}

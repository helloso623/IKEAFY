import type { BuildPlan, BuildStep, Material } from "@/lib/types";

export type ChatAnswer = {
  answer: string;
  escalated: boolean;
  model: string;
};

/**
 * Keywords that indicate a question is complex enough to warrant escalating
 * from the small local model (Pioneer Gliner 2) to a larger hosted model.
 */
const ESCALATION_KEYWORDS = [
  "why",
  "design",
  "redesign",
  "modify",
  "custom",
  "stronger",
  "reinforce",
  "alternative",
  "instead",
  "3d",
  "simulate",
  "electronic",
  "wiring",
];

const ESCALATION_LENGTH = 160;

function isEscalated(question: string): boolean {
  if (question.length > ESCALATION_LENGTH) {
    return true;
  }
  const lower = question.toLowerCase();
  return ESCALATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function resolveModel(escalated: boolean): string {
  if (escalated) {
    return process.env.OPENAI_API_KEY
      ? "openai:gpt-4o-mini (configured)"
      : "openai:gpt-4o-mini (stub — set OPENAI_API_KEY)";
  }
  return process.env.GLINER_API_KEY || process.env.PIONEER_API_KEY
    ? "pioneer:gliner-2 (configured)"
    : "pioneer:gliner-2 (stub)";
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

/**
 * Detects a specific step number in the question. Supports both "step 3" and
 * "3rd step" style phrasings.
 */
function findStepNumber(question: string): number | null {
  const stepFirst = question.match(/step\s*(\d+)/);
  if (stepFirst) {
    return Number(stepFirst[1]);
  }
  const numberFirst = question.match(/(\d+)(st|nd|rd|th)?\s*step/);
  if (numberFirst) {
    return Number(numberFirst[1]);
  }
  return null;
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none listed";
}

function answerTools(plan: BuildPlan): string {
  if (plan.tools.length === 0) {
    return `No tools are listed for "${plan.title}" — it looks like you can put this together by hand.`;
  }
  return `For "${plan.title}" you'll need: ${plan.tools.join(", ")}.`;
}

function answerMaterials(plan: BuildPlan): string {
  if (plan.materials.length === 0) {
    return `No individual parts or materials are listed for "${plan.title}" yet.`;
  }

  const included = plan.materials.filter((m) => m.badge === "included");
  const toBuy = plan.materials.filter((m) => m.badge === "purchase");

  const describe = (material: Material) => `${material.name} ×${material.quantity}`;

  const parts: string[] = [];
  if (included.length > 0) {
    parts.push(`Included in the box: ${included.map(describe).join(", ")}`);
  }
  if (toBuy.length > 0) {
    parts.push(`To buy separately: ${toBuy.map(describe).join(", ")}`);
  }

  const retailerNote = toBuy.length > 0
    ? " Retailer links are provided for the items you need to buy."
    : " Retailer links are available on the materials list if you want spares.";

  return `Here's what "${plan.title}" uses. ${parts.join(". ")}.${retailerNote}`;
}

function answerStep(plan: BuildPlan, stepNumber: number): string {
  if (plan.steps.length === 0) {
    return `No build steps are listed yet for "${plan.title}".`;
  }

  const step: BuildStep | undefined = plan.steps.find((s) => s.number === stepNumber);
  if (!step) {
    const first = plan.steps[0].number;
    const last = plan.steps[plan.steps.length - 1].number;
    return `There's no step ${stepNumber} in "${plan.title}" — it runs from step ${first} to step ${last}. Let me know which one you'd like.`;
  }

  const detail = `Step ${step.number}: ${step.title}. ${step.action}`;
  const partsLine = ` Parts: ${listOrNone(step.parts)}.`;
  const toolsLine = ` Tools: ${listOrNone(step.tools)}.`;
  const note = step.note ? ` Note: ${step.note}` : "";
  return `${detail}${partsLine}${toolsLine}${note}`;
}

function answerTime(plan: BuildPlan): string {
  const count = plan.steps.length;
  const stepWord = count === 1 ? "step" : "steps";
  return `"${plan.title}" is broken into ${count} ${stepWord}. Exact timing varies with experience and helpers on hand, so treat that step count as your rough guide rather than a fixed schedule.`;
}

function answerSpare(plan: BuildPlan): string {
  const hint = plan.sparePartsHint.trim();
  return hint.length > 0
    ? hint
    : `Check the assembly guide for "${plan.title}" for the spare-parts contact and reference number.`;
}

function answerDifficulty(plan: BuildPlan): string {
  if (plan.difficulties.length === 0) {
    return `No specific trouble spots are flagged for "${plan.title}". Work slowly and keep fasteners loose until everything lines up.`;
  }
  return `Watch out for these tricky parts of "${plan.title}": ${plan.difficulties.join("; ")}.`;
}

function answerGeneral(plan: BuildPlan): string {
  const count = plan.steps.length;
  const stepWord = count === 1 ? "step" : "steps";
  return `"${plan.title}" has ${count} ${stepWord}. I can help with the tools you need, the parts and materials, a specific step (e.g. "step 2"), how long it takes, spare parts, or the trickier bits — just ask a more specific question.`;
}

function buildAnswer(plan: BuildPlan, question: string): string {
  const lower = question.toLowerCase();

  const stepNumber = findStepNumber(lower);
  if (stepNumber !== null) {
    return answerStep(plan, stepNumber);
  }

  if (hasAny(lower, ["tool", "what do i need", "allen", "screwdriver"])) {
    return answerTools(plan);
  }

  if (hasAny(lower, ["part", "material", "screw", "buy", "purchase", "missing"])) {
    return answerMaterials(plan);
  }

  if (hasAny(lower, ["time", "duration", "how long", "long"])) {
    return answerTime(plan);
  }

  if (hasAny(lower, ["broke", "broken", "missing", "replacement", "replace", "spare"])) {
    return answerSpare(plan);
  }

  if (hasAny(lower, ["difficulty", "difficult", "hard", "problem", "stuck"])) {
    return answerDifficulty(plan);
  }

  return answerGeneral(plan);
}

/**
 * Deterministic, network-free assistant stub. It answers assembly questions
 * using only information contained in the provided BuildPlan, mimicking a
 * small local model (Pioneer Gliner 2) that escalates complex requests to a
 * larger hosted OpenAI model.
 */
export function answerQuestion(
  plan: BuildPlan,
  question: string,
): ChatAnswer {
  const escalated = isEscalated(question);
  const model = resolveModel(escalated);

  let answer = buildAnswer(plan, question);

  if (escalated && !process.env.OPENAI_API_KEY) {
    answer = `A larger model would handle this in more depth once OPENAI_API_KEY is set — here's my best local answer: ${answer}`;
  }

  return { answer, escalated, model };
}

/**
 * The assembly run: server-side truth for "which step am I allowed to be on".
 *
 * ikeafy.js decides what a guide *says* and flags official guides as locked.
 * This module is what makes the lock mean something: the cursor moves one
 * confirmed step at a time, an official body is not sent to the client until
 * you reach it, and skip/edit are refused with a reason instead of being hidden
 * behind a disabled button that a devtools user can re-enable.
 */

import { expandStep, officialGuide, parseGuide, parseGuideAsync, shoppingListAsync } from "./ikeafy.js";
import { fittingsForStep } from "./fittings.js";
import { extractPdfText } from "./pdf-text.js";

const CONFIRM_BY_ACTION = {
  unpack: "The kit matches the parts list.",
  place: "The part is sitting exactly as the plate shows.",
  align: "Every fastener is hand-started and square — nothing is cross-threaded.",
  fasten: "Every fastener is snug, and none of them was forced past snug.",
  flip: "The unit has been turned over safely, with a second person if it needs one.",
  inspect: "You have checked it: nothing rocks, gaps or wobbles.",
  install: "The added part is fully seated.",
  tape: "The tape is pressed down along its whole length.",
  solder: "Every joint is shiny and nothing is bridged.",
  wire: "Every wire goes where the plate shows and nothing is pinched.",
  assemble: "This step is finished exactly as the plate shows.",
  prepare: "The workspace is ready as described.",
};

function confirmPromptFor(step) {
  if (!step) return "This step is done.";
  if (step.confirm) return step.confirm;
  return CONFIRM_BY_ACTION[step.action] || CONFIRM_BY_ACTION.assemble;
}

const runs = new Map();
let seq = 0;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** Canonical instruction render mode stored on the run. `3d` aliases to `scene`. */
export function normalizeRenderMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "video") return "video";
  if (raw === "images" || raw === "image") return "images";
  if (raw === "scene" || raw === "3d") return "scene";
  return null;
}

/**
 * @param {object} options
 * @param {"official"|"custom"} options.mode
 */
export function startAssembly({
  mode = "official",
  article = null,
  guide: rawGuide = "",
  instructions = "",
  availableTools = [],
  pdfBase64 = "",
  renderMode = null,
} = {}) {
  let guide;
  if (mode === "official") {
    guide = officialGuide({ article, availableTools, instructions });
    if (guide?.ok === false) return { ok: false, reason: guide.reason, products: guide.products };
  } else {
    let text = String(rawGuide || "");
    if (pdfBase64) {
      const extracted = extractPdfText(Buffer.from(String(pdfBase64), "base64"));
      text = [extracted, text].filter(Boolean).join("\n\n");
    }
    if (!text.trim()) {
      return { ok: false, reason: "Drop a PDF or paste a guide first." };
    }
    guide = parseGuide(text, { instructions, availableTools });
  }
  return beginRun(mode, guide, renderMode);
}

async function withShopping(result, deps = {}) {
  if (!result.ok) return result;
  const run = getAssembly(result.run.id);
  if (!run) return result;
  try {
    run.guide.bom = await shoppingListAsync(run.guide, deps);
  } catch {
    // Keep the catalog BOM if Tavily is down.
  }
  return { ok: true, ...view(run) };
}

export async function startAssemblyAsync({
  mode = "official",
  article = null,
  guide: rawGuide = "",
  instructions = "",
  availableTools = [],
  images = [],
  pdfBase64 = "",
  renderMode = null,
} = {}, deps = {}) {
  if (mode === "official") {
    return withShopping(startAssembly({ mode, article, instructions, availableTools, renderMode }), deps);
  }
  const plates = (images || []).filter((image) =>
    String(image?.dataUrl || image?.url || "").startsWith("data:image"),
  );
  let text = String(rawGuide || "");
  if (!plates.length && pdfBase64) {
    const extracted = extractPdfText(Buffer.from(String(pdfBase64), "base64"));
    text = [extracted, text].filter(Boolean).join("\n\n");
  }
  const guide = await parseGuideAsync(text, { instructions, availableTools, images: plates });
  if (!guide?.steps?.length) {
    return {
      ok: false,
      reason: plates.length
        ? "Could not read those PDF plates into steps. Check the OpenAI key — IKEA manuals are drawings, not plain text."
        : "That guide has no steps. Drop a PDF or paste a numbered guide.",
    };
  }
  return withShopping(beginRun("custom", guide, renderMode), deps);
}

function beginRun(mode, guide, renderMode = null) {
  if (guide?.ok === false) return guide;
  if (!guide?.steps?.length) return { ok: false, reason: "That guide has no steps." };

  const run = {
    id: `run-${++seq}`,
    mode: mode === "official" ? "official" : "custom",
    renderMode: normalizeRenderMode(renderMode),
    locked: Boolean(guide.locked),
    guide,
    total: guide.steps.length,
    cursor: 1,
    confirmed: [],
    help: [],
    startedAt: Date.now(),
    finishedAt: null,
    refusals: [],
  };
  runs.set(run.id, run);
  return { ok: true, ...view(run) };
}

export function getAssembly(id) {
  return runs.get(id) || null;
}

export function setAssemblyRenderMode(id, renderMode) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  const mode = normalizeRenderMode(renderMode);
  if (!mode) return { ok: false, reason: "Pick video, images, or 3D instructions." };
  run.renderMode = mode;
  return { ok: true, ...view(run) };
}

function stepOf(run, number) {
  return run.guide.steps.find((s) => Number(s.number) === Number(number)) || null;
}

function publicRun(run) {
  return {
    id: run.id,
    mode: run.mode,
    renderMode: run.renderMode || null,
    locked: run.locked,
    official: run.mode === "official",
    title: run.guide.title,
    productArticle: run.guide.productArticle || null,
    total: run.total,
    cursor: run.cursor,
    confirmed: [...run.confirmed],
    done: run.confirmed.length >= run.total,
    finishedAt: run.finishedAt,
    canSkip: !run.locked,
    canEdit: !run.locked,
    refusals: run.refusals.length,
  };
}

function stepState(run, step) {
  if (run.confirmed.includes(step.number)) return "done";
  if (step.number === run.cursor) return "current";
  if (step.number < run.cursor) return "reopened";
  return "ahead";
}

/**
 * Locked runs do not ship the text of a step you have not reached. The plate you
 * are on is the plate you can read.
 */
function outlineFor(run) {
  return run.guide.steps.map((step) => {
    const state = stepState(run, step);
    const readable = !run.locked || step.number <= run.cursor;
    return {
      number: step.number,
      action: step.action,
      state,
      readable,
      locked: run.locked && !readable,
      body: readable ? step.body : null,
      preview: readable ? null : `Step ${step.number} opens when you confirm step ${run.cursor}.`,
      toolRequired: step.toolRequired || null,
      confirmed: run.confirmed.includes(step.number),
    };
  });
}

function view(run) {
  const step = stepOf(run, run.cursor);
  return {
    run: publicRun(run),
    step: step
      ? {
          ...clone(step),
          confirmPrompt: confirmPromptFor(step),
          fittings: fittingsForStep(step),
        }
      : null,
    outline: outlineFor(run),
    guide: {
      title: run.guide.title,
      theme: run.guide.theme,
      bom: run.guide.bom,
      locked: run.locked,
      product: run.guide.product || null,
      lockNote: run.guide.lockNote || null,
    },
  };
}

export function assemblyView(id) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  return { ok: true, ...view(run) };
}

/** Reading ahead in a locked run gets you a refusal, not the text. */
export function peekStep(id, number) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  const step = stepOf(run, number);
  if (!step) return { ok: false, reason: "No such step." };
  if (run.locked && step.number > run.cursor) {
    run.refusals.push({ kind: "peek", step: step.number, at: Date.now() });
    return {
      ok: false,
      locked: true,
      step: step.number,
      cursor: run.cursor,
      reason: `Step ${step.number} opens after you confirm step ${run.cursor}.`,
    };
  }
  return {
    ok: true,
    locked: false,
    step: { ...clone(step), confirmPrompt: confirmPromptFor(step), fittings: fittingsForStep(step) },
  };
}

/**
 * The only way forward. A locked run needs the acknowledgement for the step you
 * are actually on; anything else comes back as a refusal with the reason.
 */
export function confirmStep(id, { step, checked = false } = {}) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  const number = Number(step ?? run.cursor);
  const current = stepOf(run, number);
  if (!current) return { ok: false, reason: "No such step." };

  if (run.locked && number !== run.cursor) {
    run.refusals.push({ kind: "out-of-order", step: number, at: Date.now() });
    return {
      ok: false,
      locked: true,
      outOfOrder: true,
      cursor: run.cursor,
      reason: `You are on step ${run.cursor}. Confirm that one before step ${number}.`,
    };
  }
  if (run.locked && !checked) {
    return {
      ok: false,
      needsConfirmation: true,
      cursor: run.cursor,
      confirmPrompt: confirmPromptFor(current),
      warnings: current.warnings || [],
      reason: "Tick the check for this step first.",
    };
  }

  if (!run.confirmed.includes(number)) run.confirmed.push(number);
  run.confirmed.sort((a, b) => a - b);
  run.cursor = Math.min(run.total, Math.max(number + 1, run.cursor));
  if (run.confirmed.length >= run.total) {
    run.finishedAt = Date.now();
    run.cursor = run.total;
  }
  return { ok: true, confirmed: number, ...view(run) };
}

/** Going back is always allowed — it reopens what came after instead of faking progress. */
export function goBack(id, number) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  const target = Number(number);
  if (!stepOf(run, target)) return { ok: false, reason: "No such step." };
  if (target > run.cursor) {
    return { ok: false, locked: run.locked, reason: "That step is ahead of you, not behind." };
  }
  run.cursor = target;
  run.confirmed = run.confirmed.filter((n) => n < target);
  run.finishedAt = null;
  return { ok: true, reopened: target, ...view(run) };
}

export function skipStep(id, number) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  const target = Number(number) || run.cursor;
  if (run.locked) {
    run.refusals.push({ kind: "skip", step: target, at: Date.now() });
    return {
      ok: false,
      locked: true,
      step: target,
      cursor: run.cursor,
      reason:
        "Official IKEA steps cannot be skipped. A skipped fitting comes back later as a wobble, a stripped insert or a tip-over.",
      alternative: "Press Stuck for the slow version, or request the missing fitting free from IKEA.",
    };
  }
  if (!stepOf(run, target)) return { ok: false, reason: "No such step." };
  run.cursor = Math.min(run.total, target + 1);
  return { ok: true, skipped: target, ...view(run) };
}

export function editStep(id, number, patch = {}) {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  if (run.locked) {
    run.refusals.push({ kind: "edit", step: Number(number), at: Date.now() });
    return {
      ok: false,
      locked: true,
      reason:
        "The official instruction is read-only. Paste it into the custom guide if you want to rewrite a step.",
    };
  }
  const step = stepOf(run, number);
  if (!step) return { ok: false, reason: "No such step." };
  if (typeof patch.body === "string" && patch.body.trim()) step.body = patch.body.trim();
  if (typeof patch.toolRequired === "string") step.toolRequired = patch.toolRequired;
  return { ok: true, step: clone(step), ...view(run) };
}

/** Stuck is a real state with a real answer: more detail, the fittings list, no skip. */
export function stuckOn(id, note = "") {
  const run = runs.get(id);
  if (!run) return { ok: false, reason: "Unknown assembly run." };
  const step = stepOf(run, run.cursor);
  if (!step) return { ok: false, reason: "No current step." };
  run.help.push({ step: step.number, note, at: Date.now() });
  const expanded = expandStep(run.guide, step.number, { stuckNote: note });
  const fittings = fittingsForStep(step);
  return {
    ok: true,
    advanced: false,
    stillOnStep: step.number,
    detail: expanded.step?.detail || step.body,
    reviews: expanded.reviews || [],
    fittings,
    fittingsNote: fittings.length
      ? "If any of these is missing or damaged, IKEA replaces the fitting free — request it before you carry on."
      : "This step uses no fittings, so nothing here needs replacing.",
    confirmPrompt: confirmPromptFor(step),
  };
}

export function resetAssemblies() {
  runs.clear();
  seq = 0;
}

export { confirmPromptFor };

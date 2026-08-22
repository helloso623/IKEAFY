import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GLINER2_MODEL = "fastino/gliner2-base-v1";
export const GLINER2_BACKEND = `gliner2:${GLINER2_MODEL}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIDECAR = path.join(__dirname, "..", "gliner2_sidecar.py");
const GUIDE_SCHEMA = {
  assembly_guide: ["title::str::Product or build guide title"],
  assembly_step: [
    "sequence_number::str::Printed step number",
    "instruction::str::Complete assembly instruction",
    "action::[unpack|place|align|fasten|flip|inspect|install|tape|solder|wire|assemble|prepare]::str",
    "parts::list::Parts used in this step",
    "tool::str::Tool required for this step",
    "warnings::list::Safety warnings and cautions",
  ],
};
const QUESTION_SCHEMA = {
  guide_question: [
    "step_number::str::Assembly step the user asks about",
    "requested_detail::[instruction|tool|parts|warning|next_step|current_step]::str",
    "mentioned_parts::list::Parts named in the question",
    "problem::str::Assembly problem described by the user",
  ],
};

let sidecar = null;
let nextId = 1;
let stdoutBuffer = "";
const pending = new Map();

function stopSidecar(error) {
  const active = sidecar;
  sidecar = null;
  stdoutBuffer = "";
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(error);
  }
  pending.clear();
  if (active && !active.killed) active.kill();
}

function acceptLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.ok) request.resolve(message.result);
  else request.reject(new Error(message.error || "GLiNER 2 inference failed"));
}

function ensureSidecar() {
  if (sidecar) return sidecar;
  const python = process.env.GLINER2_PYTHON || "python3";
  const inherited = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "PYTHONPATH", "HF_HOME", "TRANSFORMERS_CACHE", "TORCH_HOME"];
  const env = Object.fromEntries(inherited.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const child = spawn(python, [SIDECAR], {
    cwd: path.join(__dirname, "..", ".."),
    env: { ...env, GLINER2_MODEL: process.env.GLINER2_MODEL || GLINER2_MODEL },
    stdio: ["pipe", "pipe", "pipe"],
  });
  sidecar = child;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) if (line.trim()) acceptLine(line);
  });
  child.stderr.on("data", () => {
    // Model and downloader diagnostics stay server-side; never copy them into API responses.
  });
  child.on("error", (error) => stopSidecar(error));
  child.on("exit", (code) => {
    if (sidecar === child) stopSidecar(new Error(`GLiNER 2 sidecar exited (${code ?? "signal"})`));
  });
  return child;
}

export function inferWithGliner2(request, { inferFn, timeoutMs = 120_000 } = {}) {
  if (inferFn) return Promise.resolve(inferFn(request));
  const child = ensureSidecar();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("GLiNER 2 inference timed out"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ id, ...request })}\n`, (error) => {
      if (!error) return;
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    });
  });
}

function firstRecord(result, key) {
  const rows = result?.[key];
  return Array.isArray(rows) ? rows[0] || null : null;
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value ? [String(value)] : [];
}

export async function extractGuideWithGliner2(text, deps = {}) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const result = await inferWithGliner2(
    { operation: "extract_json", text: raw.slice(0, 24_000), schema: GUIDE_SCHEMA },
    { inferFn: deps.glinerInfer, timeoutMs: deps.glinerTimeoutMs },
  );
  const title = firstRecord(result, "assembly_guide")?.title || "";
  const rows = Array.isArray(result?.assembly_step) ? result.assembly_step : [];
  const steps = rows
    .map((row) => ({
      number: Number.parseInt(row.sequence_number, 10) || undefined,
      body: String(row.instruction || "").trim(),
      action: String(row.action || "").trim(),
      partsUsed: asList(row.parts),
      toolRequired: row.tool ? String(row.tool) : null,
      warnings: asList(row.warnings),
    }))
    .filter((step) => step.body);
  return steps.length ? { title: String(title || "Custom build"), steps } : null;
}

function requestedStep(record, currentStep) {
  const parsed = Number.parseInt(record?.step_number, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(currentStep) || 1;
}

export async function answerGuideQuestionWithGliner2(message, guide, { currentStep = 1, ...deps } = {}) {
  if (!guide?.steps?.length) return null;
  const result = await inferWithGliner2(
    { operation: "extract_json", text: String(message || "").slice(0, 2_000), schema: QUESTION_SCHEMA },
    { inferFn: deps.glinerInfer, timeoutMs: deps.glinerTimeoutMs },
  );
  const question = firstRecord(result, "guide_question");
  if (!question) return null;
  const detail = String(question.requested_detail || "instruction");
  const baseNumber = requestedStep(question, currentStep);
  const number = detail === "next_step" ? baseNumber + 1 : baseNumber;
  const step = guide.steps.find((candidate) => Number(candidate.number) === number);
  if (!step) {
    return {
      text: `The current guide has no step ${number}. It contains ${guide.steps.length} step${guide.steps.length === 1 ? "" : "s"}.`,
      stepNumbers: [],
    };
  }
  const parts = (step.partsUsed || []).filter(Boolean);
  const warnings = (step.warnings || []).filter(Boolean);
  let text;
  if (detail === "tool") {
    text = step.toolRequired ? `Step ${number} requires ${step.toolRequired}.` : `Step ${number} does not list a required tool.`;
  } else if (detail === "parts") {
    text = parts.length ? `Step ${number} uses ${parts.join(", ")}.` : `Step ${number} does not list any catalog parts.`;
  } else if (detail === "warning") {
    text = warnings.length ? `Step ${number} warning: ${warnings.join("; ")}.` : `Step ${number} has no recorded warning.`;
  } else {
    text = `Step ${number}: ${step.body}`;
  }
  return { text, stepNumbers: [number] };
}

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ikealiveLog, ikealiveWarn } from "./log.js";

export const GLINER2_MODEL = "fastino/gliner2-base-v1";
export const GLINER2_BACKEND = `gliner2:${GLINER2_MODEL}`;
export const GLINER2_SETUP_COMMAND = "npm run setup:gliner2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_SIDECAR = path.join(__dirname, "..", "gliner2_sidecar.py");
const LOCAL_PYTHON = path.join(ROOT, ".venv-gliner2", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const DEFAULT_STARTUP_TIMEOUT_MS = 300_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
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

let runtime = null;
let nextId = 1;
const pending = new Map();

function positiveMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pythonExecutable() {
  if (String(process.env.GLINER2_PYTHON || "").trim()) return String(process.env.GLINER2_PYTHON).trim();
  if (existsSync(LOCAL_PYTHON)) return LOCAL_PYTHON;
  return "python3";
}

function sidecarPath() {
  return String(process.env.GLINER2_SIDECAR || "").trim() || DEFAULT_SIDECAR;
}

function modelId() {
  return String(process.env.GLINER2_MODEL || "").trim() || GLINER2_MODEL;
}

function runtimeError(detail, cause, code = "GLINER2_RUNTIME_UNAVAILABLE") {
  const message = [
    `GLiNER 2 local runtime is unavailable${detail ? ` (${detail})` : ""}.`,
    `Run \`${GLINER2_SETUP_COMMAND}\` from the project root, then restart IKEAlive.`,
    "Set GLINER2_PYTHON to that environment's Python executable if you use a custom virtual environment.",
  ].join(" ");
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = "Gliner2RuntimeError";
  error.code = code;
  return error;
}

/** Pioneer/Fastino cloud API TLS or connection failures — not a missing local venv. */
export function isPioneerApiTlsOrConnectionDetail(detail) {
  const text = String(detail || "");
  if (!text.trim()) return false;
  const lower = text.toLowerCase();
  if (/api\.fastino\.ai/i.test(text)) return true;
  if (/gliner2apierror/i.test(text)) return true;
  if (/sslcertverificationerror/i.test(text)) return true;
  if (/certificate[_ ]verify[_ ]failed/i.test(lower)) return true;
  if (/certificate has expired/i.test(lower)) return true;
  if (/sslerror/i.test(text) && /fastino|pioneer|gliner/i.test(lower)) return true;
  if (/httpsconnectionpool/i.test(lower) && /fastino|pioneer/i.test(lower)) return true;
  if (/connection error/i.test(lower) && /fastino|pioneer|gliner2api/i.test(lower)) return true;
  return false;
}

export function pioneerApiConnectionError(detail, cause) {
  const trimmed = safeDiagnostic(stripLocalRuntimeBoilerplate(detail));
  const message = [
    "Pioneer GLiNER 2 API TLS/certificate failure talking to api.fastino.ai.",
    trimmed ? `Detail: ${trimmed}.` : null,
    "Check network access, system/CA certificates, SSL_CERT_FILE / REQUESTS_CA_BUNDLE (often `python -m certifi` in `.venv-gliner2`), or Fastino status.",
    "This is not a missing local GLiNER 2 install.",
  ]
    .filter(Boolean)
    .join(" ");
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = "Gliner2ApiConnectionError";
  error.code = "GLINER2_API_CONNECTION_ERROR";
  return error;
}

function stripLocalRuntimeBoilerplate(detail) {
  return String(detail || "")
    .replace(/^GLiNER 2 local runtime is unavailable\s*\(/i, "")
    .replace(/\)\.\s*Run `npm run setup:gliner2`[\s\S]*$/i, "")
    .replace(/\s*Run `npm run setup:gliner2`[\s\S]*$/i, "")
    .replace(/\s*Set GLINER2_PYTHON[\s\S]*$/i, "")
    .replace(/\s*This is not a missing local GLiNER 2 install\.?/i, "")
    .trim();
}

export function gliner2FailureFromDetail(detail, cause, code = "GLINER2_RUNTIME_UNAVAILABLE") {
  if (isPioneerApiTlsOrConnectionDetail(detail)) {
    return pioneerApiConnectionError(detail, cause);
  }
  return runtimeError(detail, cause, code);
}

export function isGliner2RuntimeError(error) {
  const code = String(error?.code || "");
  return (
    code.startsWith("GLINER2_") ||
    error?.name === "Gliner2RuntimeError" ||
    error?.name === "Gliner2ApiConnectionError"
  );
}

export function isGliner2ApiConnectionError(error) {
  return (
    error?.code === "GLINER2_API_CONNECTION_ERROR" ||
    error?.name === "Gliner2ApiConnectionError" ||
    isPioneerApiTlsOrConnectionDetail(error?.message)
  );
}

/** User/log-facing reason; keeps Pioneer TLS failures distinct from setup:gliner2. */
export function formatGliner2FailureReason(error) {
  const detail = safeDiagnostic(error?.message || error);
  if (error?.code === "GLINER2_API_CONNECTION_ERROR" || error?.name === "Gliner2ApiConnectionError") {
    return detail;
  }
  if (isPioneerApiTlsOrConnectionDetail(detail)) {
    return pioneerApiConnectionError(detail).message;
  }
  if (isGliner2RuntimeError(error) || detail.includes(GLINER2_SETUP_COMMAND)) return detail;
  return runtimeError(detail || "unknown error").message;
}

function safeDiagnostic(value) {
  return String(value || "")
    .replace(/\b(?:Bearer|Key)\s+\S+/gi, "[redacted authorization]")
    .replace(/[A-Za-z0-9+/=]{100,}/g, "[encoded data]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function rejectPending(error) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(error);
  }
  pending.clear();
}

function stopSidecar(error, active = runtime) {
  if (!active) return;
  if (runtime === active) runtime = null;
  clearTimeout(active.startupTimer);
  if (!active.ready) active.rejectReady(error);
  rejectPending(error);
  if (!active.child.killed) active.child.kill();
}

function acceptLine(active, line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  // Hugging Face / torch progress sometimes leaks to stdout before ready.
  if (!trimmed.startsWith("{")) {
    if (!active.ready) {
      ikealiveLog("gliner2", "startup-noise", { detail: safeDiagnostic(trimmed).slice(0, 160) });
    } else {
      ikealiveWarn("gliner2", "error", { stage: "protocol", reason: "non-JSON stdout from sidecar" });
    }
    return;
  }
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    if (!active.ready) {
      ikealiveLog("gliner2", "startup-noise", { detail: safeDiagnostic(trimmed).slice(0, 160) });
    } else {
      ikealiveWarn("gliner2", "error", { stage: "protocol", reason: "non-JSON stdout from sidecar" });
    }
    return;
  }
  if (message?.type === "ready") {
    if (active.ready) return;
    active.ready = true;
    active.mode = message.mode || null;
    active.provider = message.provider || null;
    if (message.model) active.model = message.model;
    clearTimeout(active.startupTimer);
    ikealiveLog("gliner2", "ready", {
      python: message.python || active.python,
      packageVersion: message.packageVersion || null,
      model: message.model || active.model,
      mode: message.mode || null,
      provider: message.provider || null,
      protocol: message.protocol || null,
    });
    active.resolveReady(active);
    return;
  }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  const elapsedMs = Date.now() - request.startedAt;
  if (message.ok) {
    ikealiveLog("gliner2", "response", {
      requestId: request.requestId,
      id: message.id,
      operation: request.operation,
      elapsedMs,
      resultKeys: message.result && typeof message.result === "object" ? Object.keys(message.result).slice(0, 10) : [],
    });
    request.resolve(message.result);
    return;
  }
  const detail = safeDiagnostic(message.error) || "inference failed";
  const error = gliner2FailureFromDetail(detail, null, "GLINER2_INFERENCE_ERROR");
  ikealiveWarn("gliner2", isGliner2ApiConnectionError(error) ? "api-tls" : "error", {
    requestId: request.requestId,
    id: message.id,
    operation: request.operation,
    stage: "inference",
    elapsedMs,
    reason: error.message,
    code: error.code,
  });
  request.reject(error);
}

function forwardStderr(active, chunk) {
  active.stderrBuffer += String(chunk);
  const lines = active.stderrBuffer.split("\n");
  active.stderrBuffer = lines.pop() || "";
  for (const line of lines) {
    const detail = safeDiagnostic(line);
    if (!detail) continue;
    active.recentStderr = [...(active.recentStderr || []), detail].slice(-8);
    ikealiveWarn("gliner2", "stderr", { detail });
  }
}

function ensureSidecar({ startupTimeoutMs } = {}) {
  if (runtime) return runtime.readyPromise;
  const python = pythonExecutable();
  const model = modelId();
  const sidecar = sidecarPath();
  // Pioneer API is primary; HF_* only matter for optional local from_pretrained fallback.
  const inherited = [
    "PATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "PYTHONPATH",
    "PIONEER_API_KEY",
    "GLINER2_API_KEY",
    "GLINER2_API_BASE_URL",
    "GLINER2_MODE",
    // CA / TLS for Pioneer api.fastino.ai (never disable verify by default).
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "HF_HOME",
    "TRANSFORMERS_CACHE",
    "TORCH_HOME",
    "HF_TOKEN",
    "HUGGING_FACE_HUB_TOKEN",
  ];
  const env = Object.fromEntries(inherited.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GLINER2_") && value != null) env[key] = value;
  }
  const pioneerKeyed = Boolean(String(process.env.PIONEER_API_KEY || process.env.GLINER2_API_KEY || "").trim());
  ikealiveLog("gliner2", "python", { executable: python, sidecar });
  ikealiveLog("gliner2", "model", {
    id: model,
    pioneerApiKey: pioneerKeyed ? "[set]" : "[empty]",
    mode: String(process.env.GLINER2_MODE || "auto"),
  });
  const child = spawn(python, [sidecar], {
    cwd: ROOT,
    env: { ...env, GLINER2_MODEL: model },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const active = {
    child,
    python,
    model,
    sidecar,
    ready: false,
    readyPromise,
    resolveReady,
    rejectReady,
    stdoutBuffer: "",
    stderrBuffer: "",
    recentStderr: [],
    startupTimer: null,
  };
  runtime = active;
  const timeout = positiveMs(
    startupTimeoutMs ?? process.env.GLINER2_STARTUP_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
  );
  active.startupTimer = setTimeout(() => {
    const error = runtimeError(
      `model startup timed out after ${timeout} ms`,
      null,
      "GLINER2_STARTUP_TIMEOUT",
    );
    ikealiveWarn("gliner2", "timeout", { stage: "startup", model, timeoutMs: timeout });
    stopSidecar(error, active);
  }, timeout);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    active.stdoutBuffer += chunk;
    const lines = active.stdoutBuffer.split("\n");
    active.stdoutBuffer = lines.pop() || "";
    for (const line of lines) if (line.trim()) acceptLine(active, line);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    forwardStderr(active, chunk);
  });
  child.on("error", (cause) => {
    const error = gliner2FailureFromDetail(
      cause?.code === "ENOENT" ? `Python executable not found: ${python}` : cause?.message,
      cause,
    );
    ikealiveWarn("gliner2", "error", { stage: "spawn", python, reason: cause?.message || cause });
    stopSidecar(error, active);
  });
  child.on("exit", (code, signal) => {
    if (runtime !== active) return;
    if (active.stderrBuffer.trim()) forwardStderr(active, "\n");
    const stderrTail = (active.recentStderr || []).join(" | ");
    const exited = `sidecar exited before ${active.ready ? "response" : "ready"} (${signal || code || "unknown"})`;
    const detail = stderrTail && isPioneerApiTlsOrConnectionDetail(stderrTail) ? stderrTail : exited;
    const error = gliner2FailureFromDetail(detail);
    ikealiveWarn("gliner2", isGliner2ApiConnectionError(error) ? "api-tls" : "error", {
      stage: active.ready ? "runtime" : "startup",
      code,
      signal,
      reason: error.message,
    });
    stopSidecar(error, active);
  });
  return readyPromise;
}

export async function inferWithGliner2(
  request,
  {
    inferFn,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    requestId = null,
  } = {},
) {
  if (inferFn) return Promise.resolve(inferFn(request));
  const active = await ensureSidecar({ startupTimeoutMs });
  if (runtime !== active || !active.ready) throw runtimeError("sidecar stopped before inference");
  const child = active.child;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const operation = String(request?.operation || "unknown");
    const textChars = String(request?.text || "").length;
    const requestTimeout = positiveMs(timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    ikealiveLog("gliner2", "request", { requestId, id, operation, textChars, timeoutMs: requestTimeout });
    const timer = setTimeout(() => {
      pending.delete(id);
      const error = runtimeError(
        `inference timed out after ${requestTimeout} ms`,
        null,
        "GLINER2_INFERENCE_TIMEOUT",
      );
      ikealiveWarn("gliner2", "timeout", { requestId, id, operation, timeoutMs: requestTimeout });
      reject(error);
      stopSidecar(error, active);
    }, requestTimeout);
    pending.set(id, { resolve, reject, timer, startedAt, requestId, operation });
    child.stdin.write(`${JSON.stringify({ id, ...request })}\n`, (error) => {
      if (!error) return;
      clearTimeout(timer);
      pending.delete(id);
      const wrapped = gliner2FailureFromDetail(`could not write to sidecar: ${safeDiagnostic(error.message)}`, error);
      ikealiveWarn("gliner2", "error", { requestId, id, operation, stage: "write", reason: error.message });
      reject(wrapped);
      stopSidecar(wrapped, active);
    });
  });
}

export async function ensureGliner2Ready(deps = {}) {
  if (deps.glinerInfer) return { status: "mocked", ready: true, model: modelId() };
  const active = await ensureSidecar({ startupTimeoutMs: deps.glinerStartupTimeoutMs });
  return { status: "ready", ready: true, python: active.python, model: active.model };
}

export function gliner2RuntimeStatus() {
  return {
    status: runtime?.ready ? "ready" : runtime ? "starting" : "idle",
    ready: Boolean(runtime?.ready),
    python: runtime?.python || pythonExecutable(),
    model: runtime?.model || modelId(),
    mode: runtime?.mode || null,
    provider: runtime?.provider || null,
    pioneerApiKey: Boolean(String(process.env.PIONEER_API_KEY || process.env.GLINER2_API_KEY || "").trim()),
    setupCommand: GLINER2_SETUP_COMMAND,
  };
}

export function logGliner2Configuration() {
  const status = gliner2RuntimeStatus();
  ikealiveLog("gliner2", "python", { executable: status.python });
  ikealiveLog("gliner2", "model", { id: status.model });
  return status;
}

export function stopGliner2Sidecar() {
  if (!runtime) return;
  const error = runtimeError("sidecar stopped");
  stopSidecar(error);
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
    {
      inferFn: deps.glinerInfer,
      timeoutMs: deps.glinerTimeoutMs,
      startupTimeoutMs: deps.glinerStartupTimeoutMs,
      requestId: deps.requestId,
    },
  );
  const title = firstRecord(result, "assembly_guide")?.title || "";
  const rows = Array.isArray(result?.assembly_step) ? result.assembly_step : [];
  const steps = rows
    .map((row) => {
      const body = String(
        row?.instruction || row?.body || row?.text || row?.description || "",
      ).trim();
      return {
        number: Number.parseInt(row?.sequence_number ?? row?.number, 10) || undefined,
        body,
        action: String(row?.action || "").trim(),
        partsUsed: asList(row?.parts || row?.partsUsed),
        toolRequired: row?.tool || row?.toolRequired ? String(row.tool || row.toolRequired) : null,
        warnings: asList(row?.warnings),
      };
    })
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
    {
      inferFn: deps.glinerInfer,
      timeoutMs: deps.glinerTimeoutMs,
      startupTimeoutMs: deps.glinerStartupTimeoutMs,
      requestId: deps.requestId,
    },
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

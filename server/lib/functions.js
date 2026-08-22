import { getPart } from "./catalog.js";
import { analyzeSketch, runSketch, sketchFromFunctions } from "./firmware.js";
import { engineeringReport } from "./physics.js";

export const PIECE_FUNCTIONS = ["support", "light", "sense", "control", "decorate"];
export const ELECTRONICS_FUNCTIONS = ["light", "sense", "control"];

export function isPieceFunction(label) {
  return PIECE_FUNCTIONS.includes(String(label || "").toLowerCase());
}

export function normalizeFunction(label) {
  if (label == null || label === "") return null;
  const key = String(label).toLowerCase().trim();
  return isPieceFunction(key) ? key : null;
}

export function suggestFunction(part) {
  if (!part) return "decorate";
  if (part.firmwareRole === "led") return "light";
  if (part.firmwareRole === "button") return "sense";
  if (part.firmwareRole === "mcu") return "control";
  if (part.category === "electronics") return "control";
  if (part.shape === "post" || /leg/.test(part.id || "")) return "support";
  if (part.category === "furniture") return "support";
  return "decorate";
}

export function electronicsFunctions(labels = []) {
  return [...new Set(labels.map((f) => String(f || "").toLowerCase()))].filter((f) =>
    ELECTRONICS_FUNCTIONS.includes(f),
  );
}

function pieceName(piece) {
  return getPart(piece.partId)?.name || piece.partId;
}

function groupByFunction(project) {
  const roles = Object.fromEntries(PIECE_FUNCTIONS.map((fn) => [fn, []]));
  const unlabeled = [];
  for (const piece of project.pieces || []) {
    const fn = normalizeFunction(piece.functionLabel);
    if (fn) roles[fn].push(piece);
    else unlabeled.push(piece);
  }
  return { roles, unlabeled };
}

function named(pieces) {
  return pieces.map(pieceName).join(", ");
}

function notesForRoles(roles, unlabeled, report) {
  const notes = [];
  const jobs = PIECE_FUNCTIONS.filter((fn) => roles[fn].length);
  notes.push(
    jobs.length
      ? `Behavior: ${jobs.join(" + ")}.`
      : "Behavior: physical suite only — assign jobs on the pieces.",
  );

  if (roles.support.length) {
    const failed = (report.issues || []).filter((issue) =>
      roles.support.some((piece) => piece.partId === issue.partId),
    );
    notes.push(
      failed.length
        ? `Support (${named(roles.support)}) is overstressed: ${failed.map((i) => i.detail).join(" ")}`
        : `Support (${named(roles.support)}) carries the load.`,
    );
  }

  if (roles.decorate.length) {
    notes.push(`Decorate (${named(roles.decorate)}) is appearance only — it does not carry load.`);
  }

  if (roles.control.length) {
    notes.push(`Control (${named(roles.control)}) runs the board loop.`);
  }

  if (roles.light.length) {
    notes.push(
      roles.sense.length
        ? `Light (${named(roles.light)}) follows sense (${named(roles.sense)}).`
        : `Light (${named(roles.light)}) blinks on the programmed pin.`,
    );
  } else if (roles.sense.length) {
    notes.push(`Sense (${named(roles.sense)}) is wired, but no light job is assigned.`);
  }

  if (unlabeled.length) {
    notes.push(`${unlabeled.length} piece${unlabeled.length === 1 ? "" : "s"} still have no job.`);
  }

  const rainShort = (report.issues || []).some((issue) => /rain short/i.test(issue.detail || ""));
  if (rainShort && (roles.light.length || roles.sense.length || roles.control.length)) {
    notes.push("Rain reaches the electronics — tape or shade the board.");
  }

  const supportFailed = (report.issues || []).some((issue) =>
    roles.support.some((piece) => piece.partId === issue.partId),
  );
  if (supportFailed && roles.light.length) {
    notes.push("The light still blinks, but the support stack yields.");
  }

  if ((report.issues || []).length && !supportFailed) {
    notes.push(
      `Suite flags: ${report.issues.map((i) => `${i.partId} ${i.kind}`).join(", ")}.`,
    );
  } else if (!(report.issues || []).length && (projectHasPieces(roles) || unlabeled.length)) {
    notes.push("Still in one piece.");
  }

  return notes;
}

function projectHasPieces(roles) {
  return PIECE_FUNCTIONS.some((fn) => roles[fn].length);
}

/**
 * One Lab behavior pass: physics suite on every piece, then firmware when
 * light / sense / control jobs are on the bench.
 */
export function simulateBehavior(project, options = {}) {
  const pieces = project.pieces || [];
  if (!pieces.length) {
    return {
      ok: true,
      notes: ["Nothing on the bench to simulate."],
      report: { title: "Overall system stresses", rows: [], issues: [], breakingPoints: [] },
      firmware: null,
      functions: [],
      roles: Object.fromEntries(PIECE_FUNCTIONS.map((fn) => [fn, []])),
    };
  }

  const tape = getPart(options.tapeId || project.tapes?.[0]?.tapeId || "tape-gaffer");
  const parts = pieces.map((piece) => getPart(piece.partId)).filter(Boolean);
  const report = engineeringReport(parts, { tapePart: tape, ...options });
  const { roles, unlabeled } = groupByFunction(project);
  const fwFns = electronicsFunctions([
    ...roles.light.map(() => "light"),
    ...roles.sense.map(() => "sense"),
    ...roles.control.map(() => "control"),
  ]);

  let firmware = null;
  if (fwFns.length) {
    const source = sketchFromFunctions(fwFns);
    const run = runSketch(source, { buttonDown: Boolean(options.buttonDown) });
    firmware = {
      functions: fwFns,
      source,
      analysis: analyzeSketch(source),
      ...run,
    };
    if (project.firmware) {
      project.firmware.source = source;
      project.firmware.lastRun = run;
    }
  }

  const notes = notesForRoles(roles, unlabeled, report);
  if (firmware) {
    notes.push(
      fwFns.includes("sense") && fwFns.includes("light")
        ? "Firmware: button on D2 gates the lamp on D13."
        : fwFns.includes("light") || fwFns.includes("control")
          ? "Firmware: the light blinks on D13."
          : "Firmware ran with no light job.",
    );
  }

  return {
    ok: (report.issues || []).length === 0,
    notes,
    report,
    firmware,
    functions: fwFns,
    roles: Object.fromEntries(
      PIECE_FUNCTIONS.map((fn) => [fn, roles[fn].map((piece) => ({ id: piece.id, partId: piece.partId }))]),
    ),
  };
}

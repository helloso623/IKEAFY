import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

import {
  cheaperAlternatives,
  getPart,
  listParts,
  PARTNERS,
  searchParts,
} from "./lib/catalog.js";
import { manageBundle, routeCable } from "./lib/cables.js";
import { engineeringReport, runSuite, stackSim } from "./lib/physics.js";
import {
  attachBroken,
  colorizePlate,
  defaultGuide,
  expandStep,
  generateFix,
  makeVideoPlan,
  officialGuide,
  officialProducts,
  parseGuide,
  parseGuideAsync,
  reviewsForGuide,
  searchOfficialProducts,
  shoppingListAsync,
  storyboardForStep,
  verifyOfficialGuide,
} from "./lib/ikeafy.js";
import {
  assemblyView,
  confirmStep,
  editStep,
  getAssembly,
  goBack,
  peekStep,
  skipStep,
  startAssemblyAsync,
  stuckOn,
} from "./lib/assembly.js";
import {
  SPARES_POLICY,
  classifySpare,
  fittingsForStep,
  freeFittingsRequest,
  listFreeFittings,
} from "./lib/fittings.js";
import { requestSpare } from "./lib/spares.js";
import { hasFal, renderStepVideo } from "./lib/video.js";
import { hasTavily } from "./lib/tavily.js";
import { extractPdfText } from "./lib/pdf-text.js";
import { analyzeSketch, runSketch, sketchFromFunctions } from "./lib/firmware.js";
import { isPieceFunction, normalizeFunction, PIECE_FUNCTIONS, simulateBehavior } from "./lib/functions.js";
import { exportPrintJob } from "./lib/printer.js";
import { ROSTER, chat, hasHostedBrain } from "./lib/agents.js";
import { usableOpenAiKey } from "./lib/secrets.js";
import { orderInRoom, planRoom } from "./lib/adaptation.js";
import {
  addCable,
  addJoint,
  addPiece,
  addTape,
  benchChrome,
  catalogPreview,
  emptyProject,
  isolateAsBoard,
  labelFunction,
  movePiece,
  persistLabTool,
  removeJoint,
  removePiece,
  resetSim,
  rescale,
  retexture,
  seedLampTable,
  snapshotSim,
} from "./lib/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, "..", ".env"));

const VIDEO_PARTNERS = {
  seedance: {
    name: "ByteDance Seedance 2.5",
    model: "bytedance/seedance-2.5/text-to-video",
    status: "optional",
    note: "Rendered through fal.ai when FAL_KEY is set; otherwise the local canvas storyboard plays.",
  },
  fal: {
    name: "fal.ai",
    status: "optional",
    keyed: hasFal(),
    note: "Set FAL_KEY to let lib/video.js call Seedance 2.5. Nothing leaves the machine without it.",
  },
};

const app = express();
app.use(express.json({ limit: "16mb" }));

const state = {
  project: seedLampTable(),
  guide: defaultGuide(),
  adaptation: planRoom({ want: "table", budget: 40 }),
};

app.get("/api/health", (_req, res) => {
  const official = officialGuide();
  res.json({
    ok: true,
    name: "IKEAlive",
    hostedAgents: hasHostedBrain(),
    partners: PARTNERS,
    video: {
      partners: VIDEO_PARTNERS,
      renderer: hasFal() ? "bytedance/seedance-2.5 via fal.ai" : "local-storyboard",
      live: hasFal(),
      route: "/api/ikeafy/video/render",
      reel: "/api/ikeafy/video/reel",
    },
    shopping: {
      partner: hasTavily() ? "tavily" : "tavily-standin",
      live: hasTavily(),
      route: "/api/ikeafy/shopping",
      note: hasTavily()
        ? "Tavily looks up IKEA / Amazon / hardware shops for tools you still need."
        : "Set TAVILY_API_KEY to scrape live shop links for missing tools.",
    },
    official: {
      route: "/api/ikeafy/official",
      products: officialProducts().length,
      locked: official.locked === true,
      title: official.title,
      assemblyRoute: "/api/assembly/start",
    },
    spares: {
      route: "/api/spares/request",
      freeFittings: listFreeFittings().length,
      policy: SPARES_POLICY.free,
    },
    bench: benchChrome(state.project),
  });
});

app.get("/api/catalog", (req, res) => {
  const maxCost = req.query.maxCost ? Number(req.query.maxCost) : Infinity;
  const minSpecs = {};
  if (req.query.loadKg) minSpecs.loadKg = Number(req.query.loadKg);
  if (req.query.voltage) minSpecs.voltage = Number(req.query.voltage);
  res.json(
    searchParts({
      query: req.query.q || "",
      maxCost,
      category: req.query.category,
      store: req.query.store,
      minSpecs,
    }),
  );
});

app.get("/api/catalog/all", (_req, res) => {
  res.json(catalogPreview());
});

app.post("/api/search", (req, res) => {
  res.json({
    query: req.body?.query || "",
    results: searchParts(req.body || {}),
    note: "Tavily stand-in — catalog list with IKEA, Amazon and local offers. No live scrape yet.",
  });
});

app.post("/api/physics/run", (req, res) => {
  const part = getPart(req.body?.partId || "lack-top");
  const tape = req.body?.tapeId ? getPart(req.body.tapeId) : getPart("tape-gaffer");
  if (!part) return res.status(404).json({ error: "Unknown part" });
  const report = runSuite(part, tape, req.body || {});
  persistLabTool(state.project, "sim", report);
  res.json(report);
});

app.post("/api/physics/system", (req, res) => {
  const parts = (req.body?.partIds || state.project.pieces.map((p) => p.partId))
    .map((id) => getPart(id))
    .filter(Boolean);
  const tape = getPart(req.body?.tapeId || "tape-gaffer");
  const report = engineeringReport(parts, { tapePart: tape, ...req.body });
  persistLabTool(state.project, "sim", report);
  res.json(report);
});

/**
 * Lab strip: one Run sim that stacks strength / weather / heat / rain / tape /
 * force over everything on the bench and reads the function graph back
 * (a piece labeled "light" tells the client to blink the LED).
 */
app.post("/api/physics/sim", (req, res) => {
  const rows = state.project.pieces
    .map((piece) => ({ piece, part: getPart(piece.partId) }))
    .filter((row) => row.part);
  const tape = getPart(req.body?.tapeId || "tape-gaffer");
  const report = stackSim(rows, tape, req.body || {});
  state.project.sim.lastReport = report;
  res.json(report);
});

app.post("/api/cables/route", (req, res) => {
  const a = getPart(req.body?.fromPart);
  const b = getPart(req.body?.toPart);
  const pa = a?.ports?.find((p) => p.id === req.body?.fromPort);
  const pb = b?.ports?.find((p) => p.id === req.body?.toPort);
  res.json(routeCable(pa, pb, req.body || {}));
});

app.post("/api/cables/bundle", (req, res) => {
  res.json(manageBundle(req.body?.cables || state.project.cables, req.body || {}));
});

app.post("/api/ikeafy/parse", async (req, res) => {
  let raw = req.body?.guide || "";
  if (req.body?.pdfBase64) {
    const extracted = extractPdfText(Buffer.from(String(req.body.pdfBase64), "base64"));
    raw = [extracted, raw].filter(Boolean).join("\n\n");
  }
  const guide = await parseGuideAsync(raw, {
    instructions: req.body?.instructions || "",
    availableTools: req.body?.availableTools || [],
    images: req.body?.images || [],
  });
  state.guide = guide;
  res.json(guide);
});

app.get("/api/ikeafy/default", (_req, res) => {
  res.json(state.guide);
});

app.get("/api/ikeafy/official", (req, res) => {
  const guide = officialGuide({ article: req.query.article });
  if (guide?.ok === false) return res.status(404).json(guide);
  res.json(guide);
});

app.get("/api/ikeafy/official/products", (req, res) => {
  res.json({
    products: searchOfficialProducts(req.query.q || ""),
    locked: true,
    policy: SPARES_POLICY.free,
  });
});

app.post("/api/ikeafy/official/verify", (req, res) => {
  res.json(verifyOfficialGuide(req.body?.guide || officialGuide({ article: req.body?.article })));
});

app.post("/api/ikeafy/expand", (req, res) => {
  res.json(expandStep(state.guide, req.body?.step || 1, { stuckNote: req.body?.note || "" }));
});

function guideForVideo(body = {}) {
  const stored = body.runId ? getAssembly(body.runId) : null;
  if (stored?.guide) return stored.guide;
  if (typeof body.guide === "string" && body.guide.trim()) return parseGuide(body.guide, body);
  if (body.guide && typeof body.guide === "object" && Array.isArray(body.guide.steps)) return body.guide;
  return state.guide;
}

app.post("/api/ikeafy/video", (req, res) => {
  res.json(makeVideoPlan(guideForVideo(req.body || {})));
});

app.post("/api/ikeafy/video/render", async (req, res) => {
  const body = req.body || {};
  const stored = body.runId ? getAssembly(body.runId) : null;
  const guide = guideForVideo(body);
  const stepNumber = Number(body.stepNumber ?? body.step ?? stored?.cursor ?? 1);
  try {
    const result = await renderStepVideo({
      guide,
      stepNumber,
      extra: body.instructions || body.extra || "",
    });
    if (stored?.guide) state.guide = stored.guide;
    res.json({
      ok: true,
      stepNumber,
      live: result.provider !== "local-storyboard",
      partners: VIDEO_PARTNERS,
      plan: result.frames.length ? result.frames : storyboardForStep(guide, stepNumber),
      ...result,
    });
  } catch (err) {
    res.status(502).json({ ok: false, stepNumber, error: String(err.message || err) });
  }
});

app.post("/api/ikeafy/video/reel", async (req, res) => {
  const body = req.body || {};
  const guide = guideForVideo(body);
  const steps = [];
  try {
    for (const step of guide?.steps || []) {
      const result = await renderStepVideo({
        guide,
        stepNumber: step.number,
        imageDataUrl: body.imageDataUrl,
      });
      steps.push({
        number: step.number,
        live: result.provider !== "local-storyboard",
        plan: result.frames.length ? result.frames : storyboardForStep(guide, step.number),
        ...result,
      });
    }
    const live = steps.find((step) => step.videoUrl);
    res.json({
      ok: true,
      reel: true,
      live: Boolean(live),
      partners: VIDEO_PARTNERS,
      videoUrl: live?.videoUrl || null,
      steps,
    });
  } catch (err) {
    res.status(502).json({ ok: false, reel: true, error: String(err.message || err) });
  }
});

app.get("/api/spares/fittings", (_req, res) => {
  res.json({ fittings: listFreeFittings(), policy: SPARES_POLICY });
});

/**
 * Free-fittings request. The letter comes from lib/spares.js, the free-vs-paid
 * call and the article numbers come from lib/fittings.js — IKEA has no public
 * spare-parts API, so this drafts what you send rather than pretending to send it.
 */
app.post(["/api/spares/request", "/api/ikeafy/spare"], (req, res) => {
  const body = req.body || {};
  const runId = body.runId;
  const run = runId ? assemblyView(runId) : null;
  const guide = run?.ok ? state.guide : body.guide ? parseGuide(body.guide, body) : state.guide;
  const stepNumber = Number(body.stepNumber ?? body.step ?? run?.run?.cursor ?? 1);
  const step = run?.ok ? run.step : guide.steps.find((s) => s.number === stepNumber);
  const part = body.partId ? getPart(body.partId) : null;

  const classified = classifySpare({
    articleNumber: body.articleNumber,
    note: body.note || "",
    part,
    fittingKind: body.fittingKind,
  });
  const suggested = fittingsForStep(step);
  const wanted = body.fittings?.length
    ? body.fittings
    : classified.fitting
      ? [{ ...classified.fitting, qty: Math.max(1, Number(body.qty) || 1) }]
      : suggested.map((f) => ({ ...f, qty: 1 }));

  const request = freeFittingsRequest({
    productName: run?.ok ? run.guide.product?.name || run.guide.title : guide.title,
    productArticle: body.productArticle || guide.productArticle || run?.guide?.product?.article || "",
    fittings: wanted,
    stepNumber,
    note: body.note || "",
    photoName: body.photoName || "",
    contact: body.contact || {},
  });

  res.json({
    ok: true,
    free: classified.free || request.free,
    classification: classified,
    suggested,
    request,
    // The hand-written letter from lib/spares.js, kept for the article-number lookup it does.
    letter: requestSpare({
      guide,
      stepNumber,
      note: body.note || "",
      photoName: body.photoName || "",
      article: body.articleNumber,
    }),
  });
});

/**
 * Assembly runs. The client can draw whatever buttons it likes: the cursor,
 * the confirmations and the refusals all live here.
 */
app.post("/api/assembly/start", async (req, res) => {
  const result = await startAssemblyAsync(req.body || {});
  if (result.ok && getAssembly(result.run?.id)?.guide) {
    state.guide = getAssembly(result.run.id).guide;
  }
  res.status(result.ok ? 200 : 400).json(result);
});

app.get("/api/assembly/:id", (req, res) => {
  const result = assemblyView(req.params.id);
  res.status(result.ok ? 200 : 404).json(result);
});

app.get("/api/assembly/:id/step/:number", (req, res) => {
  const result = peekStep(req.params.id, req.params.number);
  res.status(result.ok ? 200 : result.locked ? 423 : 404).json(result);
});

app.post("/api/assembly/:id/confirm", (req, res) => {
  const result = confirmStep(req.params.id, req.body || {});
  res.status(result.ok ? 200 : result.locked || result.needsConfirmation ? 409 : 404).json(result);
});

app.post("/api/assembly/:id/back", (req, res) => {
  const result = goBack(req.params.id, req.body?.step);
  res.status(result.ok ? 200 : 409).json(result);
});

app.post("/api/assembly/:id/skip", (req, res) => {
  const result = skipStep(req.params.id, req.body?.step);
  // 423 Locked: the official sheet refuses, and says so.
  res.status(result.ok ? 200 : result.locked ? 423 : 404).json(result);
});

app.post("/api/assembly/:id/edit", (req, res) => {
  const result = editStep(req.params.id, req.body?.step, req.body || {});
  res.status(result.ok ? 200 : result.locked ? 423 : 404).json(result);
});

app.post("/api/assembly/:id/stuck", (req, res) => {
  const result = stuckOn(req.params.id, req.body?.note || "");
  res.status(result.ok ? 200 : 404).json(result);
});

app.post("/api/ikeafy/colorize", (req, res) => {
  const step = state.guide.steps.find((s) => s.number === Number(req.body?.step || 1));
  res.json(colorizePlate(step || state.guide.steps[0]));
});

app.get("/api/ikeafy/reviews", (_req, res) => {
  res.json(reviewsForGuide(state.guide));
});

app.post("/api/ikeafy/broken", (req, res) => {
  res.json(
    attachBroken({
      guide: state.guide,
      stepNumber: req.body?.step || 1,
      note: req.body?.note || "",
      photoName: req.body?.photoName || "broken.jpg",
    }),
  );
});

app.post("/api/ikeafy/fix", (req, res) => {
  res.json(generateFix(req.body?.reviewId || "r1"));
});

app.get("/api/ikeafy/shopping", async (_req, res) => {
  res.json(await shoppingListAsync(state.guide));
});

app.get("/api/agents", (_req, res) => {
  res.json({ roster: ROSTER, hosted: hasHostedBrain(), fallback: "local-steward" });
});

app.post("/api/agents/chat", async (req, res) => {
  const reply = await chat(req.body?.message || "", {
    project: state.project,
    guide: state.guide,
    costBarrier: req.body?.costBarrier,
    step: req.body?.step,
    partId: req.body?.partId,
    room: req.body?.room,
  });
  res.json(reply);
});

app.get("/api/project", (_req, res) => {
  res.json({ ...state.project, chrome: benchChrome(state.project) });
});

app.post("/api/project/seed", (req, res) => {
  state.project = req.body?.empty ? emptyProject() : seedLampTable();
  res.json({ ...state.project, chrome: benchChrome(state.project) });
});

app.post("/api/project/add", (req, res) => {
  try {
    const pose = { ...(req.body?.pose || {}) };
    if (req.body?.functionLabel !== undefined) pose.functionLabel = req.body.functionLabel;
    const piece = addPiece(state.project, req.body?.partId, pose);
    res.json(piece);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.post("/api/project/remove", (req, res) => {
  const removed = removePiece(state.project, req.body?.id);
  if (!removed) return res.status(404).json({ ok: false, error: "No piece with that id." });
  res.json({ ok: true, removed, chrome: benchChrome(state.project) });
});

app.post("/api/project/move", (req, res) => {
  res.json(movePiece(state.project, req.body?.id, req.body || {}) || { error: "missing" });
});

app.post("/api/project/rescale", (req, res) => {
  res.json(rescale(state.project, req.body?.id, req.body?.scale ?? 1));
});

app.post("/api/project/retexture", (req, res) => {
  res.json(retexture(state.project, req.body?.id, req.body || {}));
});

app.post("/api/project/cable", (req, res) => {
  res.json(
    addCable(
      state.project,
      req.body?.fromPiece,
      req.body?.fromPort,
      req.body?.toPiece,
      req.body?.toPort,
    ),
  );
});

app.post("/api/project/tape", (req, res) => {
  res.json(addTape(state.project, req.body?.tapeId || "tape-gaffer", req.body?.pieceIds || []));
});

app.post("/api/project/joint", (req, res) => {
  try {
    res.json(addJoint(state.project, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.post("/api/project/joint/remove", (req, res) => {
  const removed = removeJoint(state.project, req.body?.id);
  if (!removed) return res.status(404).json({ ok: false, error: "No joint with that id." });
  res.json({ ok: true, removed });
});

app.get("/api/project/functions", (_req, res) => {
  res.json({ functions: PIECE_FUNCTIONS });
});

app.post("/api/project/label", (req, res) => {
  const raw = req.body?.label;
  if (raw != null && raw !== "" && !isPieceFunction(raw)) {
    return res.status(400).json({ error: "Unknown function", functions: PIECE_FUNCTIONS });
  }
  const piece = labelFunction(state.project, req.body?.id, normalizeFunction(raw) ?? raw);
  if (!piece) return res.status(404).json({ error: "No piece with that id." });
  res.json(piece);
});

app.post("/api/project/isolate", (req, res) => {
  res.json(isolateAsBoard(state.project, req.body?.pieceIds || [], req.body?.label || "board"));
});

app.post("/api/project/sim/start", (_req, res) => {
  res.json(snapshotSim(state.project));
});

app.post("/api/project/sim/reset", (_req, res) => {
  res.json(resetSim(state.project));
});

app.post("/api/project/sim/behavior", (req, res) => {
  snapshotSim(state.project);
  const result = simulateBehavior(state.project, req.body || {});
  persistLabTool(state.project, "sim", result);
  res.json(result);
});

app.get("/api/project/lab", (_req, res) => {
  res.json(state.project.labTools);
});

app.post("/api/project/lab/:tool", (req, res) => {
  try {
    const value = req.body?.value ?? req.body ?? null;
    res.json({ tool: req.params.tool, value: persistLabTool(state.project, req.params.tool, value) });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.post("/api/export/print", (_req, res) => {
  const parts = state.project.pieces.map((p) => getPart(p.partId)).filter(Boolean);
  const job = exportPrintJob(parts);
  persistLabTool(state.project, "generate", { kind: "print", job });
  res.json(job);
});

app.post("/api/firmware/generate", (req, res) => {
  const source = sketchFromFunctions(req.body?.functions || ["light", "sense"]);
  state.project.firmware.source = source;
  persistLabTool(state.project, "generate", { kind: "firmware", source });
  res.json({ source });
});

app.post("/api/firmware/run", (req, res) => {
  const source = req.body?.source || state.project.firmware.source || sketchFromFunctions(["light"]);
  const result = runSketch(source, { buttonDown: Boolean(req.body?.buttonDown) });
  state.project.firmware.lastRun = result;
  res.json({ analysis: analyzeSketch(source), ...result });
});

app.post("/api/adaptation/plan", (req, res) => {
  state.adaptation = planRoom(req.body || {});
  res.json(state.adaptation);
});

app.post("/api/adaptation/order", (req, res) => {
  state.adaptation = orderInRoom(state.adaptation, req.body || {});
  res.json(state.adaptation);
});

app.get("/api/parts/:id", (req, res) => {
  const part = getPart(req.params.id);
  if (!part) return res.status(404).json({ error: "Unknown part" });
  res.json({ part, cheaper: cheaperAlternatives(part.id) });
});

app.get("/api/parts", (_req, res) => {
  res.json(listParts());
});

const dist = path.join(__dirname, "..", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(`IKEAFY bench on :${port} — agents ${hasHostedBrain() ? "hosted+local" : "local steward"}`);
});

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key] || (key === "OPENAI_API_KEY" && !usableOpenAiKey(process.env[key]))) {
      process.env[key] = value;
    }
  }
}

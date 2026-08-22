import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

import {
  cheaperAlternatives,
  filterLabCatalog,
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
  scannedObjectGuide,
  searchOfficialProducts,
  shoppingListAsync,
  verifyOfficialGuide,
} from "./lib/ikeafy.js";
import {
  assemblyView,
  confirmStep,
  editStep,
  getAssembly,
  goBack,
  normalizeRenderMode,
  peekStep,
  sceneLockFor,
  setAssemblyRenderMode,
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
import { FAL_REQUIRED, hasFal, renderStepVideo } from "./lib/video.js";
import { FAL_IMAGE_REQUIRED, renderStepImage } from "./lib/image.js";
import { FAL_SCENE_REQUIRED, MODEL as TRIPO_MODEL, QUEUE as TRIPO_QUEUE, renderStepScene } from "./lib/scene.js";
import { hasTavily, findIkeaManual } from "./lib/tavily.js";
import { ikealiveLog, ikealiveWarn } from "./lib/log.js";
import { extractPdfText } from "./lib/pdf-text.js";
import { analyzeSketch, runSketch, sketchFromFunctions } from "./lib/firmware.js";
import { isPieceFunction, normalizeFunction, PIECE_FUNCTIONS, simulateBehavior } from "./lib/functions.js";
import { exportPrintJob } from "./lib/printer.js";
import { ROSTER, chat, hasHostedBrain } from "./lib/agents.js";
import { usableOpenAiKey } from "./lib/secrets.js";
import { orderInRoom, planRoom, scanAssemblies } from "./lib/adaptation.js";
import {
  addCable,
  addJoint,
  addPiece,
  addTape,
  benchChrome,
  catalogPreview,
  discardLastEdit,
  duplicatePiece,
  editStatus,
  emptyProject,
  isolateAsBoard,
  labelFunction,
  movePiece,
  persistLabTool,
  pickPose,
  projectPayload,
  rememberEdit,
  removeJoint,
  removePiece,
  resetSim,
  rescale,
  retexture,
  redoEdit,
  snapPose,
  snapshotSim,
  undoEdit,
} from "./lib/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, "..", ".env"));

const VIDEO_PARTNERS = {
  seedance: {
    name: "ByteDance Seedance 2.5",
    model: "bytedance/seedance-2.5/text-to-video",
    status: "optional",
    note: "Rendered through fal.ai when FAL_KEY is set. Without a key the watch UI asks you to set FAL_KEY — it does not play a canvas stand-in.",
  },
  fal: {
    name: "fal.ai",
    status: "optional",
    keyed: hasFal(),
    note: "Set FAL_KEY to let lib/video.js call Seedance 2.5. Nothing leaves the machine without it.",
  },
};

const IMAGE_PARTNERS = {
  nanoBanana: {
    name: "Nano Banana 2",
    model: "fal-ai/nano-banana-2",
    status: "optional",
    note: "Instruction stills through fal.ai when FAL_KEY is set. Without a key the watch UI asks you to set FAL_KEY — it does not draw a LACK table.",
  },
  fal: {
    name: "fal.ai",
    status: "optional",
    keyed: hasFal(),
    note: "Set FAL_KEY to let lib/image.js call Nano Banana 2. Nothing leaves the machine without it.",
  },
};

const SCENE_PARTNERS = {
  tripo: {
    name: "Tripo H3.1",
    model: TRIPO_MODEL,
    status: "optional",
    note: "Text-to-3D meshes through fal.ai when FAL_KEY is set. Without a key the watch UI asks you to set FAL_KEY — it does not draw a catalog LACK table.",
  },
  fal: {
    name: "fal.ai",
    status: "optional",
    keyed: hasFal(),
    note: "Set FAL_KEY to let lib/scene.js call Tripo H3.1. Nothing leaves the machine without it.",
  },
};

const app = express();
app.use(express.json({ limit: "16mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === "null" || origin === "file://") {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const state = {
  project: emptyProject(),
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
      renderer: hasFal() ? "bytedance/seedance-2.5 via fal.ai" : "none",
      live: hasFal(),
      route: "/api/ikeafy/video/render",
      reel: "/api/ikeafy/video/reel",
    },
    image: {
      partners: IMAGE_PARTNERS,
      renderer: hasFal() ? "fal-ai/nano-banana-2 via fal.ai" : "none",
      live: hasFal(),
      route: "/api/ikeafy/image/render",
    },
    scene: {
      partners: SCENE_PARTNERS,
      renderer: hasFal() ? "tripo3d/h3.1/text-to-3d via fal.ai" : "none",
      live: hasFal(),
      route: "/api/ikeafy/scene/render",
      queue: TRIPO_QUEUE,
    },
    render: {
      route: "/api/ikeafy/render",
      modes: ["video", "images", "scene"],
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
  const dimsMm = {};
  if (req.query.x || req.query.maxX) dimsMm.x = Number(req.query.x || req.query.maxX);
  if (req.query.y || req.query.maxY) dimsMm.y = Number(req.query.y || req.query.maxY);
  if (req.query.z || req.query.maxZ) dimsMm.z = Number(req.query.z || req.query.maxZ);
  const query = req.query.q || "";
  const showElectronics = /^(1|true|yes)$/i.test(String(req.query.electronics || ""));
  res.json(
    filterLabCatalog(
      searchParts({
        query,
        maxCost,
        category: req.query.category,
        store: req.query.store,
        minSpecs,
        dimsMm: dimsMm.x || dimsMm.y || dimsMm.z ? dimsMm : undefined,
      }),
      { query, showElectronics },
    ),
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

app.post("/api/ikeafy/scan-plan", (req, res) => {
  const guide = scannedObjectGuide(req.body || {});
  state.guide = guide;
  res.json(guide);
});

app.post("/api/ikeafy/parse", async (req, res) => {
  const images = req.body?.images || [];
  const hasPlates = images.some((image) =>
    String(image?.dataUrl || image?.url || "").startsWith("data:image"),
  );
  ikealiveLog("parse", "POST /api/ikeafy/parse", {
    plates: images.length,
    hasGuideText: Boolean(req.body?.guide),
    hasPdfBase64: Boolean(req.body?.pdfBase64),
  });
  let raw = req.body?.guide || "";
  if (!hasPlates && req.body?.pdfBase64) {
    const extracted = extractPdfText(Buffer.from(String(req.body.pdfBase64), "base64"));
    raw = [extracted, raw].filter(Boolean).join("\n\n");
  }
  const guide = await parseGuideAsync(raw, {
    instructions: req.body?.instructions || "",
    availableTools: req.body?.availableTools || [],
    images,
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

app.post("/api/ikeafy/manual", async (req, res) => {
  const productName = req.body?.productName || req.body?.q || "";
  ikealiveLog("tavily", "POST /api/ikeafy/manual", { productName: String(productName).slice(0, 80) });
  try {
    const found = await findIkeaManual(productName);
    res.json({
      ...found,
      pdfBase64: found.pdfBase64 || null,
    });
  } catch (err) {
    ikealiveWarn("tavily", "manual lookup error", err?.message || err);
    res.status(502).json({ ok: false, reason: String(err.message || err) });
  }
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

function rememberRenderMode(body = {}) {
  const stored = body.runId ? getAssembly(body.runId) : null;
  const mode = normalizeRenderMode(body.renderMode || body.mode) || stored?.renderMode || null;
  if (stored && mode) stored.renderMode = mode;
  return { stored, mode };
}

function renderLock(body = {}) {
  const { stored, mode } = rememberRenderMode(body);
  const guide = guideForVideo(body);
  const { bible, seed } = sceneLockFor(body.runId, guide);
  return { stored, mode, guide, bible, seed };
}

app.post("/api/ikeafy/render", (req, res) => {
  const body = req.body || {};
  const mode = normalizeRenderMode(body.mode || body.renderMode);
  const runId = body.runId || null;
  if (!mode) {
    return res.status(400).json({ ok: false, reason: "Pick video, images, or 3D instructions." });
  }
  ikealiveLog("render", "mode chosen", { mode, runId });
  if (runId) {
    const updated = setAssemblyRenderMode(runId, mode);
    if (!updated.ok) ikealiveWarn("render", "run missing", { runId, mode });
  }
  if (mode === "scene") {
    ikealiveLog("3d", "model", { model: TRIPO_MODEL, queue: TRIPO_QUEUE, runId });
    return res.json({
      ok: true,
      mode,
      renderMode: mode,
      implemented: true,
      engine: "workshop",
      renderer: TRIPO_MODEL,
      queue: TRIPO_QUEUE,
      reason: null,
    });
  }
  if (mode === "video" || mode === "images") {
    return res.json({ ok: true, mode, renderMode: mode, implemented: true, reason: null });
  }
  const reason = "Unknown instruction render mode.";
  ikealiveLog("render", "unimplemented", { mode, reason });
  res.json({ ok: true, mode, renderMode: mode, implemented: false, reason });
});

app.post("/api/ikeafy/video", (req, res) => {
  res.json(makeVideoPlan(guideForVideo(req.body || {})));
});

app.post("/api/ikeafy/video/render", async (req, res) => {
  const body = req.body || {};
  const { stored, mode, guide, bible, seed } = renderLock(body);
  const stepNumber = Number(body.stepNumber ?? body.step ?? stored?.cursor ?? 1);
  const renderMode = mode || "video";
  ikealiveLog("video", "POST /api/ikeafy/video/render", {
    stepNumber,
    runId: body.runId || null,
    keyed: hasFal(),
    renderMode,
  });
  if (renderMode !== "video") {
    const reason =
      renderMode === "images"
        ? "Image mode uses Nano Banana 2 stills, not Seedance."
        : "3D instructions use Tripo H3.1, not Seedance.";
    ikealiveLog("render", "video route skipped", { mode: renderMode, reason });
    return res.json({
      ok: true,
      implemented: false,
      mode: renderMode,
      renderMode,
      stepNumber,
      videoUrl: null,
      reason,
    });
  }
  try {
    const result = await renderStepVideo({
      guide,
      stepNumber,
      extra: body.instructions || body.extra || "",
      bible,
      seed,
    });
    if (stored?.guide) state.guide = stored.guide;
    if (!result.videoUrl) {
      return res.status(503).json({
        ok: false,
        stepNumber,
        live: false,
        error: result.reason || FAL_REQUIRED,
        videoUrl: null,
        partners: VIDEO_PARTNERS,
      });
    }
    res.json({
      ok: true,
      stepNumber,
      live: true,
      partners: VIDEO_PARTNERS,
      videoUrl: result.videoUrl,
      provider: result.provider,
      prompt: result.prompt,
    });
  } catch (err) {
    ikealiveWarn("video", "render error", { stepNumber, error: String(err.message || err) });
    res.status(502).json({ ok: false, stepNumber, error: String(err.message || err) });
  }
});

app.post("/api/ikeafy/video/reel", async (req, res) => {
  const body = req.body || {};
  const { mode, guide, bible, seed } = renderLock(body);
  const renderMode = mode || "video";
  ikealiveLog("video", "POST /api/ikeafy/video/reel", {
    steps: guide?.steps?.length || 0,
    keyed: hasFal(),
    renderMode,
  });
  if (renderMode !== "video") {
    const reason =
      renderMode === "images"
        ? "Image mode uses Nano Banana 2 stills, not Seedance."
        : "3D instructions use Tripo H3.1, not Seedance.";
    ikealiveLog("render", "reel skipped", { mode: renderMode, reason });
    return res.json({
      ok: true,
      implemented: false,
      mode: renderMode,
      renderMode,
      reel: true,
      videoUrl: null,
      steps: [],
      reason,
    });
  }
  if (!hasFal()) {
    ikealiveWarn("video", "missing FAL_KEY — reel skipped");
    return res.status(503).json({
      ok: false,
      reel: true,
      live: false,
      error: FAL_REQUIRED,
      videoUrl: null,
      steps: [],
      partners: VIDEO_PARTNERS,
    });
  }
  const steps = [];
  try {
    for (const step of guide?.steps || []) {
      const result = await renderStepVideo({
        guide,
        stepNumber: step.number,
        extra: body.instructions || body.extra || "",
        bible,
        seed,
      });
      if (!result.videoUrl) {
        return res.status(503).json({
          ok: false,
          reel: true,
          live: false,
          error: result.reason || FAL_REQUIRED,
          videoUrl: null,
          steps,
          partners: VIDEO_PARTNERS,
        });
      }
      steps.push({
        number: step.number,
        live: true,
        videoUrl: result.videoUrl,
        provider: result.provider,
      });
    }
    res.json({
      ok: true,
      reel: true,
      live: true,
      partners: VIDEO_PARTNERS,
      videoUrl: steps[0]?.videoUrl || null,
      steps,
    });
  } catch (err) {
    ikealiveWarn("video", "reel error", { error: String(err.message || err), done: steps.length });
    res.status(502).json({ ok: false, reel: true, error: String(err.message || err) });
  }
});

app.post("/api/ikeafy/image/render", async (req, res) => {
  const body = req.body || {};
  const { stored, mode, guide, bible, seed } = renderLock(body);
  const stepNumber = Number(body.stepNumber ?? body.step ?? stored?.cursor ?? 1);
  const renderMode = mode || "images";
  ikealiveLog("image", "POST /api/ikeafy/image/render", {
    stepNumber,
    runId: body.runId || null,
    keyed: hasFal(),
    renderMode,
  });
  if (renderMode !== "images") {
    const reason =
      renderMode === "video"
        ? "Video mode uses Seedance films, not Nano Banana stills."
        : "3D instructions use Tripo H3.1, not Nano Banana stills.";
    ikealiveLog("image", "image route skipped", { mode: renderMode, reason });
    return res.json({
      ok: true,
      implemented: false,
      mode: renderMode,
      renderMode,
      stepNumber,
      imageUrl: null,
      reason,
    });
  }
  try {
    const result = await renderStepImage({
      guide,
      stepNumber,
      extra: body.instructions || body.extra || "",
      bible,
      seed,
    });
    if (stored?.guide) state.guide = stored.guide;
    if (!result.imageUrl) {
      return res.status(503).json({
        ok: false,
        stepNumber,
        live: false,
        error: result.reason || FAL_IMAGE_REQUIRED,
        imageUrl: null,
        partners: IMAGE_PARTNERS,
      });
    }
    res.json({
      ok: true,
      stepNumber,
      live: true,
      partners: IMAGE_PARTNERS,
      imageUrl: result.imageUrl,
      provider: result.provider,
      prompt: result.prompt,
    });
  } catch (err) {
    ikealiveWarn("image", "render error", { stepNumber, error: String(err.message || err) });
    res.status(502).json({ ok: false, stepNumber, error: String(err.message || err) });
  }
});

app.post("/api/ikeafy/scene/render", async (req, res) => {
  const body = req.body || {};
  const { stored, mode, guide, bible, seed } = renderLock(body);
  const stepNumber = Number(body.stepNumber ?? body.step ?? stored?.cursor ?? 1);
  const renderMode = mode || "scene";
  ikealiveLog("3d", "POST /api/ikeafy/scene/render", {
    stepNumber,
    runId: body.runId || null,
    keyed: hasFal(),
    renderMode,
    model: TRIPO_MODEL,
  });
  if (renderMode !== "scene") {
    const reason =
      renderMode === "video"
        ? "Video mode uses Seedance films, not Tripo meshes."
        : "Image mode uses Nano Banana 2 stills, not Tripo meshes.";
    ikealiveLog("3d", "scene route skipped", { mode: renderMode, reason });
    return res.json({
      ok: true,
      implemented: false,
      mode: renderMode,
      renderMode,
      stepNumber,
      meshUrl: null,
      reason,
    });
  }
  try {
    const result = await renderStepScene({
      guide,
      stepNumber,
      extra: body.instructions || body.extra || "",
      bible,
      seed,
    });
    if (stored?.guide) state.guide = stored.guide;
    if (!result.meshUrl) {
      return res.status(503).json({
        ok: false,
        stepNumber,
        live: false,
        error: result.reason || FAL_SCENE_REQUIRED,
        meshUrl: null,
        model: TRIPO_MODEL,
        partners: SCENE_PARTNERS,
      });
    }
    res.json({
      ok: true,
      stepNumber,
      live: true,
      partners: SCENE_PARTNERS,
      meshUrl: result.meshUrl,
      provider: result.provider,
      model: result.model,
      prompt: result.prompt,
      engine: "workshop",
    });
  } catch (err) {
    ikealiveWarn("3d", "render error", { stepNumber, error: String(err.message || err) });
    res.status(502).json({ ok: false, stepNumber, error: String(err.message || err) });
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
  const body = req.body || {};
  ikealiveLog("assembly", "POST /api/assembly/start", {
    mode: body.mode || "official",
    article: body.article || null,
    plates: Array.isArray(body.images) ? body.images.length : 0,
    hasGuideText: Boolean(body.guide),
    renderMode: normalizeRenderMode(body.renderMode) || null,
  });
  const result = await startAssemblyAsync(req.body || {});
  if (result.ok && getAssembly(result.run?.id)?.guide) {
    state.guide = getAssembly(result.run.id).guide;
  }
  if (result.ok) {
    ikealiveLog("assembly", "run ready", {
      runId: result.run?.id || null,
      mode: result.run?.mode || body.mode || null,
      steps: result.outline?.length || result.run?.total || 0,
    });
  } else {
    ikealiveWarn("assembly", "start failed", { reason: result.reason || null });
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
  ikealiveLog("assembly", "confirm", {
    runId: req.params.id,
    step: req.body?.step ?? null,
    ok: result.ok,
    cursor: result.run?.cursor ?? result.cursor ?? null,
  });
  res.status(result.ok ? 200 : result.locked || result.needsConfirmation ? 409 : 404).json(result);
});

app.post("/api/assembly/:id/back", (req, res) => {
  const result = goBack(req.params.id, req.body?.step);
  ikealiveLog("assembly", "back", {
    runId: req.params.id,
    step: req.body?.step ?? null,
    ok: result.ok,
    cursor: result.run?.cursor ?? null,
  });
  res.status(result.ok ? 200 : 409).json(result);
});

app.post("/api/assembly/:id/skip", (req, res) => {
  const result = skipStep(req.params.id, req.body?.step);
  ikealiveLog("assembly", "skip", {
    runId: req.params.id,
    step: req.body?.step ?? null,
    ok: result.ok,
    locked: Boolean(result.locked),
  });
  // 423 Locked: the official sheet refuses, and says so.
  res.status(result.ok ? 200 : result.locked ? 423 : 404).json(result);
});

app.post("/api/assembly/:id/edit", (req, res) => {
  const result = editStep(req.params.id, req.body?.step, req.body || {});
  ikealiveLog("assembly", "edit", { runId: req.params.id, step: req.body?.step ?? null, ok: result.ok });
  res.status(result.ok ? 200 : result.locked ? 423 : 404).json(result);
});

app.post("/api/assembly/:id/stuck", (req, res) => {
  const result = stuckOn(req.params.id, req.body?.note || "");
  ikealiveLog("assembly", "stuck", {
    runId: req.params.id,
    ok: result.ok,
    step: result.stillOnStep ?? null,
  });
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

app.post(["/api/chat", "/api/agents/chat"], async (req, res) => {
  const message = String(req.body?.message || "").trim();
  try {
    const reply = await chat(message, {
      project: state.project,
      guide: state.guide,
      costBarrier: req.body?.costBarrier,
      step: req.body?.step,
      partId: req.body?.partId,
      room: req.body?.room,
      scene: req.body?.scene,
      history: req.body?.history,
      photoName: req.body?.photoName || "",
    });
    res.json({ ok: true, ...reply });
  } catch (error) {
    ikealiveWarn("agents", "chat error", String(error?.message || error));
    res.json({
      ok: true,
      agent: ROSTER.find((agent) => agent.id === "creative"),
      backend: "local-steward",
      text: message
        ? "I couldn’t complete that edit. Try describing the room or object with dimensions."
        : "Tell me what room or object you want to create.",
      actions: [],
    });
  }
});

app.get("/api/project", (_req, res) => {
  res.json(projectPayload(state.project));
});

app.post("/api/project/seed", (_req, res) => {
  state.project = emptyProject();
  res.json(projectPayload(state.project));
});

app.post("/api/project/add", (req, res) => {
  try {
    rememberEdit(state.project);
    const pose = { ...(req.body?.pose || {}) };
    if (req.body?.functionLabel !== undefined) pose.functionLabel = req.body.functionLabel;
    const piece = addPiece(state.project, req.body?.partId, pose);
    state.project.selection = piece.id;
    res.json({ ...piece, edit: editStatus(state.project) });
  } catch (err) {
    discardLastEdit(state.project);
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.post("/api/project/remove", (req, res) => {
  const existing = state.project.pieces.find((p) => p.id === req.body?.id);
  if (!existing) return res.status(404).json({ ok: false, error: "No piece with that id." });
  rememberEdit(state.project);
  const removed = removePiece(state.project, req.body?.id);
  res.json({ ok: true, removed, chrome: benchChrome(state.project), edit: editStatus(state.project) });
});

app.post("/api/project/move", (req, res) => {
  const id = req.body?.id;
  if (!state.project.pieces.some((p) => p.id === id)) {
    return res.status(404).json({ ok: false, error: "No piece with that id." });
  }
  rememberEdit(state.project);
  let pose = pickPose(req.body);
  if (req.body?.snap) pose = snapPose(pose);
  const piece = movePiece(state.project, id, pose);
  res.json({ ok: true, piece, edit: editStatus(state.project) });
});

app.post("/api/project/duplicate", (req, res) => {
  const id = req.body?.id;
  if (!state.project.pieces.some((p) => p.id === id)) {
    return res.status(404).json({ ok: false, error: "No piece with that id." });
  }
  rememberEdit(state.project);
  const piece = duplicatePiece(state.project, id, req.body?.offset);
  res.json({ ok: true, piece, chrome: benchChrome(state.project), edit: editStatus(state.project) });
});

app.post("/api/project/undo", (_req, res) => {
  const edit = undoEdit(state.project);
  if (!edit) return res.status(400).json({ ok: false, error: "Nothing to undo." });
  res.json({ ok: true, ...projectPayload(state.project) });
});

app.post("/api/project/redo", (_req, res) => {
  const edit = redoEdit(state.project);
  if (!edit) return res.status(400).json({ ok: false, error: "Nothing to redo." });
  res.json({ ok: true, ...projectPayload(state.project) });
});

app.post("/api/project/rescale", (req, res) => {
  if (!state.project.pieces.some((p) => p.id === req.body?.id)) {
    return res.status(404).json({ ok: false, error: "No piece with that id." });
  }
  rememberEdit(state.project);
  const piece = rescale(state.project, req.body?.id, req.body?.scale ?? 1);
  res.json({ ok: true, piece, edit: editStatus(state.project) });
});

app.post("/api/project/retexture", (req, res) => {
  if (!state.project.pieces.some((p) => p.id === req.body?.id)) {
    return res.status(404).json({ ok: false, error: "No piece with that id." });
  }
  rememberEdit(state.project);
  const piece = retexture(state.project, req.body?.id, req.body || {});
  res.json({ ok: true, piece, edit: editStatus(state.project) });
});

app.post("/api/project/cable", (req, res) => {
  rememberEdit(state.project);
  const result = addCable(
    state.project,
    req.body?.fromPiece,
    req.body?.fromPort,
    req.body?.toPiece,
    req.body?.toPort,
  );
  // ERC refusals are data, not errors — the wire simply is not drawn.
  if (result?.ok === false) {
    discardLastEdit(state.project);
    return res.json(result);
  }
  res.json({ ...result, edit: editStatus(state.project) });
});

app.post("/api/project/tape", (req, res) => {
  rememberEdit(state.project);
  res.json({
    ...addTape(state.project, req.body?.tapeId || "tape-gaffer", req.body?.pieceIds || []),
    edit: editStatus(state.project),
  });
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
  const existing = state.project.pieces.find((p) => p.id === req.body?.id);
  if (!existing) return res.status(404).json({ error: "No piece with that id." });
  rememberEdit(state.project);
  const piece = labelFunction(state.project, req.body?.id, normalizeFunction(raw) ?? raw);
  res.json({ ...piece, edit: editStatus(state.project) });
});

app.post("/api/project/isolate", (req, res) => {
  rememberEdit(state.project);
  res.json({
    ...isolateAsBoard(state.project, req.body?.pieceIds || [], req.body?.label || "board"),
    edit: editStatus(state.project),
  });
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

app.post("/api/adaptation/scan", (req, res) => {
  res.json(scanAssemblies(req.body || {}));
});

app.post("/api/catalog/scan", (req, res) => {
  res.json(scanAssemblies(req.body || {}));
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
  ikealiveLog("video", "ready", { port, keyed: hasFal() });
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
    const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    if (!process.env[key] || (key === "OPENAI_API_KEY" && !usableOpenAiKey(process.env[key]))) {
      process.env[key] = value;
    }
  }
}

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
import { engineeringReport, runSuite } from "./lib/physics.js";
import {
  attachBroken,
  colorizePlate,
  defaultGuide,
  expandStep,
  generateFix,
  makeVideoPlan,
  parseGuide,
  reviewsForGuide,
  shoppingList,
} from "./lib/ikeafy.js";
import { analyzeSketch, runSketch, sketchFromFunctions } from "./lib/firmware.js";
import { exportPrintJob } from "./lib/printer.js";
import { ROSTER, chat, hasHostedBrain } from "./lib/agents.js";
import { usableOpenAiKey } from "./lib/secrets.js";
import { orderInRoom, planRoom } from "./lib/adaptation.js";
import {
  addCable,
  addPiece,
  addTape,
  catalogPreview,
  emptyProject,
  isolateAsBoard,
  labelFunction,
  movePiece,
  resetSim,
  rescale,
  retexture,
  seedLampTable,
  snapshotSim,
} from "./lib/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, "..", ".env"));

const app = express();
app.use(express.json({ limit: "8mb" }));

const state = {
  project: seedLampTable(),
  guide: defaultGuide(),
  adaptation: planRoom({ want: "table", budget: 40 }),
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "IKEAFY",
    hostedAgents: hasHostedBrain(),
    partners: PARTNERS,
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
    note: "List only — Tavily scrape is a later partner hook.",
  });
});

app.post("/api/physics/run", (req, res) => {
  const part = getPart(req.body?.partId || "lack-top");
  const tape = req.body?.tapeId ? getPart(req.body.tapeId) : getPart("tape-gaffer");
  if (!part) return res.status(404).json({ error: "Unknown part" });
  const report = runSuite(part, tape, req.body || {});
  state.project.sim.lastReport = report;
  res.json(report);
});

app.post("/api/physics/system", (req, res) => {
  const parts = (req.body?.partIds || state.project.pieces.map((p) => p.partId))
    .map((id) => getPart(id))
    .filter(Boolean);
  const tape = getPart(req.body?.tapeId || "tape-gaffer");
  res.json(engineeringReport(parts, { tapePart: tape, ...req.body }));
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

app.post("/api/ikeafy/parse", (req, res) => {
  const guide = parseGuide(req.body?.guide, {
    instructions: req.body?.instructions || "",
    availableTools: req.body?.availableTools || [],
  });
  state.guide = guide;
  res.json(guide);
});

app.get("/api/ikeafy/default", (_req, res) => {
  res.json(state.guide);
});

app.post("/api/ikeafy/expand", (req, res) => {
  res.json(expandStep(state.guide, req.body?.step || 1, { stuckNote: req.body?.note || "" }));
});

app.post("/api/ikeafy/video", (req, res) => {
  const guide = req.body?.guide ? parseGuide(req.body.guide, req.body) : state.guide;
  res.json(makeVideoPlan(guide));
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

app.get("/api/ikeafy/shopping", (_req, res) => {
  res.json(shoppingList(state.guide));
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
  res.json(state.project);
});

app.post("/api/project/seed", (req, res) => {
  state.project = req.body?.empty ? emptyProject() : seedLampTable();
  res.json(state.project);
});

app.post("/api/project/add", (req, res) => {
  try {
    const piece = addPiece(state.project, req.body?.partId, req.body?.pose || {});
    res.json(piece);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
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

app.post("/api/project/label", (req, res) => {
  res.json(labelFunction(state.project, req.body?.id, req.body?.label));
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

app.post("/api/export/print", (_req, res) => {
  const parts = state.project.pieces.map((p) => getPart(p.partId)).filter(Boolean);
  res.json(exportPrintJob(parts));
});

app.post("/api/firmware/generate", (req, res) => {
  const source = sketchFromFunctions(req.body?.functions || ["light", "sense"]);
  state.project.firmware.source = source;
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

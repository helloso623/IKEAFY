import { cheaperAlternatives, getPart, listParts, searchParts } from "./catalog.js";
import { engineeringReport, runSuite } from "./physics.js";
import { parseGuide, expandStep, defaultGuide } from "./ikeafy.js";
import { planRoom } from "./adaptation.js";
import { sketchFromFunctions } from "./firmware.js";
import { addPiece, isolateAsBoard, labelFunction, persistLabTool } from "./project.js";
import { usableOpenAiKey } from "./secrets.js";

export const ROSTER = [
  {
    id: "creative",
    name: "Creative",
    model: "fable",
    role: "orchestration",
    tool: "blender",
    blurb: "Blender-like form, materials, renders and build storytelling.",
  },
  {
    id: "cad",
    name: "CAD",
    model: "opus",
    role: "hard",
    tool: "fusion",
    blurb: "Fusion-like parametric solids, assemblies and manufacture checks.",
  },
  {
    id: "sim",
    name: "Sim",
    model: "gpt-5.6",
    role: "hard",
    tool: "physics",
    blurb: "FEA, breaking points, safety factors, motion and tape hold.",
  },
  {
    id: "eda",
    name: "EDA",
    model: "gpt-5.6",
    role: "hard",
    tool: "kicad",
    blurb: "KiCad-like schematics, PCBs, nets, footprints and isolation.",
  },
  {
    id: "lab",
    name: "Physics lab",
    model: "gpt-5.6",
    role: "hard",
    blurb: "Rain, heat, flow, aero, wave, speed.",
  },
  {
    id: "shop",
    name: "Shop grok",
    model: "grok",
    role: "easy",
    blurb: "Move, rotate, camera, rescale, retexture.",
  },
  {
    id: "scout",
    name: "Parts scout",
    model: "grok",
    role: "easy",
    blurb: "Catalog list, cost barrier, IKEA/Amazon stand-ins.",
  },
  {
    id: "assembler",
    name: "Assembler",
    model: "grok",
    role: "easy",
    blurb: "IKEAFY steps, expand, wait, spare parts.",
  },
  {
    id: "firmware",
    name: "Firmware tech",
    model: "gpt-5.6",
    role: "hard",
    blurb: "Arduino sketches as a code abstraction.",
  },
  {
    id: "stylist",
    name: "Stylist",
    model: "house",
    role: "easy",
    tool: "house",
    blurb: "House style, room photo overlay and adaptation plan.",
  },
];

const CAD_HINTS =
  /\b(cad|fusion(?:\s*360)?|parametric|solidworks|step file|stp file|iges|manufactur|extrude|fillet|chamfer|dimensioned drawing)\b/i;
const EDA_HINTS =
  /\b(eda|kicad|pcb|schematic|netlist|footprint|gerber|ground plane|copper pour|drc|erc)\b/i;
const SIM_HINTS =
  /\b(sim|simulate|simulation|physics|fea|finite element|cfd|stress|strain|breaking point|safety factor|collision|kinematic|load case)\b/i;
const CREATIVE_HINTS =
  /\b(blender|render|animation|material study|concept art|product shot|visuali[sz]ation)\b/i;
const HARD_HINTS = /stress|break|aero|flow|weather|rain|heat|cold|firmware|arduino|circuit|architect|optim/i;
const IKEA_HINTS = /ikea|step|guide|spare|review|stuck|video|assemble/i;
const ROOM_HINTS = /room|photo|ar\b|adapt|measure|house|place/i;
const MOVE_HINTS = /move|rotate|camera|scale|texture|color|zoom/i;
const PART_HINTS = /add |find |cheap|cost|part|component|ikea|amazon|put |drop |generate|make |build |create /i;
const CATALOG_ASK =
  /\b(find|cheap|cheaper|catalog|shelf|sku|part|component|lack|linnmon|linmon|table|budget|under\s+\$?\d|amazon|leg|lamp)\b/i;
const STEP_LOCK = /\b(step\s+\d+|i'?m stuck|spare|allen key|cam lock|guide|manual|assemble|this step)\b/i;
const ELECTRONICS_ASK =
  /arduino|nano|esp32|led|firmware|sketch|pin\b|board|circuit|usb|header|button|lamp|light|wire|cable/i;
const SMALL_QUESTION =
  /^(where|what|which|how many|do i|is the|can i|which tool|what tool|what part|included|in the box|this step|allen|screw|dowel|leg|top)\b/i;
const COMPLEX_QUESTION =
  /fix|broken|regenerate|redesign|calculate|rewrite|rebuild|why (is|does|did)|stuck for|explain how to|design a|optim/i;
const BENCH_COMMAND =
  /\b(add|put|drop|place|generate|make|build|create|move|rotate|label|isolate)\b/i;
const CREATIVE_ASK = /\b(generate|make a|build a|create a|design a|invent|add |put |drop )\b/i;
const QTY_WORDS = {
  one: 1,
  two: 2,
  pair: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const NOUN_PARTS = {
  leg: "lack-leg",
  legs: "lack-leg",
  top: "lack-top",
  tops: "lack-top",
  table: "lack-table",
  tables: "lack-table",
  lack: "lack-table",
  led: "led-5mm",
  leds: "led-5mm",
  button: "tactile-btn",
  buttons: "tactile-btn",
  nano: "arduino-nano",
};
const LAMP_KIT = [
  { partId: "arduino-nano", pose: { x: 0.08, y: 0.26, z: 0.04 }, label: "control" },
  { partId: "led-5mm", pose: { x: 0.14, y: 0.26, z: 0.04 }, label: "light" },
  { partId: "tactile-btn", pose: { x: 0.02, y: 0.26, z: 0.04 }, label: "sense" },
];
const LEG_CORNERS = [
  [-0.23, 0, -0.23],
  [0.23, 0, -0.23],
  [-0.23, 0, 0.23],
  [0.23, 0, 0.23],
];

function isCatalogAsk(text) {
  return CATALOG_ASK.test(text) || PART_HINTS.test(text);
}

function isElectronicsAsk(text) {
  return ELECTRONICS_ASK.test(String(text || ""));
}

export function isCreativeAsk(text) {
  return CREATIVE_ASK.test(String(text || ""));
}

function catalogNeedle(message) {
  const lower = String(message || "").toLowerCase();
  for (const token of ["led", "table", "tape", "lack", "linnmon", "linmon", "arduino", "nano", "esp32", "cable", "leg", "dowel", "screw", "lamp", "button"]) {
    if (lower.includes(token)) return token === "linmon" ? "linnmon" : token;
  }
  return lower
    .replace(/[?!.,]/g, " ")
    .replace(/\b(what|which|who|where|when|why|how|can|could|should|is|are|do|does|did|will|would|please|find|show|list|get|search|look|recommend|suggest|help|me|my|a|an|the|some|any|for|with|under|over|cheap|cheaper|best|good|about|add|put|drop|place|generate|make|build|create|four|three|two|one)\b/g, " ")
    .replace(/\$?\d+(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldEscalate(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (CAD_HINTS.test(text) || EDA_HINTS.test(text) || SIM_HINTS.test(text)) return true;
  if (COMPLEX_QUESTION.test(text) || text.length > 180) return true;
  if (text.length < 110 && (SMALL_QUESTION.test(text) || IKEA_HINTS.test(text))) return false;
  return text.length > 140;
}

export function routeAgent(text) {
  const t = String(text || "");
  const benchCmd = BENCH_COMMAND.test(t) && !ROOM_HINTS.test(t);
  if (CAD_HINTS.test(t)) return ROSTER.find((a) => a.id === "cad");
  if (EDA_HINTS.test(t)) return ROSTER.find((a) => a.id === "eda");
  if (SIM_HINTS.test(t)) return ROSTER.find((a) => a.id === "sim");
  if (CREATIVE_HINTS.test(t)) return ROSTER.find((a) => a.id === "creative");
  if (ROOM_HINTS.test(t) && !isCatalogAsk(t) && !benchCmd) return ROSTER.find((a) => a.id === "stylist");
  if (isLampAsk(t)) return ROSTER.find((a) => a.id === "eda");
  if (isCatalogAsk(t) && !STEP_LOCK.test(t)) return ROSTER.find((a) => a.id === "scout");
  if (IKEA_HINTS.test(t)) return ROSTER.find((a) => a.id === "assembler");
  if (MOVE_HINTS.test(t)) return ROSTER.find((a) => a.id === "shop");
  if (/arduino|sketch|pin|firmware/i.test(t)) return ROSTER.find((a) => a.id === "firmware");
  if (/weather|rain|heat|flow|aero|wave/i.test(t)) return ROSTER.find((a) => a.id === "lab");
  if (/stress|break|load/i.test(t)) return ROSTER.find((a) => a.id === "sim");
  if (/board|net|isolat|circuit/i.test(t)) return ROSTER.find((a) => a.id === "eda");
  if (HARD_HINTS.test(t)) return ROSTER.find((a) => a.id === "cad");
  return ROSTER.find((a) => a.id === "creative");
}

function isLampAsk(text) {
  const t = String(text || "").toLowerCase();
  return /\b(lamp|night\s*light|desk\s*light)\b/.test(t);
}

function parseQtyNoun(text) {
  const match = String(text || "").match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|pair)\s+(legs?|tops?|leds?|buttons?|tables?|lack)\b/i,
  );
  if (!match) return null;
  const raw = match[1].toLowerCase();
  const qty = QTY_WORDS[raw] || Number(raw);
  if (!Number.isFinite(qty) || qty < 1) return null;
  const partId = NOUN_PARTS[match[2].toLowerCase()];
  if (!partId || !getPart(partId === "lack-table" ? "lack-table" : partId)) return null;
  return { qty: Math.min(qty, 12), partId };
}

function kitPose(partId, index) {
  if (/top/.test(partId)) return { x: 0, y: 0.225, z: 0 };
  if (/leg/.test(partId)) {
    const [x, y, z] = LEG_CORNERS[index % LEG_CORNERS.length];
    return { x, y, z };
  }
  return { x: 0.08 + index * 0.06, y: 0.26, z: 0.04 };
}

function expandPart(part) {
  if (!part) return [];
  if (!part.kitParts?.length) return [{ partId: part.id, pose: kitPose(part.id, 0) }];
  const seen = {};
  return part.kitParts.filter((id) => getPart(id)).map((id) => {
    seen[id] = seen[id] || 0;
    const index = seen[id];
    seen[id] += 1;
    return { partId: id, pose: kitPose(id, index) };
  });
}

function lampKitFromCatalog() {
  return LAMP_KIT.filter((item) => getPart(item.partId));
}

function furnitureOnlyHits(hits, message) {
  if (isElectronicsAsk(message)) return hits;
  const furniture = hits.filter((h) => h.category !== "electronics" && h.category !== "cable");
  return furniture.length ? furniture : hits.filter((h) => h.category !== "electronics" && h.category !== "cable");
}

function resolveAddList(message, ctx = {}) {
  const lower = String(message || "").toLowerCase();
  const costMatch = lower.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usd|dollar|budget|max)?/);
  const maxCost = costMatch ? Number(costMatch[1]) : ctx.costBarrier;

  if (isLampAsk(lower)) {
    return lampKitFromCatalog().map((item) => ({ ...item }));
  }

  const counted = parseQtyNoun(lower);
  if (counted && getPart(counted.partId)) {
    const part = getPart(counted.partId);
    if (part.kitParts?.length) {
      return expandPart(part);
    }
    return Array.from({ length: counted.qty }, (_, index) => ({
      partId: counted.partId,
      pose: kitPose(counted.partId, index),
    }));
  }

  const query = catalogNeedle(lower);
  let hits = searchParts({ query, maxCost: maxCost || Infinity });
  hits = furnitureOnlyHits(hits, lower).slice(0, 6);
  if (!hits[0]) return [];
  return expandPart(hits[0]);
}

function cameraAction(message) {
  const lower = String(message || "").toLowerCase();
  return {
    type: "camera",
    az: /left/.test(lower) ? 120 : /right/.test(lower) ? -20 : 42,
    el: /top|down/.test(lower) ? 70 : 28,
  };
}

function describeAdds(items) {
  const counts = new Map();
  for (const item of items) {
    const part = getPart(item.partId);
    const name = part?.name || item.partId;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, n]) => (n > 1 ? `${n}× ${name}` : name))
    .join(", ");
}

function stripElectronicsTalk(text) {
  return String(text || "")
    .replace(/\b(arduino|nano|esp32|firmware|sketch|breadboard|header pins?|mcu)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

/**
 * Lab creative desk: turn a spoken request into bench actions the client
 * can apply with api.add / camera / label / isolate.
 */
export function planCreativeActions(message, ctx = {}) {
  const lower = String(message || "").toLowerCase();
  const actions = [];
  let text = "";

  if (isLampAsk(lower) && /\b(generate|make|build|create|add|put|design|drop)\b/.test(lower)) {
    const kit = lampKitFromCatalog();
    if (!kit.length) {
      return {
        handles: true,
        text: "Nothing on the shelf can make a lamp — the catalog needs a nano, an LED, and a button.",
        actions,
      };
    }
    for (const item of kit) {
      actions.push({ type: "add", partId: item.partId, pose: item.pose });
      if (item.label) actions.push({ type: "label", partId: item.partId, label: item.label });
    }
    actions.push({ type: "isolate", label: "lamp-board" });
    text = `Placed ${describeAdds(kit)} on the bench as a lamp board.`;
    return { handles: true, text, actions };
  }

  if (/\b(add|put|drop|place|generate|make|build|create)\b/.test(lower) && !STEP_LOCK.test(lower)) {
    const items = resolveAddList(lower, ctx);
    if (items.length) {
      for (const item of items) actions.push({ type: "add", partId: item.partId, pose: item.pose || {} });
      text = `Dropped ${describeAdds(items)} on the bench.`;
      if (!isElectronicsAsk(lower)) text = stripElectronicsTalk(text) || text;
      return { handles: true, text, actions };
    }
    if (/\b(add|put|drop|generate|make)\b/.test(lower)) {
      return {
        handles: true,
        text: "Nothing on the shelf matches that. Try “table”, “lack”, or “tape”.",
        actions: [{ type: "catalog", hits: [] }],
      };
    }
  }

  if (MOVE_HINTS.test(lower) && !isCatalogAsk(lower)) {
    actions.push(cameraAction(lower));
    text = "Nudged the camera. Drag a piece to move or rotate it on the bench.";
    return { handles: true, text, actions };
  }

  if (/\blabel\b/.test(lower) && ctx.partId) {
    const label = (lower.match(/label(?:\s+(?:it|this|as))?\s+([a-z0-9-]+)/i) || [])[1] || "control";
    actions.push({ type: "label", partId: ctx.partId, label });
    text = `Labeled ${ctx.partId} as ${label}.`;
    return { handles: true, text, actions };
  }

  if (/\bisolat/.test(lower)) {
    actions.push({ type: "isolate", label: /lamp/.test(lower) ? "lamp-board" : "board" });
    text = "Isolated the grouped pieces as one board.";
    return { handles: true, text, actions };
  }

  return { handles: false, text, actions };
}

export function applyCreativeActions(project, actions) {
  if (!project || !Array.isArray(actions)) return actions || [];
  const added = [];
  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    if (action.type === "add" || action.type === "add_part") {
      if (!getPart(action.partId)) continue;
      const piece = addPiece(project, action.partId, action.pose || {});
      action.piece = piece;
      action.applied = true;
      added.push(piece);
    } else if (action.type === "label") {
      const id =
        action.id ||
        added.find((p) => p.partId === action.partId)?.id ||
        project.pieces.find((p) => p.partId === action.partId)?.id;
      if (id && action.label) {
        labelFunction(project, id, action.label);
        action.id = id;
        action.applied = true;
      }
    } else if (action.type === "isolate") {
      const ids = action.pieceIds?.length ? action.pieceIds : added.map((p) => p.id);
      if (ids.length) {
        isolateAsBoard(project, ids, action.label || "board");
        action.pieceIds = ids;
        action.applied = true;
      }
    }
  }
  return actions;
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[0]);
  } catch {
    return null;
  }
}

export function sanitizeActions(raw, { electronics = false } = {}) {
  const allowed = new Set(["add", "add_part", "camera", "label", "isolate"]);
  const out = [];
  for (const action of Array.isArray(raw) ? raw : []) {
    if (!action || !allowed.has(action.type)) continue;
    if (action.type === "add" || action.type === "add_part") {
      const part = getPart(action.partId);
      if (!part) continue;
      if (!electronics && (part.category === "electronics" || part.category === "cable")) continue;
      out.push({
        type: "add",
        partId: part.id,
        pose: action.pose && typeof action.pose === "object" ? action.pose : {},
      });
      continue;
    }
    if (action.type === "camera") {
      out.push({
        type: "camera",
        az: Number(action.az) || 42,
        el: Number(action.el) || 28,
        zoom: Number(action.zoom) || undefined,
      });
      continue;
    }
    if (action.type === "label") {
      if (!electronics) continue;
      out.push({ type: "label", partId: action.partId, id: action.id, label: String(action.label || "control") });
      continue;
    }
    if (action.type === "isolate") {
      if (!electronics) continue;
      out.push({
        type: "isolate",
        pieceIds: Array.isArray(action.pieceIds) ? action.pieceIds : undefined,
        label: String(action.label || "board"),
      });
    }
  }
  return out;
}

function localReply(message, ctx) {
  const agent = routeAgent(message);
  const hardLabTask = CAD_HINTS.test(message) || EDA_HINTS.test(message) || SIM_HINTS.test(message);
  const planned = hardLabTask
    ? { handles: false, text: "", actions: [] }
    : planCreativeActions(message, ctx);
  if (planned.handles) {
    applyCreativeActions(ctx.project, planned.actions);
    return {
      agent,
      backend: "local-steward",
      text: `${agent.name} (${agent.model}, local steward): ${planned.text}`,
      actions: planned.actions,
    };
  }

  const actions = [];
  const lower = message.toLowerCase();
  let text = `${agent.name} (${agent.model}, local steward): `;

  const costMatch = lower.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usd|dollar|budget|max)?/);
  const maxCost = costMatch ? Number(costMatch[1]) : ctx.costBarrier;

  if (agent.id === "scout" || /add |find |cheap/.test(lower)) {
    const query = catalogNeedle(lower);
    let hits = searchParts({ query, maxCost: maxCost || Infinity });
    hits = furnitureOnlyHits(hits, lower).slice(0, 6);
    if (!hits.length) {
      text += "Nothing on the shelf matches that. Try “table”, “lack”, or “tape”.";
      actions.push({ type: "catalog", hits: [] });
    } else {
      const cap = maxCost && Number.isFinite(Number(maxCost)) ? ` under $${maxCost}` : "";
      text += `On the shelf${cap}: ${hits.map((h) => `${h.name} · $${h.cost}${h.store ? ` at ${h.store}` : ""}`).join("; ")}.`;
      actions.push({ type: "catalog", hits });
    }
  } else if (agent.id === "assembler") {
    const guide = ctx.guide || defaultGuide();
    if (/stuck|expand|help|can't|cannot/.test(lower)) {
      const step = Number((lower.match(/step\s+(\d+)/) || [])[1] || ctx.step || 1);
      const expanded = expandStep(guide, step, { stuckNote: message });
      text += expanded.step?.detail || "No step.";
      actions.push({ type: "expand_step", ...expanded });
    } else {
      const parsed = parseGuide(message);
      text += `Parsed ${parsed.steps.length} steps for ${parsed.title}. Play the film when you are ready.`;
      actions.push({ type: "ikeafy", guide: parsed });
    }
  } else if (agent.id === "stylist") {
    const plan = planRoom({
      widthM: ctx.room?.widthM || 3.2,
      depthM: ctx.room?.depthM || 3.8,
      budget: maxCost || 40,
      want: /table/.test(lower) ? "table" : "table",
    });
    text += `Adaptation plan: put ${plan.pick.name} at ${plan.ordered[0].x.toFixed(2)} m, ${plan.ordered[0].z.toFixed(2)} m. Cheaper: ${plan.cheaper.map((c) => c.name).join(", ") || "none"}.`;
    actions.push({ type: "adaptation", plan });
  } else if (agent.id === "shop") {
    actions.push(cameraAction(lower));
    text += "Nudged the camera. Drag a piece to move or rotate it on the bench.";
  } else if (agent.id === "firmware") {
    const source = sketchFromFunctions(["light", "sense"]);
    text += "Wrote a Nano sketch: button on D2, LED on D13.";
    actions.push({ type: "firmware", source });
    if (ctx.project) persistLabTool(ctx.project, "generate", { kind: "firmware", source });
  } else if (agent.id === "sim" || agent.id === "lab") {
    const part = getPart(ctx.partId || "lack-top");
    const tape = getPart("tape-gaffer");
    const report = runSuite(part, tape, {
      forceN: 180,
      rain: /rain/.test(lower),
      tempC: /heat|hot/.test(lower) ? 60 : /cold/.test(lower) ? -5 : 22,
    });
    text += report.ok
      ? `${part.name} survives the suite.`
      : `${part.name} fails ${report.failed.join(", ")}.`;
    actions.push({ type: "sim", report });
    if (ctx.project) persistLabTool(ctx.project, "sim", report);
  } else if (agent.id === "eda") {
    const artifact = {
      kind: "schematic",
      label: "lamp-board",
      nets: ["D13-LED", "D2-BUTTON", "GND"],
    };
    text += "Opened a KiCad-like lamp-board schematic with named LED, button and ground nets.";
    actions.push({ type: "eda", tool: "kicad", artifact });
    if (ctx.project) persistLabTool(ctx.project, "kicad", artifact);
  } else if (agent.id === "cad") {
    const artifact = {
      kind: "parametric-model",
      label: "bench-part",
      parameters: { widthMm: 100, depthMm: 100, heightMm: 18 },
    };
    text += "Opened a Fusion-like parametric part with editable millimetre dimensions.";
    actions.push({ type: "cad", tool: "fusion", artifact });
    if (ctx.project) persistLabTool(ctx.project, "fusion", artifact);
  } else if (agent.id === "creative") {
    const artifact = { kind: "scene", label: "bench-concept", renderer: "blender-like" };
    text += "Creative staged a Blender-like bench scene for form, material and render work.";
    actions.push({ type: "creative", tool: "blender", artifact });
    if (ctx.project) persistLabTool(ctx.project, "blender", artifact);
  } else {
    text +=
      "Creative split this across the CAD, EDA, Sim and assembly desks. Say what to model, wire, test or add.";
    actions.push({ type: "route", agent: agent.id });
  }

  if (/cheap|cheaper/.test(lower) && ctx.partId) {
    actions.push({ type: "cheaper", hits: cheaperAlternatives(ctx.partId) });
  }

  if (!isElectronicsAsk(lower)) {
    text = stripElectronicsTalk(text) || text;
  }

  return {
    agent,
    backend: "local-steward",
    text,
    actions,
  };
}

async function hostedReply(message, ctx, agent) {
  const key = usableOpenAiKey();
  if (!key) return null;
  const model =
    agent.role === "hard"
      ? process.env.OPENAI_MODEL_HARD || "gpt-4.1-mini"
      : process.env.OPENAI_MODEL_EASY || "gpt-4.1-mini";
  const electronics = isElectronicsAsk(message);
  const catalogHint = listParts()
    .slice(0, 64)
    .map((p) => `${p.id} (${p.name}, ${p.category})`)
    .join("; ");
  const body = {
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are ${agent.name} at the IKEAFY Lab creative desk, a furniture shop with an optional electronics bench. Reply as JSON {"text": string, "actions": Action[]}. Action types: add {type:"add", partId, pose?}, camera {type:"camera", az, el, zoom?}, label {type:"label", partId, label}, isolate {type:"isolate", label}. Only use these catalog part ids: ${catalogHint}. Be concrete. Never ask for secrets. Keep text under 120 words. ${
          electronics
            ? "Electronics were requested — nano, LED, and button are fair."
            : "Furniture, tables, or catalog parts only — no Arduino, ports, firmware, or boards."
        }`,
      },
      { role: "user", content: message },
    ],
  };
  const fetchFn = ctx.fetchFn || fetch;
  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const parsed = parseJsonObject(json.choices?.[0]?.message?.content);
  const rawText = parsed?.text || json.choices?.[0]?.message?.content;
  if (!rawText && !parsed) return null;
  let actions = sanitizeActions(parsed?.actions, { electronics });
  if (!actions.length && isCreativeAsk(message)) {
    const local = planCreativeActions(message, ctx);
    if (local.handles) actions = local.actions.map((action) => ({ ...action }));
  }
  applyCreativeActions(ctx.project, actions);
  let text = String(parsed?.text || rawText || "").trim();
  if (!electronics) {
    const cleaned = stripElectronicsTalk(text);
    if (/arduino|firmware|sketch/i.test(text)) {
      const local = planCreativeActions(message, ctx);
      text = local.text || cleaned || "On the shelf: furniture only.";
    } else {
      text = cleaned || text;
    }
  }
  if (!text) return null;
  return { agent, backend: `hosted:${model}`, text, actions };
}

export async function chat(message, ctx = {}) {
  const agent = routeAgent(message);
  const escalate = shouldEscalate(message);
  const creative = isCreativeAsk(message);
  if (escalate || creative) {
    try {
      const hosted = await hostedReply(message, ctx, agent);
      if (hosted) {
        return { ...hosted, escalated: escalate, from: escalate ? "gliner-2-standin" : "creative-desk" };
      }
    } catch {
      // fall through to local steward — never leak key errors
    }
  }
  const local = localReply(message, ctx);
  const ikeaSmall = !escalate && (agent.id === "assembler" || IKEA_HINTS.test(message));
  if (ikeaSmall) return { ...local, backend: "gliner-2-standin", escalated: false };
  return local;
}

export function hasHostedBrain() {
  return Boolean(usableOpenAiKey());
}

export function systemIssues(projectParts, options) {
  return engineeringReport(projectParts, options);
}

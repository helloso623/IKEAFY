import { cheaperAlternatives, getPart, isLabShelfPart, listParts, searchParts } from "./catalog.js";
import { engineeringReport, runSuite } from "./physics.js";
import { parseGuide, expandStep, defaultGuide } from "./ikeafy.js";
import { planRoom } from "./adaptation.js";
import { sketchFromFunctions } from "./firmware.js";
import { addPiece, isolateAsBoard, labelFunction, movePiece, persistLabTool } from "./project.js";
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
    name: "Scene editor",
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
const PART_HINTS = /add |find |cheap|cost|part|component|ikea|amazon|put |drop |generate|make |model |build |create /i;
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
  /\b(add|put|drop|place|generate|make|model|build|create|move|rotate|label|isolate)\b/i;
const CREATIVE_ASK = /\b(generate|make a|model a|build a|create a|design a|invent|add |put |drop )\b/i;
const ROOM_CREATE_ASK =
  /\b(make|model|build|create|design|furnish|generate)\b[\s\S]*\b(living\s+room|bedroom|dining\s+room|office|room|space|interior)\b/i;
const GENERIC_TABLE_ASK =
  /\btest[\s-]*table\b|\black[\s-]*like\b|\bside[\s-]*table\b|\b(?:generic|placeholder)\b[\s\S]*\btable\b|\btable\b[\s\S]*\b(?:generic|placeholder)\b/i;
const MAKE_TABLE_ASK =
  /\b(make|model|build|create|design|generate|add|place|put|drop)\b[\s\S]*\btables?\b/i;
const MAKE_STOOL_ASK =
  /\b(make|model|build|create|design|generate|add|place|put|drop)\b[\s\S]*\bstools?\b/i;
const MAKE_SHELF_ASK =
  /\b(make|model|build|create|design|generate|add|place|put|drop)\b[\s\S]*\b(?:shelf|shelves)\b/i;
const SHOP_CREATE_TYPES = new Set(["room", "add", "add_part", "studio", "scan", "move"]);
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
};
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
  if (ROOM_CREATE_ASK.test(t)) return ROSTER.find((a) => a.id === "stylist");
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
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|pair)\s+(legs?|tops?|tables?|lack)\b/i,
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

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function roomFromDescription(message, ctx = {}) {
  const text = String(message || "");
  const pair = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\b/i,
  );
  const kind =
    (text.match(/\b(living\s+room|bedroom|dining\s+room|office|studio|room|space|interior)\b/i)?.[1] ||
      "room")
      .toLowerCase()
      .replace(/\s+/g, " ");
  const palette = /\b(dark|moody|charcoal)\b/i.test(text)
    ? { wallColor: "#525860", floorColor: "#766757" }
    : /\b(bright|light|airy|white)\b/i.test(text)
      ? { wallColor: "#e7e3da", floorColor: "#c9b18f" }
      : /\b(warm|cosy|cozy)\b/i.test(text)
        ? { wallColor: "#d8c6ae", floorColor: "#9d7954" }
        : { wallColor: "#d6d2c8", floorColor: "#b89c78" };
  return {
    kind,
    widthM: positiveNumber(pair?.[1], positiveNumber(ctx.room?.widthM, 4.2)),
    depthM: positiveNumber(pair?.[2], positiveNumber(ctx.room?.depthM, 3.8)),
    heightM: positiveNumber(ctx.room?.heightM, 2.7),
    ...palette,
  };
}

function genericFurniturePlan(kind) {
  const spec = {
    table: {
      ids: ["generic-side-table"],
      poses: [{ x: 0, y: 0, z: 0 }],
      label: "side table",
    },
    stool: {
      ids: ["generic-stool"],
      poses: [{ x: 0, y: 0, z: 0 }],
      label: "stool",
    },
    shelf: {
      ids: ["generic-shelf-board", "generic-shelf-bracket", "generic-shelf-bracket"],
      poses: [
        { x: 0, y: 0.62, z: 0 },
        { x: -0.28, y: 0.51, z: 0 },
        { x: 0.28, y: 0.51, z: 0 },
      ],
      label: "wall shelf",
    },
  }[kind];
  if (!spec) return null;
  const parts = spec.ids.map(getPart);
  if (parts.some((part) => !part)) return null;
  const dims = parts[0].dimsMm;
  return {
    parts,
    label: spec.label,
    specs: `${Math.round(dims.x)}×${Math.round(dims.y)}×${Math.round(dims.z)} mm`,
    actions: parts.map((part, index) => ({
      type: "add",
      partId: part.id,
      pose: spec.poses[index],
    })),
  };
}

function genericTablePlan() {
  const plan = genericFurniturePlan("table");
  return plan ? { ...plan, part: plan.parts[0], action: plan.actions[0] } : null;
}

function furnitureOnlyHits(hits, message) {
  void message;
  return hits.filter(isLabShelfPart);
}

function resolveAddList(message, ctx = {}) {
  const lower = String(message || "").toLowerCase();
  const costMatch = lower.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usd|dollar|budget|max)?/);
  const maxCost = costMatch ? Number(costMatch[1]) : ctx.costBarrier;

  // An explicit product name still resolves to that catalog kit. "LACK-like"
  // is intercepted earlier and intentionally becomes the neutral placeholder.
  if (/\black(?:\s+table)?\b/.test(lower) && !/\black[\s-]*like\b/.test(lower)) {
    const lack = getPart("lack-table");
    return lack ? expandPart(lack) : [];
  }

  if (isLampAsk(lower)) {
    const table = getPart("lack-table");
    return table ? expandPart(table) : [];
  }

  const counted = parseQtyNoun(lower);
  if (counted && getPart(counted.partId)) {
    const part = getPart(counted.partId);
    if (!isLabShelfPart(part) && !part.kitParts?.length) return [];
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

export function describeScene(ctx = {}) {
  const wrapped = ctx.scene && typeof ctx.scene === "object" ? ctx.scene : null;
  const scene = wrapped || (ctx.interface || ctx.mode || ctx.lab || ctx.selected || ctx.pieceCount ? ctx : null);
  if (!scene) {
    const count = ctx.project?.pieces?.length || 0;
    return count ? `${count} piece${count === 1 ? "" : "s"} on the bench` : "";
  }
  if (!wrapped && (scene.interface === "watch" || scene.mode === "ikeafy" || scene.product || scene.partName)) {
    const bits = [];
    if (scene.mode === "lab") bits.push(`Lab ${scene.lab || "bench"}`);
    else if (scene.interface === "watch") bits.push(scene.step ? `Watch step ${scene.step}` : "Watch");
    else if (scene.mode || scene.interface) bits.push("Upload");
    if (scene.product) bits.push(String(scene.product));
    if (scene.partName || scene.partId) bits.push(`selected ${scene.partName || scene.partId}`);
    if (scene.pieceCount) bits.push(`${scene.pieceCount} pieces on the bench`);
    return bits.join(" · ");
  }
  const lab = scene.lab || scene.mode || "desk";
  const count = Number.isFinite(Number(scene.pieceCount))
    ? Number(scene.pieceCount)
    : Array.isArray(scene.pieces)
      ? scene.pieces.length
      : 0;
  const bits = [`${lab} mode`, `${count} piece${count === 1 ? "" : "s"}`];
  const sel = scene.selected;
  if (sel?.name) {
    const d = sel.dimsMm;
    const dim =
      d && Number.isFinite(Number(d.x))
        ? ` ${Math.round(Number(d.x))}×${Math.round(Number(d.y))}×${Math.round(Number(d.z))} mm`
        : "";
    bits.push(`selected ${sel.name}${dim}`);
  } else {
    bits.push("nothing selected");
  }
  if (ctx.photoName) bits.push(`viewport still ${ctx.photoName}`);
  return bits.join("; ");
}

function selectedPieceFromCtx(ctx = {}) {
  const id = ctx.scene?.selected?.id;
  if (id && ctx.project?.pieces) {
    const hit = ctx.project.pieces.find((p) => p.id === id);
    if (hit) return hit;
  }
  if (ctx.partId && ctx.project?.pieces) {
    const byPart = ctx.project.pieces.find((p) => p.partId === ctx.partId);
    if (byPart) return byPart;
  }
  if (ctx.project?.selection && ctx.project.pieces) {
    return ctx.project.pieces.find((p) => p.id === ctx.project.selection) || null;
  }
  return null;
}

function isSceneAsk(text) {
  return /\b(what('s| is) (this|on (the )?(screen|bench|desk))|selected|current (model|piece|scene)|looking at|on (the )?screen|this (piece|model|table|scan))\b/i.test(
    String(text || ""),
  );
}

const STUDIO_ACTIONS = new Set(["start", "official", "next", "back", "play", "spare", "clear"]);

/**
 * Spoken / typed IKEAlive watch commands. Checked before bench generation so
 * "get the reel" is not treated as "generate furniture".
 */
export function planStudioActions(message) {
  const lower = String(message || "").toLowerCase().trim();
  if (!lower) return { handles: false, text: "", actions: [] };

  if (/\bstart\s+(the\s+)?official(\s+(lack\s+)?sheet)?\b|\bstart\s+(the\s+)?lack\b/.test(lower)) {
    return { handles: true, text: "Starting the official LACK sheet.", actions: [{ type: "studio", action: "official" }] };
  }
  if (/\b(get|build|start|make)\s+(the\s+)?reel\b/.test(lower)) {
    return { handles: true, text: "Getting the reel.", actions: [{ type: "studio", action: "start" }] };
  }
  if (/\bnext(\s+step)?\b/.test(lower) && !/\b(which|what|where)\b/.test(lower)) {
    return { handles: true, text: "Next step.", actions: [{ type: "studio", action: "next" }] };
  }
  if (/\bprevious step\b|\bgo back\b|\bback( a)? step\b/.test(lower)) {
    return { handles: true, text: "Back a step.", actions: [{ type: "studio", action: "back" }] };
  }
  if (/^\s*(play|pause|stop)(\s+the\s+(reel|film))?\s*[.!]?\s*$/.test(lower) || /\b(play|stop) the reel\b/.test(lower)) {
    return { handles: true, text: "Toggling play.", actions: [{ type: "studio", action: "play" }] };
  }
  if (/\b(request|order)\s+(a\s+)?spare\b|\bsmall parts\b/.test(lower)) {
    return { handles: true, text: "Requesting a spare.", actions: [{ type: "studio", action: "spare" }] };
  }
  if (/\bstart over\b|\bnew manual\b/.test(lower)) {
    return { handles: true, text: "Starting over.", actions: [{ type: "studio", action: "clear" }] };
  }
  return { handles: false, text: "", actions: [] };
}

/**
 * Lab creative desk: turn a spoken request into bench actions the client
 * can apply with api.add / camera / move / scan / label / isolate.
 */
export function planCreativeActions(message, ctx = {}) {
  const lower = String(message || "").toLowerCase();
  const actions = [];
  let text = "";

  if (/\b(scan|reconstruct|photogram)\b/.test(lower) && !/\b(add|put|drop)\b/.test(lower)) {
    return {
      handles: true,
      text: "Open Scan object — add aligned front, side and top photos, then Reconstruct.",
      actions: [{ type: "scan" }],
    };
  }

  if (ROOM_CREATE_ASK.test(lower)) {
    const room = roomFromDescription(message, ctx);
    actions.push({ type: "room", room });
    if (/\b(table|side[\s-]*table|coffee[\s-]*table)\b/.test(lower)) {
      const table = genericTablePlan();
      if (table) {
        actions.push(table.action);
        return {
          handles: true,
          text: `Using ${table.specs} side-table proportions for a neutral editable placeholder. Created a ${room.widthM}×${room.depthM} m ${room.kind} with a floor, four walls, and the table.`,
          actions,
        };
      }
    }
    return {
      handles: true,
      text: `Created a ${room.widthM}×${room.depthM} m ${room.kind} with a floor and four walls.`,
      actions,
    };
  }

  if (
    (GENERIC_TABLE_ASK.test(lower) || (MAKE_TABLE_ASK.test(lower) && !/\black\b/.test(lower))) &&
    /\b(make|model|build|create|design|generate|add|place|put|drop)\b/.test(lower)
  ) {
    const table = genericTablePlan();
    if (table) {
      return {
        handles: true,
        text: `Using ${table.specs} side-table proportions for a neutral editable placeholder. Placing it now.`,
        actions: [table.action],
      };
    }
  }

  const furnitureKind = MAKE_SHELF_ASK.test(lower)
    ? "shelf"
    : MAKE_STOOL_ASK.test(lower)
      ? "stool"
      : null;
  if (furnitureKind) {
    const furniture = genericFurniturePlan(furnitureKind);
    if (furniture) {
      return {
        handles: true,
        text: `Using ${furniture.specs} IKEA-like proportions for a generic ${furniture.label}. Placing the editable kit now.`,
        actions: furniture.actions,
      };
    }
  }

  if (isLampAsk(lower) && /\b(generate|make|build|create|add|put|design|drop)\b/.test(lower)) {
    const table = getPart("lack-table");
    const kit = table ? expandPart(table) : [];
    if (!kit.length) {
      return {
        handles: true,
        text: "Nothing on the shelf matches a lamp table. Try “lack” or “table”.",
        actions,
      };
    }
    for (const item of kit) {
      actions.push({ type: "add", partId: item.partId, pose: item.pose });
    }
    text = `Dropped ${describeAdds(kit)} on the bench.`;
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
    const piece = selectedPieceFromCtx(ctx);
    const nudgePiece = piece && !/\bcamera\b/.test(lower) && /\b(this|it|piece|selected|left|right|forward|back|up|down)\b/.test(lower);
    if (nudgePiece) {
      const step = 0.05;
      const pose = {};
      if (/\bleft\b/.test(lower)) pose.x = (Number(piece.x) || 0) - step;
      else if (/\bright\b/.test(lower)) pose.x = (Number(piece.x) || 0) + step;
      if (/\bforward|front\b/.test(lower)) pose.z = (Number(piece.z) || 0) - step;
      else if (/\bback\b/.test(lower)) pose.z = (Number(piece.z) || 0) + step;
      if (/\bup\b/.test(lower) && !/\bsetup\b/.test(lower)) pose.y = (Number(piece.y) || 0) + step;
      else if (/\bdown\b/.test(lower)) pose.y = (Number(piece.y) || 0) - step;
      if (Object.keys(pose).length) {
        actions.push({ type: "move", id: piece.id, ...pose });
        text = `Moved ${ctx.scene?.selected?.name || piece.partId}.`;
        return { handles: true, text, actions };
      }
    }
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
    } else if (action.type === "move" && action.id) {
      const piece = movePiece(project, action.id, action);
      if (piece) {
        action.piece = piece;
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
  const allowed = new Set(["add", "add_part", "camera", "label", "isolate", "move", "room", "scan", "studio"]);
  const out = [];
  for (const action of Array.isArray(raw) ? raw : []) {
    if (!action || !allowed.has(action.type)) continue;
    if (action.type === "scan") {
      out.push({ type: "scan" });
      continue;
    }
    if (action.type === "room") {
      const room = action.room && typeof action.room === "object" ? action.room : action;
      out.push({
        type: "room",
        room: {
          kind: String(room.kind || "room").slice(0, 48),
          widthM: positiveNumber(room.widthM, 4.2),
          depthM: positiveNumber(room.depthM, 3.8),
          heightM: positiveNumber(room.heightM, 2.7),
          wallColor: /^#[\da-f]{6}$/i.test(String(room.wallColor || "")) ? room.wallColor : "#d6d2c8",
          floorColor: /^#[\da-f]{6}$/i.test(String(room.floorColor || "")) ? room.floorColor : "#b89c78",
        },
      });
      continue;
    }
    if (action.type === "move") {
      if (!action.id) continue;
      const pose = {};
      for (const key of ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"]) {
        if (action[key] !== undefined) pose[key] = Number(action[key]);
      }
      out.push({ type: "move", id: String(action.id), ...pose });
      continue;
    }
    if (action.type === "studio") {
      const name = String(action.action || "");
      if (STUDIO_ACTIONS.has(name)) out.push({ type: "studio", action: name });
      continue;
    }
    if (action.type === "add" || action.type === "add_part") {
      const part = getPart(action.partId);
      if (!part) continue;
      if (!isLabShelfPart(part)) continue;
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

function withSceneNote(text, ctx, message) {
  const note = describeScene(ctx);
  if (!note) return text;
  const lower = String(message || "").toLowerCase();
  if (!/\?|this|selected|screen|model|bench|looking|current/.test(lower)) return text;
  if (String(text || "").includes(note)) return text;
  return `${text} (${note})`;
}

function localReply(message, ctx) {
  message = String(message || "").trim();
  const agent = routeAgent(message);
  if (!message) {
    return {
      agent,
      backend: "local-steward",
      text: "Tell me what room or object you want to create, or ask about the current scene.",
      actions: [],
    };
  }
  if (/^(hi|hello|hey|good (morning|afternoon|evening))[!. ]*$/i.test(message)) {
    return {
      agent,
      backend: "local-steward",
      text: "Hi. Describe a room or piece of furniture and I’ll build a visible 3D starting point you can edit.",
      actions: [],
    };
  }
  if (/^(thanks|thank you|cheers)[!. ]*$/i.test(message)) {
    return {
      agent,
      backend: "local-steward",
      text: "You’re welcome. Tell me what you want to change next.",
      actions: [],
    };
  }
  const studio = planStudioActions(message);
  if (studio.handles) {
    return {
      agent,
      backend: "local-steward",
      text: studio.text,
      actions: studio.actions,
    };
  }
  const sceneNote = describeScene(ctx);
  if (isSceneAsk(message) && sceneNote) {
    return {
      agent,
      backend: "local-steward",
      text: `I can see the current scene: ${sceneNote}.`,
      actions: [],
    };
  }
  const hardLabTask = CAD_HINTS.test(message) || EDA_HINTS.test(message) || SIM_HINTS.test(message);
  const planned = hardLabTask
    ? { handles: false, text: "", actions: [] }
    : planCreativeActions(message, ctx);
  if (planned.handles) {
    applyCreativeActions(ctx.project, planned.actions);
    return {
      agent,
      backend: "local-steward",
      text: withSceneNote(planned.text, ctx, message),
      actions: planned.actions,
    };
  }

  const actions = [];
  const lower = message.toLowerCase();
  let text = "";

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
    text: withSceneNote(text, ctx, message),
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
    .filter(isLabShelfPart)
    .slice(0, 64)
    .map((p) => `${p.id} (${p.name}, ${p.category})`)
    .join("; ");
  const sceneNote = describeScene(ctx);
  const history = (Array.isArray(ctx.history) ? ctx.history : [])
    .slice(-10)
    .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
    .map((entry) => ({
      role: entry.role,
      content: String(entry.content || "").slice(0, 1200),
    }))
    .filter((entry) => entry.content);
  const body = {
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are ${agent.name} in the IKEAFY 3D furniture workspace with an optional electronics bench. Reply as JSON {"text": string, "actions": Action[]}. Action types: add {type:"add", partId, pose?}, room {type:"room", room:{kind,widthM,depthM,heightM,wallColor,floorColor}}, camera {type:"camera", az, el, zoom?}, move {type:"move", id, x?, y?, z?}, scan {type:"scan"}, label {type:"label", partId, label}, isolate {type:"isolate", label}, studio {type:"studio", action:"start"|"official"|"next"|"back"|"play"|"spare"|"clear"}. A room action creates real floor and wall meshes. For a requested side table use generic-side-table as a neutral editable placeholder, never claim it is branded CAD, and state its 550×550×450 mm proportions before other copy. Studio actions drive the IKEAlive reel. Only use these catalog part ids: ${catalogHint}. Be concrete. Never ask for secrets. Keep text under 120 words. ${
          electronics
            ? "Electronics were requested — nano, LED, and button are fair."
            : "Furniture, tables, hardware, tape, or hand tools only — no Arduino, ports, firmware, boards, or robotics."
        }`,
      },
      ...history,
      { role: "user", content: [message, sceneNote && `[bench scene] ${sceneNote}`].filter(Boolean).join("\n") },
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
    signal: ctx.fetchFn ? undefined : AbortSignal.timeout(25_000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const parsed = parseJsonObject(json.choices?.[0]?.message?.content);
  const rawText = parsed?.text || json.choices?.[0]?.message?.content;
  if (!rawText && !parsed) return null;
  let actions = sanitizeActions(parsed?.actions, { electronics });
  const deterministic = planCreativeActions(message, ctx);
  const mustCreateModel =
    deterministic.handles &&
    deterministic.actions.some((action) => SHOP_CREATE_TYPES.has(action.type));
  if (mustCreateModel) {
    const extras = actions.filter((action) => action.type === "camera");
    actions = [...sanitizeActions(deterministic.actions, { electronics }), ...extras];
  } else if (!actions.length) {
    const studio = planStudioActions(message);
    if (studio.handles) actions = studio.actions.map((action) => ({ ...action }));
  }
  if (!actions.length && isCreativeAsk(message)) {
    const local = planCreativeActions(message, ctx);
    if (local.handles) actions = local.actions.map((action) => ({ ...action }));
  }
  applyCreativeActions(ctx.project, actions);
  let text = String(mustCreateModel ? deterministic.text : parsed?.text || rawText || "").trim();
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

export function mergeChatContext(ctx = {}) {
  const scene = ctx.scene && typeof ctx.scene === "object" ? ctx.scene : {};
  return {
    ...ctx,
    scene,
    costBarrier: ctx.costBarrier ?? scene.costBarrier,
    step: ctx.step ?? scene.step,
    partId: ctx.partId || scene.partId || scene.selected?.partId || scene.selected?.id,
    room: ctx.room || scene.room,
  };
}

function hasShopCreate(actions) {
  return (Array.isArray(actions) ? actions : []).some((action) => action && SHOP_CREATE_TYPES.has(action.type));
}

function stewardCanCreate(message, ctx = {}) {
  const text = String(message || "");
  if (planStudioActions(text).handles) return true;
  const hardLabTask = CAD_HINTS.test(text) || EDA_HINTS.test(text) || SIM_HINTS.test(text);
  if (hardLabTask) return false;
  const planned = planCreativeActions(text, ctx);
  return Boolean(planned.handles && hasShopCreate(planned.actions));
}

function finishLocal(message, ctx, { escalate = false, creative = false } = {}) {
  const local = localReply(message, ctx);
  const agent = local.agent || routeAgent(message);
  const ikeaSmall = !escalate && (agent.id === "assembler" || IKEA_HINTS.test(String(message || "")));
  if (ikeaSmall) return { ...local, backend: "gliner-2-standin", escalated: false };
  return { ...local, escalated: Boolean(escalate), from: creative ? "creative-desk" : "conversation" };
}

/** Last-resort shop reply. Never throws; always a local steward payload. */
export function fallbackChat(message, ctx = {}) {
  try {
    return localReply(String(message || "").trim(), mergeChatContext(ctx));
  } catch {
    return {
      agent: ROSTER.find((agent) => agent.id === "creative"),
      backend: "local-steward",
      text: String(message || "").trim()
        ? "I couldn’t complete that edit. Try describing the room or object with dimensions."
        : "Tell me what room or object you want to create.",
      actions: [],
    };
  }
}

export async function chat(message, ctx = {}) {
  try {
    message = String(message || "").trim();
    ctx = mergeChatContext(ctx);
    const agent = routeAgent(message);
    const escalate = shouldEscalate(message);
    const creative = isCreativeAsk(message);

    // Rooms, tables, catalog drops and reel commands are local. A hosted
    // provider must not replace those actions with prose, and must not
    // block the steward when the key is missing or the provider fails.
    if (stewardCanCreate(message, ctx)) {
      return finishLocal(message, ctx, { escalate, creative });
    }

    if (hasHostedBrain()) {
      try {
        const hosted = await hostedReply(message, ctx, agent);
        if (hosted) {
          return {
            ...hosted,
            escalated: escalate,
            from: escalate ? "gliner-2-standin" : creative ? "creative-desk" : "conversation",
          };
        }
      } catch {
        // fall through to local steward — never leak key errors
      }
    }
    return finishLocal(message, ctx, { escalate, creative });
  } catch {
    return fallbackChat(message, ctx);
  }
}

export function hasHostedBrain() {
  return Boolean(usableOpenAiKey());
}

export function systemIssues(projectParts, options) {
  return engineeringReport(projectParts, options);
}

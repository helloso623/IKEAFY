const GENERATE_VERB =
  /\b(make|model|build|create|design|generate|invent|sculpt|spawn|draw|render|craft|produce|construct|fabricate)\b/i;
const PLACE_VERB = /\b(add|place|put|drop|insert)\b/i;
const CREATE_VERB =
  /\b(make|model|build|create|design|generate|invent|sculpt|spawn|draw|render|craft|produce|construct|fabricate|add|place|put|drop|insert)\b/i;
const REQUEST_OBJECT = /\b(?:want|need|would\s+like)\b[\s\S]*\b(?:a|an|the|some)\b/i;
const NON_MODEL_ASK =
  /\b(find|search|buy|shop|catalog|manual|guide|assemble|assembly|reel|photo)\b|(?:\b(?:watch|play|upload|record)\b[\s\S]*\bvideo\b)/i;
const BRANDED_CATALOG_ASK = /\b(ikea|lack|linnmon|linmon|kallax|billy|malm)\b/i;
const BRANDED_STYLE_ASK = /\b(?:ikea|lack|linnmon|linmon|kallax|billy|malm)[\s-]+(?:like|style|inspired)\b/i;
const CATALOG_DROP_NOUN =
  /\b(zip[\s-]*ties?|tape|screws?|bolts?|fasteners?|brackets?|hardware|tools?|wires?|cables?|batter(?:y|ies)|parts?|components?)\b/i;
const EDIT_EXISTING =
  /\b(?:make|scale|resize)\b[\s\S]*\b(?:it|this|selected|piece|object|mesh)\b[\s\S]*\b(?:bigger|larger|smaller|wider|narrower|taller|shorter|deeper|shallower|double|twice|half)\b|\b(?:make|scale|resize)\b[\s\S]*\b(?:bigger|larger|smaller|wider|narrower|taller|shorter|deeper|shallower|double|twice|half)\b[\s\S]*\b(?:it|this|selected|piece|object|mesh)\b/i;
const MODEL_NOUN =
  /\b(table|chair|seat|stool|bench|sofa|couch|bed|cabinet|bookcase|bookshelf|dresser|wardrobe|shelf|desk|lamp|vase|bottle|urn|furniture|leg|monster|creature|alien|robot|artifact|sculpture|object|scene|room|interior|corner)\b/i;
const NON_GENERATION_COMMAND =
  /^(?:what|why|how|where|when|which|who|can|could|should|would|do|does|did|is|are|show|tell|explain|help|move|rotate|scale|label|isolate|select|delete|remove|undo|redo|next|back|play|scan|reconstruct)\b/i;
const CONVERSATION_ONLY = /^(?:hi|hello|hey|thanks|thank you|cheers|good (?:morning|afternoon|evening))\b/i;
const GUIDE_CONTEXT = /\b(?:step\s+\d+|stuck|manual|guide|assembly|assemble|tool required)\b/i;
const SPAWN_FOLLOW_UP =
  /^(?:please\s+)?(?:spawn|add|place|put|drop|make|model|build|create|generate)\s+(?:it|that|this|one)\s*[.!]?$/i;

export const AI_MESH_SHAPES = Object.freeze([
  "box",
  "cylinder",
  "cone",
  "sphere",
  "torus",
  "capsule",
  "lathe",
  "extrude",
  "mesh",
]);

const SHAPES = new Set(AI_MESH_SHAPES);
const DEFAULT_COLOR = "#c99a62";
const MAX_COMPONENTS = 128;
const MAX_VERTICES = 6000;
const MAX_FACES = 12000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

function text(value, fallback, limit = 80) {
  const clean = String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return (clean || fallback).slice(0, limit);
}

function color(value, fallback = DEFAULT_COLOR) {
  const raw = String(value || "");
  return /^#[\da-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

function triplet(value, { fallback = [0, 0, 0], min = -20_000, max = 20_000 } = {}) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => clamp(source[index], min, max, fallback[index] || 0));
}

function positiveSize(value, fallback = [300, 300, 300]) {
  return triplet(value, { fallback, min: 1, max: 20_000 });
}

function points(value, limit, { dimensions = 2, min = -20_000, max = 20_000 } = {}) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((point) => {
    const source = Array.isArray(point) ? point : [];
    return Array.from({ length: dimensions }, (_, index) => clamp(source[index], min, max, 0));
  });
}

function sanitizeComponent(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const shape = String(raw.shape || "").toLowerCase();
  if (!SHAPES.has(shape)) return null;
  const component = {
    id: text(raw.id, `body-${index + 1}`, 48),
    name: text(raw.name, `${shape} body`, 64),
    shape,
    sizeMm: positiveSize(raw.sizeMm, shape === "box" ? [300, 300, 300] : [300, 300, 300]),
    positionMm: triplet(raw.positionMm),
    rotationDeg: triplet(raw.rotationDeg, { min: -3600, max: 3600 }),
    color: color(raw.color),
    roughness: clamp(raw.roughness, 0.04, 1, 0.58),
    metalness: clamp(raw.metalness, 0, 1, 0.04),
    segments: Math.round(clamp(raw.segments, 3, 64, 32)),
  };

  if (shape === "torus") {
    component.majorRadiusMm = clamp(raw.majorRadiusMm, 1, 10_000, component.sizeMm[0] * 0.35);
    component.tubeRadiusMm = clamp(raw.tubeRadiusMm, 0.5, 5_000, component.sizeMm[1] * 0.12);
    component.arcDeg = clamp(raw.arcDeg, 1, 360, 360);
  } else if (shape === "capsule") {
    component.radiusMm = clamp(raw.radiusMm, 0.5, 5_000, Math.min(component.sizeMm[0], component.sizeMm[2]) / 2);
    component.lengthMm = clamp(raw.lengthMm, 1, 20_000, Math.max(1, component.sizeMm[1] - component.radiusMm * 2));
  } else if (shape === "lathe") {
    component.profileMm = points(raw.profileMm, 96);
    if (component.profileMm.length < 2) return null;
  } else if (shape === "extrude") {
    component.outlineMm = points(raw.outlineMm, 128);
    component.holesMm = Array.isArray(raw.holesMm)
      ? raw.holesMm.slice(0, 12).map((hole) => points(hole, 64)).filter((hole) => hole.length >= 3)
      : [];
    if (component.outlineMm.length < 3) return null;
  } else if (shape === "mesh") {
    component.verticesMm = points(raw.verticesMm, MAX_VERTICES, { dimensions: 3 });
    component.faces = (Array.isArray(raw.faces) ? raw.faces : [])
      .slice(0, MAX_FACES)
      .map((face) => {
        if (!Array.isArray(face) || face.length < 3) return null;
        const triangle = face.slice(0, 3).map((entry) => Math.trunc(finite(entry, -1)));
        return triangle.every((entry) => entry >= 0 && entry < component.verticesMm.length) ? triangle : null;
      })
      .filter(Boolean);
    if (component.verticesMm.length < 3 || !component.faces.length) return null;
  }
  return component;
}

export function sanitizeMeshSpec(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const components = (Array.isArray(source.components) ? source.components : [])
    .slice(0, MAX_COMPONENTS)
    .map(sanitizeComponent)
    .filter(Boolean);
  if (!components.length) return null;
  return {
    id: text(source.id, "", 64) || undefined,
    name: text(source.name, "AI mesh", 80),
    kind: text(source.kind, "object", 32).toLowerCase(),
    prompt: text(source.prompt, "", 500),
    components,
    position: {
      x: clamp(source.position?.x, -20, 20, 0),
      y: clamp(source.position?.y, -2, 20, 0),
      z: clamp(source.position?.z, -20, 20, 0),
    },
  };
}

export function sanitizeMeshAction(raw = {}) {
  const mesh = sanitizeMeshSpec(raw.mesh || raw.object || raw);
  return mesh ? { type: "mesh", mesh } : null;
}

export function isMeshBuildAsk(message) {
  const source = String(message || "").trim();
  if (!source || CONVERSATION_ONLY.test(source) || NON_GENERATION_COMMAND.test(source)) return false;
  if (EDIT_EXISTING.test(source)) return false;
  if (GUIDE_CONTEXT.test(source) || NON_MODEL_ASK.test(source)) return false;
  if (BRANDED_CATALOG_ASK.test(source) && !BRANDED_STYLE_ASK.test(source)) return false;
  if (PLACE_VERB.test(source) && CATALOG_DROP_NOUN.test(source)) return false;
  const directNoun = MODEL_NOUN.test(source) && source.split(/\s+/).length <= 8;
  const createsMesh = GENERATE_VERB.test(source) || REQUEST_OBJECT.test(source) || PLACE_VERB.test(source);
  const directPrompt = !/[?]$/.test(source) && source.split(/\s+/).length <= 8;
  return createsMesh || directNoun || directPrompt;
}

/** Resolve a short “generate it” follow-up against recent user prose. */
export function meshPromptFromContext(message, ctx = {}) {
  const source = String(message || "").trim();
  if (!SPAWN_FOLLOW_UP.test(source)) return source;
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.role !== "user") continue;
    const content = String(entry.content || "").trim();
    if (!content || SPAWN_FOLLOW_UP.test(content)) continue;
    if (MODEL_NOUN.test(content) || isMeshBuildAsk(content)) return content;
  }
  return source;
}

/**
 * Pull independently generated objects out of a room prompt so the scene mesh
 * includes each phrase after “with”, “containing”, or “featuring”.
 */
export function meshPromptsFromRoom(message) {
  const source = String(message || "").trim();
  const tail = source.match(/\b(?:with|containing|featuring|plus)\s+(.+)$/i)?.[1];
  if (!tail) return [];
  return tail
    .split(/\s*,\s*|\s+and\s+/i)
    .map((item) => item.replace(/^(?:a|an|the|some)\s+/i, "").replace(/[.!?]+$/g, "").trim())
    .filter(Boolean)
    .filter((item) => !/^(?:walls?|floors?|ceilings?|paint|lighting|windows?)(?:\s|$)/i.test(item))
    .slice(0, 8)
    .map((item) => (CREATE_VERB.test(item) ? item : `make ${item}`));
}

function unitMm(number, unit = "mm") {
  const value = finite(number, 0);
  if (/^m(?:etre|eter)?s?$/i.test(unit)) return value * 1000;
  if (/^cm|centimet/i.test(unit)) return value * 10;
  if (/^in|inch/i.test(unit)) return value * 25.4;
  return value;
}

function measurement(message, label, fallback) {
  const source = String(message || "");
  const units = "(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?|m|met(?:re|er)s?|in|inches?)";
  const after = new RegExp(`\\b${label}\\s*(?:of|is|=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*${units}`, "i").exec(source);
  const before = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*${units}\\s*${label}`, "i").exec(source);
  const match = after || before;
  if (!match) return fallback;
  return unitMm(match[1], match[2]);
}

function component(shape, name, sizeMm, positionMm, extra = {}) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    shape,
    sizeMm,
    positionMm,
    rotationDeg: [0, 0, 0],
    color: extra.color || DEFAULT_COLOR,
    roughness: extra.roughness ?? 0.58,
    metalness: extra.metalness ?? 0.04,
    segments: extra.segments || 40,
    ...extra,
  };
}

function tablePlan(message) {
  const round = /\b(round|circular|circle|pedestal)\b/i.test(message);
  const central = /\b(central|center|centre|single|pedestal|one)\b[\s-]*(?:leg|base|support)?/i.test(message);
  const width = measurement(message, "(?:width|wide)", round ? 900 : 1200);
  const depth = measurement(message, "(?:depth|deep)", round ? width : 700);
  const diameter = measurement(message, "(?:diameter|dia)", Math.max(width, depth));
  const height = measurement(message, "(?:height|high|tall)", 740);
  const thickness = measurement(message, "(?:top\\s+thickness|thick)", 40);
  const legHeight = Math.max(80, height - thickness);
  const wood = /\b(dark|walnut|black)\b/i.test(message) ? "#5f422f" : "#bd8956";
  if (round || central) {
    const topDiameter = round ? diameter : Math.max(width, depth);
    const legDiameter = Math.max(80, Math.min(220, topDiameter * 0.15));
    return {
      name: central || /\bpedestal\b/i.test(message) ? "Round pedestal table" : "Round table",
      kind: "table",
      components: [
        component("cylinder", "Circular tabletop", [topDiameter, thickness, topDiameter], [0, legHeight + thickness / 2, 0], {
          color: wood,
          segments: 48,
        }),
        component("cylinder", "Central leg", [legDiameter, legHeight, legDiameter], [0, legHeight / 2, 0], {
          color: /\bmetal|steel|chrome\b/i.test(message) ? "#777d83" : wood,
          metalness: /\bmetal|steel|chrome\b/i.test(message) ? 0.72 : 0.04,
          segments: 32,
        }),
      ],
    };
  }
  const leg = Math.max(40, Math.min(90, Math.min(width, depth) * 0.09));
  const insetX = width / 2 - leg;
  const insetZ = depth / 2 - leg;
  return {
    name: "Custom table",
    kind: "table",
    components: [
      component("box", "Tabletop", [width, thickness, depth], [0, legHeight + thickness / 2, 0], { color: wood }),
      ...[
        [-insetX, -insetZ],
        [insetX, -insetZ],
        [-insetX, insetZ],
        [insetX, insetZ],
      ].map(([x, z], index) =>
        component("box", `Leg ${index + 1}`, [leg, legHeight, leg], [x, legHeight / 2, z], { color: wood }),
      ),
    ],
  };
}

function chairPlan(message) {
  const width = measurement(message, "(?:width|wide)", 480);
  const depth = measurement(message, "(?:depth|deep)", 500);
  const height = measurement(message, "(?:height|high|tall)", 900);
  const seatY = Math.min(height * 0.58, measurement(message, "(?:seat\\s+height)", 460));
  const seatThickness = 45;
  const colorValue = /\b(red)\b/i.test(message) ? "#a9463d" : "#b8824f";
  const legH = Math.max(200, seatY - seatThickness / 2);
  const legW = Math.max(28, width * 0.07);
  return {
    name: "Custom chair",
    kind: "chair",
    components: [
      component("box", "Seat", [width, seatThickness, depth], [0, seatY, 0], { color: colorValue }),
      component("box", "Back", [width, Math.max(180, height - seatY), 45], [0, (height + seatY) / 2, depth / 2 - 22], {
        color: colorValue,
      }),
      ...[
        [-width / 2 + legW, -depth / 2 + legW],
        [width / 2 - legW, -depth / 2 + legW],
        [-width / 2 + legW, depth / 2 - legW],
        [width / 2 - legW, depth / 2 - legW],
      ].map(([x, z], index) =>
        component("box", `Leg ${index + 1}`, [legW, legH, legW], [x, legH / 2, z], { color: colorValue }),
      ),
    ],
  };
}

function lampPlan(message) {
  const height = measurement(message, "(?:height|high|tall)", 620);
  const baseD = Math.max(140, height * 0.3);
  const shadeD = Math.max(220, height * 0.48);
  return {
    name: "Custom lamp",
    kind: "lamp",
    components: [
      component("cylinder", "Base", [baseD, 35, baseD], [0, 17.5, 0], { color: "#32363a", metalness: 0.65 }),
      component("cylinder", "Stem", [32, height * 0.68, 32], [0, 35 + height * 0.34, 0], {
        color: "#6f7579",
        metalness: 0.78,
      }),
      component("cone", "Shade", [shadeD, height * 0.3, shadeD], [0, height * 0.82, 0], {
        color: "#e5c98f",
        roughness: 0.82,
      }),
    ],
  };
}

function shelfPlan(message) {
  const width = measurement(message, "(?:width|wide)", 900);
  const depth = measurement(message, "(?:depth|deep)", 260);
  const thickness = measurement(message, "(?:thickness|thick)", 28);
  return {
    name: "Custom wall shelf",
    kind: "shelf",
    components: [
      component("box", "Shelf", [width, thickness, depth], [0, 420, 0], { color: "#bd8956" }),
      component("box", "Left bracket", [35, 210, depth * 0.8], [-width * 0.34, 315, 0], { color: "#3e4246", metalness: 0.7 }),
      component("box", "Right bracket", [35, 210, depth * 0.8], [width * 0.34, 315, 0], { color: "#3e4246", metalness: 0.7 }),
    ],
  };
}

function stoolPlan(message) {
  const width = measurement(message, "(?:width|wide)", /\bbench\b/i.test(message) ? 1100 : 420);
  const depth = measurement(message, "(?:depth|deep)", 380);
  const height = measurement(message, "(?:height|high|tall)", /\bbench\b/i.test(message) ? 460 : 450);
  const top = 42;
  const legH = height - top;
  const legW = Math.max(35, Math.min(65, depth * 0.12));
  const insetX = width / 2 - legW;
  const insetZ = depth / 2 - legW;
  return {
    name: /\bbench\b/i.test(message) ? "Custom bench" : "Custom stool",
    kind: /\bbench\b/i.test(message) ? "bench" : "stool",
    components: [
      component("box", "Seat", [width, top, depth], [0, legH + top / 2, 0], { color: "#b8824f" }),
      ...[
        [-insetX, -insetZ],
        [insetX, -insetZ],
        [-insetX, insetZ],
        [insetX, insetZ],
      ].map(([x, z], index) =>
        component("box", `Leg ${index + 1}`, [legW, legH, legW], [x, legH / 2, z], { color: "#9b6a3e" }),
      ),
    ],
  };
}

function sofaPlan(message) {
  const width = measurement(message, "(?:width|wide)", 1900);
  const depth = measurement(message, "(?:depth|deep)", 850);
  const height = measurement(message, "(?:height|high|tall)", 820);
  const seatY = 430;
  const upholstery = /\b(green)\b/i.test(message) ? "#657d68" : /\b(blue)\b/i.test(message) ? "#61758e" : "#9a8170";
  return {
    name: "Custom sofa",
    kind: "sofa",
    components: [
      component("box", "Seat cushion", [width - 160, 170, depth - 210], [0, seatY, -35], { color: upholstery, roughness: 0.86 }),
      component("box", "Back", [width - 100, height - seatY, 150], [0, (height + seatY) / 2, depth / 2 - 75], {
        color: upholstery,
        roughness: 0.9,
      }),
      component("box", "Left arm", [130, 410, depth], [-width / 2 + 65, 465, 0], { color: upholstery, roughness: 0.88 }),
      component("box", "Right arm", [130, 410, depth], [width / 2 - 65, 465, 0], { color: upholstery, roughness: 0.88 }),
      component("box", "Base", [width - 120, 180, depth - 100], [0, 210, 0], { color: "#5a4336" }),
    ],
  };
}

function bedPlan(message) {
  const width = measurement(message, "(?:width|wide)", 1500);
  const depth = measurement(message, "(?:depth|deep|length|long)", 2000);
  const height = measurement(message, "(?:height|high|tall)", 950);
  return {
    name: "Custom bed",
    kind: "bed",
    components: [
      component("box", "Frame", [width + 80, 220, depth + 80], [0, 280, 0], { color: "#8b633f" }),
      component("box", "Mattress", [width, 240, depth], [0, 500, 0], { color: "#ded8cb", roughness: 0.94 }),
      component("box", "Headboard", [width + 80, height, 90], [0, height / 2, depth / 2], { color: "#805b3c" }),
      ...[
        [-width / 2, -depth / 2],
        [width / 2, -depth / 2],
        [-width / 2, depth / 2],
        [width / 2, depth / 2],
      ].map(([x, z], index) => component("box", `Leg ${index + 1}`, [70, 220, 70], [x, 110, z], { color: "#5b4030" })),
    ],
  };
}

function cabinetPlan(message) {
  const width = measurement(message, "(?:width|wide)", 900);
  const depth = measurement(message, "(?:depth|deep)", 380);
  const height = measurement(message, "(?:height|high|tall)", 1800);
  const side = 28;
  const shelves = /\b(bookcase|bookshelf)\b/i.test(message) ? 5 : 3;
  const wood = "#b88958";
  return {
    name: /\b(bookcase|bookshelf)\b/i.test(message) ? "Custom bookcase" : "Custom cabinet",
    kind: /\b(bookcase|bookshelf)\b/i.test(message) ? "bookcase" : "cabinet",
    components: [
      component("box", "Left side", [side, height, depth], [-width / 2 + side / 2, height / 2, 0], { color: wood }),
      component("box", "Right side", [side, height, depth], [width / 2 - side / 2, height / 2, 0], { color: wood }),
      component("box", "Back", [width, height, 18], [0, height / 2, depth / 2 - 9], { color: "#8f6846" }),
      ...Array.from({ length: shelves + 2 }, (_, index) =>
        component("box", index === 0 ? "Base" : index === shelves + 1 ? "Top" : `Shelf ${index}`, [
          width - side * 2,
          side,
          depth - 24,
        ], [0, (index / (shelves + 1)) * (height - side) + side / 2, -12], { color: wood }),
      ),
    ],
  };
}

function legsPlan(message) {
  const countWord = String(message || "").match(/\b(\d+|one|two|three|four|five|six|eight)\s+legs?\b/i)?.[1]?.toLowerCase();
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8 };
  const count = Math.max(1, Math.min(12, words[countWord] || Number(countWord) || 4));
  const height = measurement(message, "(?:height|high|tall)", 700);
  const width = measurement(message, "(?:width|wide|diameter)", 55);
  const columns = Math.ceil(Math.sqrt(count));
  return {
    name: `${count} generated legs`,
    kind: "object",
    components: Array.from({ length: count }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return component("box", `Leg ${index + 1}`, [width, height, width], [
        (column - (columns - 1) / 2) * width * 2.2,
        height / 2,
        (row - (Math.ceil(count / columns) - 1) / 2) * width * 2.2,
      ], { color: "#9b6a3e" });
    }),
  };
}

function creaturePlan(message) {
  const skin = /\b(green)\b/i.test(message) ? "#66865f" : /\b(red)\b/i.test(message) ? "#9f5149" : "#6f739d";
  return {
    name: /\balien\b/i.test(message) ? "Generated alien" : "Generated monster",
    kind: "creature",
    components: [
      component("capsule", "Body", [420, 720, 320], [0, 430, 0], {
        color: skin,
        radiusMm: 160,
        lengthMm: 400,
      }),
      component("sphere", "Head", [360, 320, 340], [0, 850, 0], { color: skin }),
      component("sphere", "Left eye", [70, 70, 45], [-75, 900, -165], { color: "#f4d45e" }),
      component("sphere", "Right eye", [70, 70, 45], [75, 900, -165], { color: "#f4d45e" }),
      component("capsule", "Left arm", [110, 520, 110], [-275, 500, 0], {
        color: skin,
        radiusMm: 55,
        lengthMm: 410,
        rotationDeg: [0, 0, -18],
      }),
      component("capsule", "Right arm", [110, 520, 110], [275, 500, 0], {
        color: skin,
        radiusMm: 55,
        lengthMm: 410,
        rotationDeg: [0, 0, 18],
      }),
      component("capsule", "Left leg", [140, 430, 140], [-115, 215, 0], {
        color: skin,
        radiusMm: 70,
        lengthMm: 290,
      }),
      component("capsule", "Right leg", [140, 430, 140], [115, 215, 0], {
        color: skin,
        radiusMm: 70,
        lengthMm: 290,
      }),
      component("cone", "Left horn", [90, 190, 90], [-90, 1090, 0], { color: "#d9c8a3" }),
      component("cone", "Right horn", [90, 190, 90], [90, 1090, 0], { color: "#d9c8a3" }),
    ],
  };
}

function sculptedFallback(message) {
  const round = /\b(round|circular|sphere|ball|orb)\b/i.test(message);
  const tall = /\b(tall|tower|column|vase|bottle)\b/i.test(message);
  const name = text(
    String(message || "").replace(CREATE_VERB, "").replace(/^(?:\s+(?:me|a|an|the|some))+\s*/i, ""),
    "described object",
    64,
  );
  if (/\b(vase|bottle|urn)\b/i.test(message)) {
    return {
      name,
      kind: "vase",
      components: [
        component("lathe", "Turned body", [320, 520, 320], [0, 260, 0], {
          color: "#6b8f88",
          profileMm: [
            [0, -260],
            [115, -250],
            [155, -170],
            [125, 30],
            [80, 190],
            [62, 250],
            [0, 260],
          ],
        }),
      ],
    };
  }
  return {
    name,
    kind: "object",
    components: [
      component(round ? "sphere" : tall ? "capsule" : "box", "Main body", tall ? [260, 700, 260] : [500, 400, 420], [0, tall ? 350 : 200, 0], {
        color: "#7293a8",
        radiusMm: 130,
        lengthMm: 440,
      }),
      component("sphere", "Detail", [180, 180, 180], [0, tall ? 720 : 450, 0], { color: "#d0a262" }),
    ],
  };
}

function objectPlanFromDescription(source) {
  if (
    /\b(?:round|circular|disc|disk)[\s-]*(?:table[\s-]*)?top\b/i.test(source) &&
    /\b(?:central|center|centre|single|one)\b[\s-]*(?:leg|support|pedestal)/i.test(source)
  ) {
    return tablePlan(`round table ${source}`);
  }
  if (/\b(tables?|desks?)\b/i.test(source)) return tablePlan(source);
  if (/\b(chair|seat)\b/i.test(source)) return chairPlan(source);
  if (/\b(stool|bench)\b/i.test(source)) return stoolPlan(source);
  if (/\b(sofa|couch)\b/i.test(source)) return sofaPlan(source);
  if (/\bbed\b/i.test(source)) return bedPlan(source);
  if (/\b(cabinet|bookcase|bookshelf|dresser|wardrobe)\b/i.test(source)) return cabinetPlan(source);
  if (/\b(lamp|light)\b/i.test(source)) return lampPlan(source);
  if (/\b(shelf|shelves)\b/i.test(source)) return shelfPlan(source);
  if (/\blegs?\b/i.test(source)) return legsPlan(source);
  if (/\b(monster|creature|alien)\b/i.test(source)) return creaturePlan(source);
  return sculptedFallback(source);
}

function roomScenePlan(message) {
  const source = String(message || "");
  const pair = source.match(
    /\b(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)?\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)?\b/i,
  );
  const unit = pair?.[4] || pair?.[2] || "m";
  const width = pair ? unitMm(pair[1], pair[2] || unit) : 4200;
  const depth = pair ? unitMm(pair[3], pair[4] || unit) : 3600;
  const height = measurement(source, "(?:height|high|tall)", 2700);
  const wall = Math.max(40, Math.min(120, Math.round(Math.min(width, depth) * 0.02)));
  const warm = /\b(warm|cosy|cozy)\b/i.test(source);
  const shell = [
    component("box", "Floor", [width, 35, depth], [0, 17.5, 0], { color: warm ? "#a9825d" : "#b89c78" }),
    component("box", "Back wall", [width, height, wall], [0, height / 2, depth / 2], {
      color: warm ? "#d8c6ae" : "#d6d2c8",
      roughness: 0.9,
    }),
    component("box", "Side wall", [wall, height, depth], [-width / 2, height / 2, 0], {
      color: warm ? "#d8c6ae" : "#d6d2c8",
      roughness: 0.9,
    }),
  ];
  const prompts = meshPromptsFromRoom(source);
  const generated = prompts.flatMap((prompt, index) => {
    const plan = objectPlanFromDescription(prompt);
    const xOffset = (index - (prompts.length - 1) / 2) * Math.min(1200, width / Math.max(2, prompts.length));
    return plan.components.map((body, bodyIndex) => ({
      ...body,
      id: `scene-${index + 1}-${bodyIndex + 1}-${body.id}`,
      name: `${plan.name} · ${body.name}`,
      positionMm: [
        Number(body.positionMm?.[0] || 0) + xOffset,
        Number(body.positionMm?.[1] || 0) + 35,
        Number(body.positionMm?.[2] || 0),
      ],
    }));
  });
  return {
    name: "Generated room corner",
    kind: "scene",
    components: [...shell, ...generated],
  };
}

export function meshPlanFromDescription(message) {
  const source = String(message || "");
  const plan = /\b(room|interior|room[\s-]*corner)\b/i.test(source)
    ? roomScenePlan(source)
    : objectPlanFromDescription(source);
  return sanitizeMeshSpec({ ...plan, prompt: source });
}

export function localMeshAction(message, ctx = {}) {
  const mesh = meshPlanFromDescription(meshPromptFromContext(message, ctx));
  return mesh ? { type: "mesh", mesh } : null;
}

const CREATE_VERB = /\b(make|model|build|create|design|generate|invent|sculpt)\b/i;
const NON_MODEL_ASK = /\b(find|search|buy|shop|catalog|manual|guide|assemble|assembly|reel|video|room|interior)\b/i;
const BRANDED_CATALOG_ASK = /\b(ikea|lack|linnmon|linmon|kallax|billy|malm)\b/i;

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
  const source = String(message || "");
  if (!CREATE_VERB.test(source)) return false;
  if (NON_MODEL_ASK.test(source) || BRANDED_CATALOG_ASK.test(source)) return false;
  return true;
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
      components: [
        component("cylinder", "Circular tabletop", [topDiameter, thickness, topDiameter], [0, legHeight, 0], {
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
    components: [
      component("box", "Tabletop", [width, thickness, depth], [0, legHeight, 0], { color: wood }),
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
  const colorValue = /\b(red)\b/i.test(message) ? "#a9463d" : "#b8824f";
  const legH = Math.max(200, seatY - 35);
  const legW = Math.max(28, width * 0.07);
  return {
    name: "Custom chair",
    components: [
      component("box", "Seat", [width, 45, depth], [0, seatY, 0], { color: colorValue }),
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
    components: [
      component("box", "Shelf", [width, thickness, depth], [0, 420, 0], { color: "#bd8956" }),
      component("box", "Left bracket", [35, 210, depth * 0.8], [-width * 0.34, 315, 0], { color: "#3e4246", metalness: 0.7 }),
      component("box", "Right bracket", [35, 210, depth * 0.8], [width * 0.34, 315, 0], { color: "#3e4246", metalness: 0.7 }),
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

export function meshPlanFromDescription(message) {
  const source = String(message || "");
  let plan;
  if (/\btables?\b/i.test(source)) plan = tablePlan(source);
  else if (/\b(chair|seat)\b/i.test(source)) plan = chairPlan(source);
  else if (/\b(lamp|light)\b/i.test(source)) plan = lampPlan(source);
  else if (/\b(shelf|shelves)\b/i.test(source)) plan = shelfPlan(source);
  else plan = sculptedFallback(source);
  return sanitizeMeshSpec({ ...plan, prompt: source });
}

export function localMeshAction(message) {
  const mesh = meshPlanFromDescription(message);
  return mesh ? { type: "mesh", mesh } : null;
}

const SHAPES = Object.freeze({
  cube: {
    label: "Cube",
    component: { shape: "box", sizeMm: [400, 400, 400] },
  },
  sphere: {
    label: "Sphere",
    component: { shape: "sphere", sizeMm: [400, 400, 400], segments: 40 },
  },
  cylinder: {
    label: "Cylinder",
    component: { shape: "cylinder", sizeMm: [400, 500, 400], segments: 40 },
  },
  cone: {
    label: "Cone",
    component: { shape: "cone", sizeMm: [420, 500, 420], segments: 40 },
  },
  torus: {
    label: "Torus",
    component: {
      shape: "torus",
      sizeMm: [500, 120, 500],
      majorRadiusMm: 190,
      tubeRadiusMm: 60,
      segments: 48,
    },
  },
  plane: {
    label: "Plane",
    component: { shape: "plane", sizeMm: [600, 1, 600] },
  },
});

export const SHAPE_SUMMON_NAMES = Object.freeze(Object.keys(SHAPES));

export function shapeSummonSpec(name) {
  const key = String(name || "").toLowerCase();
  const entry = SHAPES[key];
  if (!entry) return null;
  return {
    name: entry.label,
    kind: "primitive",
    prompt: `Summon ${entry.label.toLowerCase()}`,
    components: [{
      id: key,
      name: entry.label,
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      color: "#c99a62",
      roughness: 0.52,
      metalness: 0.04,
      ...entry.component,
    }],
  };
}

export function bindShapeSummonButtons(root, summon) {
  if (!root?.querySelectorAll || typeof summon !== "function") return 0;
  let bound = 0;
  for (const button of root.querySelectorAll("[data-summon-shape]")) {
    const name = String(button.dataset?.summonShape || "").toLowerCase();
    const spec = shapeSummonSpec(name);
    if (!spec) continue;
    button.addEventListener("click", () => summon(shapeSummonSpec(name), name, button));
    bound += 1;
  }
  return bound;
}

const PARTS = [
  {
    id: "generic-side-table",
    sku: "TEST-TABLE-550",
    ikeaArticle: null,
    name: "Test table 55×55",
    brand: "IKEA-vibe",
    category: "furniture",
    shape: "table",
    cost: 12,
    store: "generic",
    storeUrl: "",
    includedIn: [],
    dimsMm: { x: 550, y: 550, z: 450 },
    massG: 6100,
    material: "particleboard",
    color: "#ecdfc6",
    texture: "birch-foil",
    printable: false,
    strengthMpa: 12,
    thermalAlpha: 0.00003,
    ports: [],
    specs: { loadKg: 25, indoor: true, placeholder: true },
    note: "Generic 550 × 550 mm top, ~450 mm high. Specs needed for an exact IKEA article.",
  },
  {
    id: "lack-table",
    sku: "IKEA-LACK-304.499.08",
    ikeaArticle: "304.499.08",
    name: "LACK side table 55×55",
    brand: "IKEA-like",
    category: "furniture",
    shape: "table",
    cost: 14.99,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=LACK+side+table",
    includedIn: ["lack-kit"],
    dimsMm: { x: 550, y: 550, z: 450 },
    massG: 6100,
    material: "particleboard",
    color: "#ecdfc6",
    texture: "birch-foil",
    printable: false,
    strengthMpa: 12,
    thermalAlpha: 0.00003,
    ports: [],
    specs: { loadKg: 25, indoor: true },
    kitParts: ["lack-top", "lack-leg", "lack-leg", "lack-leg", "lack-leg"],
  },
  {
    id: "lack-top",
    sku: "IKEA-LACK-TOP",
    ikeaArticle: "304.499.08-TOP",
    name: "LACK table top 550×550×36",
    brand: "IKEA-like",
    category: "furniture",
    shape: "slab",
    cost: 9.0,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=LACK+table+top",
    includedIn: ["lack-kit"],
    dimsMm: { x: 550, y: 550, z: 36 },
    massG: 4200,
    material: "particleboard",
    color: "#ecdfc6",
    texture: "birch-foil",
    printable: false,
    strengthMpa: 12,
    thermalAlpha: 0.00003,
    ports: [
      { id: "insert-a", kind: "m6-insert", xyz: [-230, -230, -18], lock: "screw" },
      { id: "insert-b", kind: "m6-insert", xyz: [230, -230, -18], lock: "screw" },
      { id: "insert-c", kind: "m6-insert", xyz: [-230, 230, -18], lock: "screw" },
      { id: "insert-d", kind: "m6-insert", xyz: [230, 230, -18], lock: "screw" },
    ],
    specs: { loadKg: 25 },
  },
  {
    id: "lack-leg",
    sku: "IKEA-LACK-LEG",
    ikeaArticle: "304.499.08-LEG",
    name: "LACK leg 414 mm",
    brand: "IKEA-like",
    category: "furniture",
    shape: "post",
    cost: 2.0,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=LACK+leg",
    includedIn: ["lack-kit"],
    dimsMm: { x: 50, y: 50, z: 414 },
    massG: 480,
    material: "particleboard",
    color: "#ecdfc6",
    texture: "birch-foil",
    printable: true,
    strengthMpa: 10,
    thermalAlpha: 0.00003,
    ports: [{ id: "tenon", kind: "m6-screw", xyz: [0, 0, 207], lock: "screw" }],
    specs: { loadKg: 8 },
  },
  {
    id: "linmon-top",
    sku: "IKEA-LINNMON",
    ikeaArticle: "002.511.35",
    name: "LINNMON table top 100×60",
    brand: "IKEA-like",
    category: "furniture",
    shape: "slab",
    cost: 25.0,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=LINNMON",
    dimsMm: { x: 1000, y: 600, z: 34 },
    massG: 8200,
    material: "particleboard",
    color: "#ffffff",
    texture: "white-foil",
    printable: false,
    strengthMpa: 11,
    ports: [],
    specs: { loadKg: 50 },
  },
  {
    id: "adils-leg",
    sku: "IKEA-ADILS",
    ikeaArticle: "902.179.72",
    name: "ADILS leg",
    brand: "IKEA-like",
    category: "furniture",
    shape: "post",
    cost: 6.0,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=ADILS",
    dimsMm: { x: 40, y: 40, z: 700 },
    massG: 1100,
    material: "steel",
    color: "#222222",
    texture: "powder-coat",
    printable: false,
    strengthMpa: 250,
    ports: [{ id: "plate", kind: "m6-screw", xyz: [0, 0, 350], lock: "screw" }],
    specs: { loadKg: 25 },
  },
  {
    id: "arduino-nano",
    sku: "ARD-NANO-CH340",
    ikeaArticle: null,
    name: "Arduino Nano",
    brand: "Arduino-like",
    category: "electronics",
    shape: "board",
    cost: 8.5,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=arduino+nano",
    dimsMm: { x: 45, y: 18, z: 7 },
    massG: 7,
    material: "FR4",
    color: "#1b4d8c",
    texture: "pcb-blue",
    printable: false,
    strengthMpa: 70,
    thermalAlpha: 0.000014,
    ports: [
      { id: "usb", kind: "usb-mini", xyz: [-22, 0, 0], lock: "friction" },
      { id: "d2", kind: "header-2.54", xyz: [10, 7, 2], lock: "header" },
      { id: "d3", kind: "header-2.54", xyz: [12.5, 7, 2], lock: "header" },
      { id: "d13", kind: "header-2.54", xyz: [18, 7, 2], lock: "header" },
      { id: "5v", kind: "header-2.54", xyz: [-8, -7, 2], lock: "header" },
      { id: "gnd", kind: "header-2.54", xyz: [-10.5, -7, 2], lock: "header" },
    ],
    specs: { voltage: 5, mcu: "ATmega328P", clockMhz: 16, digitalPins: 14 },
    firmwareRole: "mcu",
  },
  {
    id: "esp32-dev",
    sku: "ESP32-WROOM",
    ikeaArticle: null,
    name: "ESP32 DevKit",
    brand: "Espressif-like",
    category: "electronics",
    shape: "board",
    cost: 9.9,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=esp32+devkit",
    dimsMm: { x: 55, y: 28, z: 8 },
    massG: 10,
    material: "FR4",
    color: "#111111",
    texture: "pcb-black",
    printable: false,
    ports: [
      { id: "usb", kind: "usb-c", xyz: [-27, 0, 0], lock: "friction" },
      { id: "gnd", kind: "header-2.54", xyz: [10, -12, 2], lock: "header" },
      { id: "3v3", kind: "header-2.54", xyz: [8, -12, 2], lock: "header" },
    ],
    specs: { voltage: 3.3, mcu: "Xtensa", wifi: true },
    firmwareRole: "mcu",
  },
  {
    id: "led-5mm",
    sku: "LED-5MM-W",
    ikeaArticle: null,
    name: "5 mm white LED",
    brand: "Shop",
    category: "electronics",
    shape: "led",
    cost: 0.12,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=5mm+led",
    dimsMm: { x: 5, y: 5, z: 8 },
    massG: 0.3,
    material: "epoxy",
    color: "#f8fbff",
    texture: "gloss",
    printable: false,
    ports: [
      { id: "anode", kind: "lead", xyz: [1, 0, -4], lock: "header" },
      { id: "cathode", kind: "lead", xyz: [-1, 0, -4], lock: "header" },
    ],
    specs: { voltage: 3.1, currentMa: 20, lumens: 12 },
    firmwareRole: "led",
  },
  {
    id: "ws2812-strip",
    sku: "WS2812-30",
    ikeaArticle: null,
    name: "WS2812 30-LED strip 0.5 m",
    brand: "Shop",
    category: "electronics",
    shape: "led-strip",
    cost: 6.4,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=ws2812+strip",
    dimsMm: { x: 500, y: 10, z: 3 },
    massG: 18,
    material: "flex-pcb",
    color: "#2a2a2a",
    texture: "silicone",
    printable: false,
    ports: [
      { id: "din", kind: "jst-3", xyz: [-250, 0, 0], lock: "jst" },
      { id: "5v", kind: "jst-3", xyz: [-248, 2, 0], lock: "jst" },
      { id: "gnd", kind: "jst-3", xyz: [-248, -2, 0], lock: "jst" },
    ],
    specs: { voltage: 5, currentMa: 900, pixels: 30 },
    firmwareRole: "led",
  },
  {
    id: "tactile-btn",
    sku: "BTN-6MM",
    ikeaArticle: null,
    name: "Tactile button 6 mm",
    brand: "Shop",
    category: "electronics",
    shape: "button",
    cost: 0.18,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=tactile+button",
    dimsMm: { x: 6, y: 6, z: 5 },
    massG: 0.4,
    material: "nylon",
    color: "#222222",
    texture: "matte",
    printable: false,
    ports: [
      { id: "a", kind: "lead", xyz: [2, 2, -2], lock: "header" },
      { id: "b", kind: "lead", xyz: [-2, -2, -2], lock: "header" },
    ],
    specs: { voltage: 12 },
    firmwareRole: "button",
  },
  {
    id: "breadboard",
    sku: "BB-400",
    ikeaArticle: null,
    name: "Half breadboard",
    brand: "Shop",
    category: "electronics",
    shape: "breadboard",
    cost: 3.2,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=breadboard+400",
    dimsMm: { x: 84, y: 55, z: 9 },
    massG: 32,
    material: "ABS",
    color: "#fff6d6",
    texture: "abs",
    printable: false,
    ports: [{ id: "rail", kind: "header-2.54", xyz: [0, 24, 4], lock: "header" }],
    specs: { ties: 400 },
  },
  {
    id: "resistor-220",
    sku: "R-220-025",
    ikeaArticle: null,
    name: "220 Ω resistor",
    brand: "Shop",
    category: "electronics",
    shape: "resistor",
    cost: 0.05,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=220+ohm+resistor",
    dimsMm: { x: 6, y: 2, z: 2 },
    massG: 0.2,
    material: "ceramic",
    color: "#c4a574",
    texture: "axial",
    printable: false,
    ports: [
      { id: "a", kind: "lead", xyz: [-8, 0, 0], lock: "header" },
      { id: "b", kind: "lead", xyz: [8, 0, 0], lock: "header" },
    ],
    specs: { ohms: 220, watts: 0.25 },
  },
  {
    id: "psu-5v2a",
    sku: "PSU-5V2A",
    ikeaArticle: null,
    name: "5 V 2 A wall supply",
    brand: "Shop",
    category: "electronics",
    cost: 7.5,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=5v+2a+supply",
    dimsMm: { x: 70, y: 40, z: 30 },
    massG: 90,
    material: "ABS",
    color: "#111111",
    texture: "matte",
    printable: false,
    ports: [{ id: "barrel", kind: "barrel-5.5", xyz: [35, 0, 0], lock: "barrel" }],
    specs: { voltage: 5, currentMa: 2000 },
  },
  {
    id: "jumper-m2m",
    sku: "JMP-M2M",
    ikeaArticle: null,
    name: "Male-male jumper pack",
    brand: "Shop",
    category: "cable",
    cost: 2.4,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=jumper+wires",
    dimsMm: { x: 150, y: 2, z: 2 },
    massG: 8,
    material: "PVC",
    color: "#e23b3b",
    texture: "wire",
    printable: false,
    ports: [
      { id: "end-a", kind: "header-2.54", xyz: [-75, 0, 0], lock: "header" },
      { id: "end-b", kind: "header-2.54", xyz: [75, 0, 0], lock: "header" },
    ],
    specs: { awg: 24, lengthMm: 150 },
  },
  {
    id: "usb-mini-cable",
    sku: "USB-MINI-1M",
    ikeaArticle: null,
    name: "USB-A to Mini-B cable",
    brand: "Shop",
    category: "cable",
    cost: 3.1,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=usb+mini+cable",
    dimsMm: { x: 1000, y: 6, z: 6 },
    massG: 28,
    material: "PVC",
    color: "#111111",
    texture: "wire",
    printable: false,
    ports: [
      { id: "a", kind: "usb-a", xyz: [-500, 0, 0], lock: "friction" },
      { id: "b", kind: "usb-mini", xyz: [500, 0, 0], lock: "friction" },
    ],
    specs: { lengthMm: 1000 },
  },
  {
    id: "tape-electrical",
    sku: "TAPE-ELEC",
    ikeaArticle: null,
    name: "Electrical tape roll",
    brand: "Shop",
    category: "tape",
    cost: 1.8,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=electrical+tape",
    dimsMm: { x: 50, y: 50, z: 18 },
    massG: 40,
    material: "PVC",
    color: "#111111",
    texture: "vinyl",
    printable: false,
    ports: [],
    specs: { shearKpa: 180, peelN: 4, ipBoost: 1, weatherSeal: 0.35 },
  },
  {
    id: "tape-gaffer",
    sku: "TAPE-GAFF",
    ikeaArticle: null,
    name: "Gaffer tape",
    brand: "Shop",
    category: "tape",
    cost: 8.0,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=gaffer+tape",
    dimsMm: { x: 80, y: 80, z: 30 },
    massG: 180,
    material: "cloth",
    color: "#1a1a1a",
    texture: "cloth",
    printable: false,
    ports: [],
    specs: { shearKpa: 320, peelN: 12, ipBoost: 2, weatherSeal: 0.55 },
  },
  {
    id: "tape-packing",
    sku: "TAPE-PACK",
    ikeaArticle: null,
    name: "Packing tape",
    brand: "Shop",
    category: "tape",
    cost: 2.2,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=packing+tape",
    dimsMm: { x: 80, y: 80, z: 20 },
    massG: 90,
    material: "BOPP",
    color: "#d9c27a",
    texture: "gloss",
    printable: false,
    ports: [],
    specs: { shearKpa: 35, peelN: 1.2, ipBoost: 0, weatherSeal: 0.1 },
  },
  {
    id: "zip-tie",
    sku: "ZIP-100",
    ikeaArticle: null,
    name: "Zip ties 100 mm",
    brand: "Shop",
    category: "fastener",
    cost: 1.2,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=zip+ties",
    dimsMm: { x: 100, y: 3, z: 1 },
    massG: 2,
    material: "nylon",
    color: "#111111",
    texture: "nylon",
    printable: false,
    ports: [],
    specs: { strainRelief: true },
  },
  {
    id: "m6-screw",
    sku: "SCR-M6-12",
    ikeaArticle: "100224",
    name: "M6 × 12 machine screw",
    brand: "Shop",
    category: "fastener",
    shape: "screw",
    cost: 0.15,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=m6+screw",
    includedIn: ["lack-kit"],
    dimsMm: { x: 10, y: 10, z: 12 },
    massG: 4,
    material: "steel",
    color: "#8a8a8a",
    texture: "metal",
    printable: false,
    ports: [{ id: "thread", kind: "m6-screw", xyz: [0, 0, 0], lock: "screw" }],
    specs: {},
  },
  {
    id: "allen-key",
    sku: "TOOL-ALLEN-4",
    ikeaArticle: "100049",
    name: "4 mm Allen key",
    brand: "IKEA-like",
    category: "tool",
    cost: 0,
    store: "IKEA",
    storeUrl: "https://www.ikea.com/search?q=allen+key",
    includedIn: ["lack-kit"],
    extra: false,
    dimsMm: { x: 80, y: 20, z: 4 },
    massG: 18,
    material: "steel",
    color: "#bfbfbf",
    texture: "metal",
    printable: false,
    ports: [],
    specs: {},
  },
  {
    id: "screwdriver",
    sku: "TOOL-PH2",
    ikeaArticle: null,
    name: "Phillips screwdriver",
    brand: "Shop",
    category: "tool",
    cost: 5.0,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=phillips+screwdriver",
    extra: true,
    dimsMm: { x: 180, y: 30, z: 30 },
    massG: 80,
    material: "steel",
    color: "#c45c26",
    texture: "tool",
    printable: false,
    ports: [],
    specs: {},
  },
  {
    id: "soldering-iron",
    sku: "TOOL-IRON",
    ikeaArticle: null,
    name: "Soldering iron 40 W",
    brand: "Shop",
    category: "tool",
    cost: 14.0,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=soldering+iron",
    extra: true,
    dimsMm: { x: 220, y: 30, z: 30 },
    massG: 140,
    material: "steel",
    color: "#222222",
    texture: "tool",
    printable: false,
    ports: [],
    specs: {},
  },
  {
    id: "multimeter",
    sku: "TOOL-DMM",
    ikeaArticle: null,
    name: "Digital multimeter",
    brand: "Shop",
    category: "tool",
    cost: 16.0,
    store: "Amazon",
    storeUrl: "https://www.amazon.com/s?k=multimeter",
    extra: true,
    dimsMm: { x: 140, y: 70, z: 35 },
    massG: 200,
    material: "ABS",
    color: "#f0b429",
    texture: "abs",
    printable: false,
    ports: [],
    specs: {},
  },
  {
    id: "enclosure-print",
    sku: "PRINT-BOX",
    ikeaArticle: null,
    name: "Printable lamp enclosure",
    brand: "Workshop",
    category: "printable",
    cost: 0.4,
    store: "Workshop",
    storeUrl: "",
    dimsMm: { x: 80, y: 50, z: 28 },
    massG: 22,
    material: "PLA",
    color: "#ffda1a",
    texture: "pla",
    printable: true,
    strengthMpa: 40,
    thermalAlpha: 0.00008,
    ports: [{ id: "usb-cut", kind: "usb-mini", xyz: [-40, 0, 0], lock: "friction" }],
    specs: { nozzleMm: 0.4 },
  },
  {
    id: "pine-offcut",
    sku: "LUMBER-PINE-550",
    ikeaArticle: null,
    name: "Pine offcut 550×550×18",
    brand: "Hardware",
    category: "furniture",
    cost: 7.5,
    store: "Hardware",
    storeUrl: "https://www.amazon.com/s?k=pine+board+18mm",
    dimsMm: { x: 550, y: 550, z: 18 },
    massG: 2800,
    material: "pine",
    color: "#d7b07a",
    texture: "oak-open",
    printable: false,
    strengthMpa: 30,
    ports: [],
    specs: { loadKg: 40 },
  },
  {
    id: "dowel-18",
    sku: "DOWEL-18",
    ikeaArticle: null,
    name: "Hardwood dowel 18×400",
    brand: "Hardware",
    category: "furniture",
    shape: "dowel",
    cost: 1.6,
    store: "Hardware",
    storeUrl: "https://www.amazon.com/s?k=hardwood+dowel+18mm",
    dimsMm: { x: 18, y: 18, z: 400 },
    massG: 70,
    material: "beech",
    color: "#c8965a",
    texture: "oak-open",
    printable: false,
    strengthMpa: 45,
    ports: [],
    specs: { loadKg: 12 },
  },
];

const LAB_SHELF_SKIP_IDS = new Set([
  "arduino-nano",
  "esp32-dev",
  "led-5mm",
  "ws2812-strip",
  "tactile-btn",
  "breadboard",
  "resistor-220",
  "psu-5v2a",
  "jumper-m2m",
  "usb-mini-cable",
  "soldering-iron",
  "multimeter",
  "enclosure-print",
]);

/** Lab shelf: furniture, hardware, tape, and hand tools — no boards or robotics. */
export function isLabShelfPart(part) {
  if (!part) return false;
  if (part.category === "electronics" || part.category === "cable") return false;
  if (LAB_SHELF_SKIP_IDS.has(part.id)) return false;
  if (part.firmwareRole) return false;
  return true;
}

export function labShelfParts(parts = PARTS) {
  return parts.filter(isLabShelfPart).map((p) => ({ ...p }));
}

/** Typed in shop chat — boards stay hidden until one of these hits. */
export const ELECTRONICS_SEARCH =
  /\b(arduino|leds?|nano|esp(?:32)?|resistors?|breadboards?|jumpers?|solder(?:ing)?)\b/i;

export function isElectronicsQuery(query) {
  return ELECTRONICS_SEARCH.test(String(query || ""));
}

export function includeLabElectronics({ query = "", showElectronics = false } = {}) {
  return Boolean(showElectronics) || isElectronicsQuery(query);
}

/** Default Lab catalog is furniture/hardware. Electronics only if searched or toggled. */
export function filterLabCatalog(parts, { query = "", showElectronics = false } = {}) {
  const list = Array.isArray(parts) ? parts : [];
  if (includeLabElectronics({ query, showElectronics })) {
    return list.map((p) => ({ ...p }));
  }
  return list.filter(isLabShelfPart).map((p) => ({ ...p }));
}

export function listParts() {
  return PARTS.map((p) => ({ ...p }));
}

export function getPart(id) {
  return PARTS.find((p) => p.id === id) || null;
}

function asMm(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeDims(dimsMm, extra = {}) {
  const src = dimsMm && typeof dimsMm === "object" ? dimsMm : {};
  const x = asMm(src.x ?? extra.x ?? extra.maxX);
  const y = asMm(src.y ?? extra.y ?? extra.maxY);
  const z = asMm(src.z ?? extra.z ?? extra.maxZ);
  if (!x && !y && !z) return null;
  return {
    x: x || y || z,
    y: y || x || z,
    ...(z ? { z } : {}),
  };
}

/** True when the part's footprint fits the envelope (XY, optionally rotated). Height is optional. */
export function fitsDims(part, dimsMm, { slack = 1, axes = "xy" } = {}) {
  const envelope = normalizeDims(dimsMm);
  const d = part?.dimsMm;
  if (!envelope || !d) return false;
  const w = asMm(d.x);
  const depth = asMm(d.y);
  const h = asMm(d.z);
  const maxX = envelope.x * slack + 1e-6;
  const maxY = envelope.y * slack + 1e-6;
  const unrotated = w <= maxX && depth <= maxY;
  const rotated = depth <= maxX && w <= maxY;
  if (!(unrotated || rotated)) return false;
  if (String(axes).includes("z") && envelope.z) {
    return h <= envelope.z * slack + 1e-6;
  }
  return true;
}

export function searchParts({
  query = "",
  maxCost = Infinity,
  category,
  minSpecs = {},
  store,
  dimsMm,
  maxX,
  maxY,
  maxZ,
  x,
  y,
  z,
} = {}) {
  const q = String(query || "").trim().toLowerCase();
  const envelope = normalizeDims(dimsMm, { x: x ?? maxX, y: y ?? maxY, z: z ?? maxZ });
  return PARTS.filter((part) => {
    if (part.cost > maxCost) return false;
    if (category && part.category !== category) return false;
    if (store && part.store !== store) return false;
    if (envelope && !fitsDims(part, envelope)) return false;
    if (q) {
      const hay = `${part.id} ${part.name} ${part.sku} ${part.ikeaArticle || ""} ${part.brand} ${part.category} ${part.material} ${part.shape || ""}`.toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      const hit = (token) => hay.includes(token) || (token.endsWith("s") && token.length > 3 && hay.includes(token.slice(0, -1)));
      if (tokens.length ? !tokens.every(hit) : !hay.includes(q)) return false;
    }
    for (const [key, min] of Object.entries(minSpecs || {})) {
      const value = part.specs?.[key];
      if (value == null || Number(value) < Number(min)) return false;
    }
    return true;
  }).map((p) => ({
    ...p,
    extra: Boolean(p.extra),
    matchNote: "Catalog list only — live web scrape is stubbed for now.",
  }));
}

export function retailerOffers(part) {
  if (!part) return { partner: "tavily-standin", offers: [] };
  const q = encodeURIComponent(part.name);
  const offers = [
    {
      store: part.store || "Catalog",
      url: part.storeUrl || `https://www.ikea.com/search?q=${q}`,
      price: part.cost,
      primary: true,
    },
  ];
  if (part.store !== "Amazon") {
    offers.push({
      store: "Amazon",
      url: `https://www.amazon.com/s?k=${q}`,
      price: Number(((Number(part.cost) || 0) * 1.08).toFixed(2)),
    });
  }
  if (part.store !== "IKEA") {
    offers.push({
      store: "IKEA",
      url: `https://www.ikea.com/search?q=${encodeURIComponent(part.ikeaArticle || part.name)}`,
      price: part.ikeaArticle ? part.cost : null,
      note: part.ikeaArticle ? null : "Search — may not be an IKEA part",
    });
  }
  offers.push({
    store: "Hardware / local",
    url: `https://www.google.com/search?q=${q}+buy`,
    price: null,
    note: "Compare nearby",
  });
  return { partner: "tavily-standin", offers };
}

export function cheaperAlternatives(partId, { maxCost } = {}) {
  const part = getPart(partId);
  if (!part) return [];
  const cap = maxCost ?? part.cost;
  return PARTS.filter(
    (p) =>
      p.id !== partId &&
      p.category === part.category &&
      p.cost <= cap &&
      (part.specs?.loadKg ? (p.specs?.loadKg || 0) >= part.specs.loadKg * 0.7 : true),
  )
    .sort((a, b) => a.cost - b.cost)
    .map((p) => ({
      ...p,
      saved: Number((part.cost - p.cost).toFixed(2)),
      note: `Cheaper stand-in for ${part.name}`,
    }));
}

export function bomFromIds(ids, { kit = "lack-kit" } = {}) {
  const lines = [];
  for (const id of ids) {
    const part = getPart(id);
    if (!part) continue;
    const existing = lines.find((l) => l.id === id);
    if (existing) existing.qty += 1;
    else {
      lines.push({
        id: part.id,
        name: part.name,
        qty: 1,
        cost: part.cost,
        store: part.store,
        storeUrl: part.storeUrl,
        ikeaArticle: part.ikeaArticle ?? null,
        included: (part.includedIn || []).includes(kit) || part.cost === 0,
        extra: Boolean(part.extra) || !(part.includedIn || []).includes(kit),
        category: part.category,
        color: part.color,
        texture: part.texture,
        badge: (part.includedIn || []).includes(kit) || part.cost === 0 ? "included" : "to purchase",
        picture: { color: part.color, texture: part.texture },
        retailers:
          (part.includedIn || []).includes(kit) || part.cost === 0 ? [] : retailerOffers(part).offers,
      });
    }
  }
  const extra = lines.filter((l) => l.extra && !l.included);
  const included = lines.filter((l) => l.included);
  const total = lines.reduce((sum, l) => sum + l.cost * l.qty, 0);
  return { lines, included, extra, total: Number(total.toFixed(2)), kit };
}

export const PARTNERS = {
  video: { name: "ByteDance Seedance 2.5", status: "proposed", used: false, note: "Local storyboard player stands in until FAL_KEY is set." },
  parser: { name: "Pioneer / GLiNER 2", status: "proposed", used: false, note: "Deterministic guide parser stands in." },
  search: { name: "Tavily", status: "optional", used: false, note: "Looks up IKEA / Amazon / hardware shops for tools that are not in the box. Set TAVILY_API_KEY." },
};

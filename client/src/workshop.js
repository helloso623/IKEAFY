import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const MM = 0.001;
const PALE = "#f2f2f2";

function grayWoodMap({ width = 512, height = 512, planks = 10, seed = 1 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(0, 0, width, height);
  const plankH = height / planks;
  for (let i = 0; i < planks; i += 1) {
    const y = i * plankH;
    const shade = (i * 47 + seed * 13) % 18;
    ctx.fillStyle = `rgb(${226 - shade}, ${226 - shade}, ${224 - shade * 0.7})`;
    ctx.fillRect(0, y, width, plankH);
    for (let x = 0; x < width; x += 2) {
      const wobble = Math.sin((x + seed * 20) * 0.035 + i * 1.7) * 7 + Math.sin(x * 0.12) * 2;
      const alpha = 0.03 + ((x + i * 11 + seed) % 23) * 0.0035;
      ctx.fillStyle = `rgba(80, 80, 80, ${alpha})`;
      ctx.fillRect(x, y + 3 + wobble * 0.15, 1.4, plankH - 6);
    }
    if ((i + seed) % 3 === 0) {
      ctx.fillStyle = "rgba(110, 110, 110, 0.12)";
      ctx.beginPath();
      ctx.ellipse(80 + ((i * 97 + seed * 30) % (width - 160)), y + plankH * 0.5, 18, 3.2, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(60, 60, 60, 0.18)";
    ctx.fillRect(0, y, width, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function pcbMap(hex = "#1b4d8c") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    ctx.moveTo(8, 6 + i * 8);
    ctx.bezierCurveTo(80, 10 + i * 7, 160, 4 + i * 9, 248, 12 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(210, 200, 150, 0.35)";
  for (let i = 0; i < 28; i += 1) {
    ctx.beginPath();
    ctx.arc(14 + (i * 17) % 230, 10 + (i * 13) % 110, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function breadboardMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f4f0";
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#c45c5c";
  ctx.fillRect(0, 8, 256, 6);
  ctx.fillStyle = "#3d6aa8";
  ctx.fillRect(0, 146, 256, 6);
  ctx.fillStyle = "#2a2a2a";
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 24; col += 1) {
      ctx.fillRect(10 + col * 10, 24 + row * 12, 2.2, 2.2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function inferShape(part) {
  if (part.shape) return part.shape;
  if (part.id === "lack-table" || part.kitParts?.length) return "table";
  if (part.category === "cable") return "cable";
  if (part.firmwareRole === "led" && /strip|ws2812/.test(part.id)) return "led-strip";
  if (part.firmwareRole === "led") return "led";
  if (/breadboard/.test(part.id)) return "breadboard";
  if (/resistor/.test(part.id)) return "resistor";
  if (/btn|button/.test(part.id)) return "button";
  if (part.category === "electronics") return "board";
  if (/screw/.test(part.id) || (part.category === "fastener" && part.texture === "metal")) return "screw";
  if (/dowel/.test(part.id)) return "dowel";
  if (/leg/.test(part.id)) return "post";
  if (/top/.test(part.id) || (part.category === "furniture" && part.dimsMm.z < 50 && part.dimsMm.x > 200))
    return "slab";
  if (part.category === "tape") return "tape";
  if (/zip/.test(part.id)) return "zip";
  if (/allen/.test(part.id)) return "allen";
  if (/screwdriver/.test(part.id)) return "driver";
  if (/soldering/.test(part.id)) return "iron";
  if (/multimeter/.test(part.id)) return "meter";
  if (part.category === "printable") return "enclosure";
  return "box";
}

function stdMat(opts) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.62,
    metalness: 0.04,
    ...opts,
  });
}

function materialFor(part, piece) {
  const hex = part.color || piece.color || PALE;
  const color = new THREE.Color(hex);
  const texture = part.texture || piece.texture;
  const foil = texture === "birch-foil" || texture === "white-foil";
  if (foil) color.lerp(new THREE.Color(0xf4f4f4), 0.62);
  const metal = texture === "metal" || part.material === "steel";
  const pcb = /^pcb-/.test(texture || "");
  const mat = stdMat({
    color,
    roughness: metal ? 0.28 : foil ? 0.58 : pcb ? 0.42 : texture === "gloss" ? 0.18 : 0.66,
    metalness: metal ? 0.72 : foil ? 0.03 : pcb ? 0.12 : 0.05,
    emissive: part.firmwareRole === "led" ? new THREE.Color(0x2a2a2a) : 0x000000,
  });
  if (foil) {
    const map = grayWoodMap({ planks: 8, seed: part.id.length + 3 });
    map.repeat.set(2, 1);
    mat.map = map;
  }
  if (pcb) mat.map = pcbMap(hex);
  return mat;
}

function shadow(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return obj;
}

function add(parent, geo, mat, x = 0, y = 0, z = 0, keepColor = false) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (keepColor) mesh.userData.keepColor = true;
  parent.add(mesh);
  return mesh;
}

function makeSlab(w, h, d, mat) {
  const g = new THREE.Group();
  const bevel = Math.min(0.005, h * 0.22, w * 0.012);
  const edge = mat.clone();
  edge.color = mat.color.clone().multiplyScalar(0.86);
  add(g, new THREE.BoxGeometry(w - bevel * 2, h * 0.72, d - bevel * 2), edge, 0, -h * 0.04, 0);
  add(g, new THREE.BoxGeometry(w, Math.max(h * 0.26, bevel), d), mat, 0, h * 0.32, 0);
  add(g, new THREE.BoxGeometry(w - bevel, h * 0.12, d - bevel), edge, 0, -h * 0.4, 0);
  return g;
}

function makePost(w, h, d, mat, steel = false) {
  const g = new THREE.Group();
  const edge = mat.clone();
  edge.color = mat.color.clone().multiplyScalar(0.9);
  add(g, new THREE.BoxGeometry(w, h * 0.96, d), mat, 0, -h * 0.005, 0);
  add(g, new THREE.BoxGeometry(w * 1.04, h * 0.018, d * 1.04), edge, 0, -h * 0.485, 0);
  const cap = steel
    ? new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 0.03, 16)
    : new THREE.BoxGeometry(w * 0.55, h * 0.03, d * 0.55);
  const capMat = steel
    ? stdMat({ color: 0x6a6a6a, roughness: 0.3, metalness: 0.7 })
    : stdMat({ color: 0xb8b8b8, roughness: 0.35, metalness: 0.45 });
  add(g, cap, capMat, 0, h * 0.485, 0, true);
  return g;
}

function makeTable(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const topH = Math.min(0.036, h * 0.08);
  const legW = Math.min(0.05, w * 0.09);
  const legH = h - topH;
  const inset = Math.min(0.05, w * 0.09);
  const g = new THREE.Group();
  const top = makeSlab(w, topH, d, mat);
  top.position.y = h / 2 - topH / 2;
  g.add(top);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = makePost(legW, legH, legW, mat.clone());
    leg.position.set(sx * (w / 2 - inset), -h / 2 + legH / 2, sz * (d / 2 - inset));
    g.add(leg);
  }
  return g;
}

function makeBoard(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h * 0.32, d), mat, 0, -h * 0.18, 0);
  add(
    g,
    new THREE.BoxGeometry(w * 0.3, h * 0.28, d * 0.34),
    stdMat({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.08 }),
    0.02 * Math.sign(w),
    h * 0.08,
    0,
    true,
  );
  add(
    g,
    new THREE.BoxGeometry(w * 0.14, h * 0.38, d * 0.32),
    stdMat({ color: 0x9a9a9a, roughness: 0.28, metalness: 0.65 }),
    -w * 0.42,
    0,
    0,
    true,
  );
  const pinMat = stdMat({ color: 0xc5c5c5, roughness: 0.25, metalness: 0.7 });
  const pinH = h * 0.55;
  const rows = [
    [d * 0.38, 7],
    [-d * 0.38, 7],
  ];
  for (const [pz, count] of rows) {
    for (let i = 0; i < count; i += 1) {
      const px = -w * 0.28 + (i * w * 0.56) / Math.max(count - 1, 1);
      add(g, new THREE.BoxGeometry(0.0009, pinH, 0.0009), pinMat, px, h * 0.12, pz, true);
    }
  }
  return g;
}

function makeLed(part, mat) {
  const r = Math.max(part.dimsMm.x, part.dimsMm.y) * MM * 0.48;
  const g = new THREE.Group();
  const glass = stdMat({
    color: part.color || "#f8fbff",
    roughness: 0.16,
    metalness: 0.05,
    emissive: new THREE.Color(0x333333),
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.92,
  });
  glass.userData = { ledGlow: true };
  const dome = add(g, new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, r * 0.15, 0);
  dome.userData.ledGlow = true;
  add(g, new THREE.CylinderGeometry(r * 0.72, r * 0.88, r * 0.45, 14), mat, 0, -r * 0.15, 0);
  const lead = stdMat({ color: 0xb0b0b0, roughness: 0.3, metalness: 0.75 });
  add(g, new THREE.CylinderGeometry(0.00035, 0.00035, r * 1.1, 6), lead, r * 0.22, -r * 0.85, 0, true);
  add(g, new THREE.CylinderGeometry(0.00035, 0.00035, r * 0.85, 6), lead, -r * 0.22, -r * 0.75, 0, true);
  return g;
}

function makeLedStrip(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, d), mat);
  const pixels = Math.min(part.specs?.pixels || 12, 20);
  const glow = stdMat({
    color: 0xf4f4f4,
    roughness: 0.2,
    emissive: new THREE.Color(0x2a2a2a),
    emissiveIntensity: 0.2,
  });
  for (let i = 0; i < pixels; i += 1) {
    const px = -w / 2 + (i + 0.5) * (w / pixels);
    const bit = add(g, new THREE.BoxGeometry(d * 0.55, h * 0.7, d * 0.55), glow.clone(), px, h * 0.45, 0, true);
    bit.userData.ledGlow = true;
  }
  return g;
}

function makeButton(part, mat) {
  const w = part.dimsMm.x * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h * 0.45, w), mat, 0, -h * 0.15, 0);
  add(
    g,
    new THREE.CylinderGeometry(w * 0.28, w * 0.3, h * 0.4, 16),
    stdMat({ color: 0x3a3a3a, roughness: 0.45 }),
    0,
    h * 0.18,
    0,
    true,
  );
  return g;
}

function makeBreadboard(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  const board = stdMat({
    color: 0xf3f3ef,
    map: breadboardMap(),
    roughness: 0.72,
    metalness: 0.02,
  });
  add(g, new THREE.BoxGeometry(w, h * 0.7, d), board);
  add(g, new THREE.BoxGeometry(w, h * 0.12, 0.002), stdMat({ color: 0xb6402a }), 0, h * 0.42, d * 0.42, true);
  add(g, new THREE.BoxGeometry(w, h * 0.12, 0.002), stdMat({ color: 0x2a4f8a }), 0, h * 0.42, -d * 0.42, true);
  return g;
}

function makeResistor(part, mat) {
  const w = part.dimsMm.x * MM;
  const r = Math.max(part.dimsMm.y, part.dimsMm.z) * MM * 0.55;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, w * 0.7, 10), mat);
  g.children[0].rotation.z = Math.PI / 2;
  const lead = stdMat({ color: 0xb8b8b8, roughness: 0.28, metalness: 0.7 });
  add(g, new THREE.CylinderGeometry(r * 0.22, r * 0.22, w * 0.95, 6), lead).rotation.z = Math.PI / 2;
  const bands = [0x2a2a2a, 0xc45c26, 0xc4a024];
  bands.forEach((hex, i) => {
    add(
      g,
      new THREE.CylinderGeometry(r * 1.04, r * 1.04, w * 0.06, 10),
      stdMat({ color: hex, roughness: 0.5 }),
      -w * 0.16 + i * 0.004,
      0,
      0,
      true,
    ).rotation.z = Math.PI / 2;
  });
  return g;
}

function makeScrew(part, mat) {
  const r = Math.min(part.dimsMm.x, part.dimsMm.y) * MM * 0.28;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r * 0.82, h, 14), mat);
  add(g, new THREE.CylinderGeometry(r * 1.7, r * 1.55, Math.max(0.002, h * 0.28), 6), mat, 0, h * 0.42, 0);
  return g;
}

function makeDowel(part, mat) {
  const r = Math.min(part.dimsMm.x, part.dimsMm.y) * MM * 0.5;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, h, 16), mat);
  return g;
}

function makeCablePiece(part, mat) {
  const len = Math.max(part.dimsMm.x, part.dimsMm.y, part.dimsMm.z) * MM;
  const g = new THREE.Group();
  const cable = add(g, new THREE.CylinderGeometry(0.0018, 0.0018, Math.min(len, 0.16), 8), mat);
  cable.rotation.z = Math.PI / 2;
  return g;
}

function makeTape(part, mat) {
  const r = Math.max(part.dimsMm.x, part.dimsMm.y) * MM * 0.42;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.TorusGeometry(r, Math.min(h * 0.35, r * 0.35), 8, 20), mat);
  g.children[0].rotation.x = Math.PI / 2;
  return g;
}

function makeZip(part, mat) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(part.dimsMm.x * MM * 0.45, 0.0012, 0.003), mat);
  add(g, new THREE.BoxGeometry(0.006, 0.003, 0.0045), mat, -part.dimsMm.x * MM * 0.2, 0.001, 0);
  return g;
}

function makeAllen(part, mat) {
  const g = new THREE.Group();
  const long = part.dimsMm.x * MM;
  const short = part.dimsMm.y * MM;
  const r = part.dimsMm.z * MM * 0.5;
  add(g, new THREE.CylinderGeometry(r, r, long, 6), mat).rotation.z = Math.PI / 2;
  add(g, new THREE.CylinderGeometry(r, r, short, 6), mat, -long / 2, short / 2, 0);
  return g;
}

function makeDriver(part, mat) {
  const len = part.dimsMm.x * MM;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.012, 0.014, len * 0.42, 12), mat, -len * 0.18, 0, 0).rotation.z =
    Math.PI / 2;
  add(
    g,
    new THREE.CylinderGeometry(0.003, 0.003, len * 0.5, 8),
    stdMat({ color: 0xb0b0b0, roughness: 0.25, metalness: 0.75 }),
    len * 0.18,
    0,
    0,
    true,
  ).rotation.z = Math.PI / 2;
  return g;
}

function makeIron(part, mat) {
  const len = part.dimsMm.x * MM;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.011, 0.013, len * 0.45, 12), mat, -len * 0.16, 0, 0).rotation.z =
    Math.PI / 2;
  add(
    g,
    new THREE.CylinderGeometry(0.002, 0.006, len * 0.4, 8),
    stdMat({ color: 0x8a8a8a, roughness: 0.3, metalness: 0.7 }),
    len * 0.2,
    0,
    0,
    true,
  ).rotation.z = Math.PI / 2;
  return g;
}

function makeMeter(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, d), mat);
  add(
    g,
    new THREE.BoxGeometry(w * 0.62, h * 0.08, d * 0.38),
    stdMat({ color: 0x1a1a1a, roughness: 0.35 }),
    0,
    h * 0.52,
    d * 0.08,
    true,
  );
  return g;
}

function makeEnclosure(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h * 0.85, d), mat);
  add(g, new THREE.BoxGeometry(w * 0.92, h * 0.12, d * 0.92), mat.clone(), 0, h * 0.42, 0);
  return g;
}

function makeBox(part, mat) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(part.dimsMm.x * MM, part.dimsMm.z * MM, part.dimsMm.y * MM), mat);
  return g;
}

function bodyFor(shape, part, mat) {
  if (shape === "table") return makeTable(part, mat);
  if (shape === "slab") return makeSlab(part.dimsMm.x * MM, part.dimsMm.z * MM, part.dimsMm.y * MM, mat);
  if (shape === "post")
    return makePost(part.dimsMm.x * MM, part.dimsMm.z * MM, part.dimsMm.y * MM, mat, part.material === "steel");
  if (shape === "board") return makeBoard(part, mat);
  if (shape === "led") return makeLed(part, mat);
  if (shape === "led-strip") return makeLedStrip(part, mat);
  if (shape === "button") return makeButton(part, mat);
  if (shape === "breadboard") return makeBreadboard(part, mat);
  if (shape === "resistor") return makeResistor(part, mat);
  if (shape === "screw") return makeScrew(part, mat);
  if (shape === "dowel") return makeDowel(part, mat);
  if (shape === "cable") return makeCablePiece(part, mat);
  if (shape === "tape") return makeTape(part, mat);
  if (shape === "zip") return makeZip(part, mat);
  if (shape === "allen") return makeAllen(part, mat);
  if (shape === "driver") return makeDriver(part, mat);
  if (shape === "iron") return makeIron(part, mat);
  if (shape === "meter") return makeMeter(part, mat);
  if (shape === "enclosure") return makeEnclosure(part, mat);
  return makeBox(part, mat);
}

function hitsWalk(obj) {
  let cur = obj;
  while (cur && !cur.userData?.piece) cur = cur.parent;
  return cur;
}

function tintIfNeeded(root, piece) {
  if (!piece.color) return;
  root.traverse((child) => {
    if (child.material?.color && !child.userData.keepColor) child.material.color.set(piece.color);
  });
}

function isTableTop(part) {
  return inferShape(part) === "slab" || /top/.test(part.id);
}

function isTableLeg(part) {
  return inferShape(part) === "post" || /leg/.test(part.id);
}

export function createWorkshop(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 4, 14);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 40);
  camera.position.set(1.2, 0.9, 1.4);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(0, 0.2, 0);
  orbit.enableDamping = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(2, 3, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd0d0d0, 0.32);
  fill.position.set(-2, 1, -1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xf2f2f2, 0.18);
  rim.position.set(0.2, 1.4, -2.2);
  scene.add(rim);

  const floorMap = grayWoodMap({ planks: 12, seed: 2 });
  floorMap.repeat.set(3, 3);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x6a6a6a,
      map: floorMap,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(4, 20, 0xffffff, 0x6a6a6a);
  grid.position.y = 0.002;
  const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const mat of gridMats) {
    mat.transparent = true;
    mat.opacity = 0.28;
    mat.toneMapped = false;
  }
  scene.add(grid);

  const benchMap = grayWoodMap({ planks: 6, seed: 7 });
  benchMap.repeat.set(2, 1.2);
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.06, 1.0),
    new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      map: benchMap,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  bench.position.set(0, -0.03, 0);
  bench.receiveShadow = true;
  scene.add(bench);

  const group = new THREE.Group();
  scene.add(group);
  const cableGroup = new THREE.Group();
  scene.add(cableGroup);
  const fx = new THREE.Group();
  scene.add(fx);

  const transform = new TransformControls(camera, canvas);
  transform.addEventListener("dragging-changed", (e) => {
    orbit.enabled = !e.value;
  });
  scene.add(transform.getHelper());

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes = new Map();
  let selected = null;
  let simOn = false;
  let simOpts = {};
  let rain = [];
  let heatGlow = null;
  let forceArrow = null;
  let ledBlinkOn = false;
  let onSelect = () => {};

  // Blender-style viewport shading: solid and wire share one override material
  // each; "material" restores whatever the part builders assigned.
  let shading = "material";
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0xcfcfcf,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, wireframe: true, toneMapped: false });

  function applyShading() {
    for (const root of [group, cableGroup]) {
      root.traverse((child) => {
        if (!child.isMesh) return;
        if (!child.userData.baseMaterial) child.userData.baseMaterial = child.material;
        child.material =
          shading === "solid" ? solidMat : shading === "wire" ? wireMat : child.userData.baseMaterial;
      });
    }
  }

  function setShading(mode) {
    if (!["solid", "material", "wire"].includes(mode)) return;
    shading = mode;
    applyShading();
  }

  function frameSelected() {
    const target = selected || (group.children.length ? group : null);
    if (!target) return false;
    const box = new THREE.Box3().setFromObject(target);
    if (box.isEmpty()) return false;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.05);
    const dist = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.25;
    const dir = camera.position.clone().sub(orbit.target);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0.6, 1);
    dir.normalize();
    orbit.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, dist);
    orbit.update();
    return true;
  }

  function meshFor(piece, part) {
    const mat = materialFor(part, piece);
    const root = bodyFor(inferShape(part), part, mat);
    shadow(root);
    root.userData = { piece, part, ports: part.ports || [] };
    return root;
  }

  function poseMesh(mesh, piece, part) {
    mesh.position.set(piece.x, piece.y || (part.dimsMm.z * MM) / 2, piece.z);
    mesh.rotation.set(piece.rx || 0, piece.ry || 0, piece.rz || 0);
    mesh.scale.set(piece.sx || 1, piece.sy || 1, piece.sz || 1);
    tintIfNeeded(mesh, piece);
  }

  function groupTables(project, partsById) {
    const tops = [];
    const legs = [];
    for (const piece of project.pieces) {
      const part = partsById[piece.partId];
      const mesh = meshes.get(piece.id);
      if (!part || !mesh) continue;
      if (isTableTop(part)) tops.push({ piece, part, mesh });
      else if (isTableLeg(part)) legs.push({ piece, part, mesh });
    }
    for (const top of tops) {
      if (legs.length < 2) break;
      const tw = top.part.dimsMm.x * MM;
      const td = top.part.dimsMm.y * MM;
      const nearby = legs
        .filter((leg) => !leg.used)
        .map((leg) => ({
          ...leg,
          dist: Math.hypot(leg.mesh.position.x - top.mesh.position.x, leg.mesh.position.z - top.mesh.position.z),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4)
        .filter((leg) => leg.dist < Math.max(tw, td) * 1.35 + 0.35);
      if (nearby.length < 4) continue;
      const inset = Math.min(0.05, tw * 0.09);
      const slots = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      nearby.forEach((leg, i) => {
        leg.used = true;
        const src = legs.find((row) => row.piece.id === leg.piece.id);
        if (src) src.used = true;
        const [sx, sz] = slots[i] || slots[0];
        const world = new THREE.Vector3(
          top.mesh.position.x + sx * (tw / 2 - inset),
          top.mesh.position.y - (top.part.dimsMm.z * MM) / 2 - (leg.part.dimsMm.z * MM) / 2,
          top.mesh.position.z + sz * (td / 2 - inset),
        );
        if (world.y < (leg.part.dimsMm.z * MM) / 2) world.y = (leg.part.dimsMm.z * MM) / 2;
        group.remove(leg.mesh);
        top.mesh.add(leg.mesh);
        top.mesh.worldToLocal(world);
        leg.mesh.position.copy(world);
        leg.mesh.rotation.set(0, 0, 0);
      });
    }
  }

  function sync(project, partsById) {
    group.clear();
    meshes.clear();
    for (const piece of project.pieces) {
      const part = partsById[piece.partId];
      if (!part) continue;
      const mesh = meshFor(piece, part);
      poseMesh(mesh, piece, part);
      group.add(mesh);
      meshes.set(piece.id, mesh);
    }
    groupTables(project, partsById);
    cableGroup.clear();
    for (const cable of project.cables) {
      const a = meshes.get(cable.fromPiece);
      const b = meshes.get(cable.toPiece);
      if (!a || !b) continue;
      const aPos = new THREE.Vector3();
      const bPos = new THREE.Vector3();
      a.getWorldPosition(aPos);
      b.getWorldPosition(bPos);
      const curve = new THREE.CatmullRomCurve3([
        aPos.clone(),
        aPos.clone().lerp(bPos, 0.5).add(new THREE.Vector3(0, 0.06, 0)),
        bPos.clone(),
      ]);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, 0.002, 6, false),
        new THREE.MeshStandardMaterial({
          color: cable.locked ? 0x2f6f3a : 0xb6402a,
          roughness: 0.45,
          metalness: 0.05,
        }),
      );
      cableGroup.add(tube);
    }
    for (const tape of project.tapes || []) {
      const first = meshes.get(tape.pieceIds?.[0]);
      if (!first) continue;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.002, 0.018),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }),
      );
      const pos = new THREE.Vector3();
      first.getWorldPosition(pos);
      strip.position.copy(pos).add(new THREE.Vector3(0, 0.03, 0));
      group.add(strip);
    }
    applyShading();
  }

  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(group.children, true);
    if (!hits.length) return;
    const mesh = hitsWalk(hits[0].object);
    if (!mesh) return;
    selected = mesh;
    transform.attach(mesh);
    onSelect(mesh.userData);
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button === 0 && !transform.dragging) pick(ev);
  });

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", resize);
  resize();

  function setSim(on, opts = {}) {
    simOn = on;
    simOpts = opts;
    fx.clear();
    rain = [];
    heatGlow = null;
    forceArrow = null;
    group.position.set(0, 0, 0);
    if (!on) {
      ledBlinkOn = false;
      setLed(false);
      return;
    }
    if (opts.rain) {
      for (let i = 0; i < 80; i += 1) {
        const drop = new THREE.Mesh(
          new THREE.BoxGeometry(0.003, 0.03, 0.003),
          new THREE.MeshBasicMaterial({ color: 0x88aadd }),
        );
        drop.position.set((Math.random() - 0.5) * 1.4, 1 + Math.random(), (Math.random() - 0.5) * 1.2);
        fx.add(drop);
        rain.push(drop);
      }
    }
    if (opts.heat) {
      heatGlow = new THREE.PointLight(0xff5522, 1.4, 2);
      heatGlow.position.set(0.1, 0.4, 0.1);
      fx.add(heatGlow);
    }
    if (opts.force) {
      forceArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0.7, 0),
        0.4,
        0xffda1a,
      );
      fx.add(forceArrow);
    }
  }

  function setCamera({ az, el, zoom }) {
    const r = 1.8 / (zoom || 1);
    const a = THREE.MathUtils.degToRad(az ?? 42);
    const e = THREE.MathUtils.degToRad(el ?? 28);
    camera.position.set(Math.cos(a) * r, Math.sin(e) * r + 0.3, Math.sin(a) * r);
    orbit.update();
  }

  function explode(amount) {
    let i = 0;
    meshes.forEach((mesh) => {
      mesh.position.y += amount * (0.02 + (i % 4) * 0.03);
      i += 1;
    });
  }

  function setLed(on) {
    // Emission only draws in material shading — same rule as Blender's solid view.
    if (shading !== "material") return;
    meshes.forEach((mesh) => {
      if (mesh.userData.part?.firmwareRole !== "led") return;
      mesh.traverse((child) => {
        if (!child.material?.emissive) return;
        if (child.userData.keepColor && !child.userData.ledGlow) return;
        child.material.emissive = new THREE.Color(on ? 0xf5f5f5 : 0x2a2a2a);
        child.material.emissiveIntensity = on ? 2.1 : 0.18;
      });
    });
  }

  function tick() {
    orbit.update();
    if (simOn) {
      const t = performance.now() / 1000;
      for (const drop of rain) {
        drop.position.y -= 0.04;
        if (drop.position.y < 0) drop.position.y = 1.2;
      }
      if (simOpts.shake) {
        group.position.x = Math.sin(t * 26) * 0.003;
        group.position.z = Math.cos(t * 21) * 0.002;
      }
      if (heatGlow) heatGlow.intensity = 1.2 + Math.sin(t * 9) * 0.35 + Math.sin(t * 23) * 0.15;
      if (forceArrow) forceArrow.setLength(0.34 + Math.sin(t * 4) * 0.08);
      if (simOpts.ledHz) {
        const blink = Math.floor(t * simOpts.ledHz * 2) % 2 === 0;
        if (blink !== ledBlinkOn) {
          ledBlinkOn = blink;
          setLed(blink);
        }
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  return {
    sync,
    setSim,
    setCamera,
    setShading,
    getShading: () => shading,
    frameSelected,
    explode,
    setLed,
    resize,
    onSelect: (fn) => {
      onSelect = fn;
    },
    getSelected: () => selected?.userData || null,
    getSelectedPose: () => {
      if (!selected) return null;
      const pos = new THREE.Vector3();
      selected.getWorldPosition(pos);
      return {
        id: selected.userData.piece.id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        ry: selected.rotation.y,
      };
    },
    setMode: (mode) => {
      transform.setMode(mode);
    },
  };
}

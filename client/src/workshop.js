import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

/* --------------------------------------------------------- furniture grain
   Original printed-grain generator in the spirit of foil-on-particleboard
   flat-pack: long wavy streaks, faint cathedral arcs, and short birch
   flecks over a white base so the material color supplies the tint. The
   pattern is procedural and ours — inspired by the look, copied from
   nothing. Canvases are cached by recipe; textures stay per-material so
   each part can own its repeat. */

const grainCanvasCache = new Map();

function grainCanvas({ size = 512, contrast = 0.08, seed = 1, flecks = true, arcs = true } = {}) {
  const key = `${size}:${contrast}:${seed}:${flecks}:${arcs}`;
  const cached = grainCanvasCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  let s = (seed * 7919 + 104729) % 233280;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i += 1) {
    const x = rand() * size;
    const drift = (rand() - 0.5) * size * 0.14;
    ctx.strokeStyle = `rgba(112, 88, 56, ${(contrast * (0.3 + rand() * 0.7)).toFixed(4)})`;
    ctx.lineWidth = 0.6 + rand() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.bezierCurveTo(x + drift * 0.4, size * 0.33, x - drift * 0.6, size * 0.66, x + drift, size + 8);
    ctx.stroke();
  }
  if (arcs) {
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = `rgba(104, 82, 52, ${(contrast * 0.5).toFixed(4)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 8 + rand() * 22, 60 + rand() * 160, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (flecks) {
    for (let i = 0; i < 130; i += 1) {
      ctx.fillStyle = `rgba(96, 74, 46, ${(contrast * (0.35 + rand() * 0.65)).toFixed(4)})`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.4, 2 + rand() * 7);
    }
  }
  grainCanvasCache.set(key, canvas);
  return canvas;
}

function grainTexture(recipe, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(grainCanvas(recipe));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// Grain scale reads physical: one canvas tile spans roughly 280 mm.
function grainRepeat(mm) {
  return THREE.MathUtils.clamp((Number(mm) || 280) / 280, 1, 4);
}

function seedFrom(part) {
  let n = 3;
  for (const ch of String(part?.id || "x")) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return n + 1;
}

/* Shared hardware finishes. Every mesh that uses these is flagged keepColor,
   so piece tints never touch the shared instances. */
const zincMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.34, metalness: 0.82 });
const glideMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.88, metalness: 0.02 });
const insertRingMat = new THREE.MeshStandardMaterial({ color: 0x8f9499, roughness: 0.38, metalness: 0.72 });
const insertHoleMat = new THREE.MeshStandardMaterial({ color: 0x241d14, roughness: 0.92, metalness: 0 });
const footPlasticMat = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.8, metalness: 0.04 });

// Baked radial falloff for contact shadows: one tiny canvas, sampled by a
// transparent unlit plane. Cheaper and steadier than a shadow map on the
// floor, which flickered (see the floor comment in createWorkshop).
function contactShadowMap(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, size * 0.04, half, half, half);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.42)");
  grad.addColorStop(0.55, "rgba(0, 0, 0, 0.17)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Foil sheen: a hash-noise jitter on roughness, injected into the foil
// laminate shader. A few ALU ops per fragment, no extra textures, and the
// constant cache key means every foil part shares one compiled program.
function addFoilGrain(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      #ifdef USE_MAP
      float ikeaGrain = fract(sin(dot(vMapUv * 96.0, vec2(12.9898, 78.233))) * 43758.5453);
      roughnessFactor = clamp(roughnessFactor + (ikeaGrain - 0.5) * 0.08, 0.05, 1.0);
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => "ikealive-foil-grain";
  return mat;
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

/* --------------------------------------------------------------- Lab KiCad
   The bench doubles as a small EDA while electronics are on it: every port is
   a clickable gold pad, locked wires are routed tubes colored by net class,
   loose wires draw as a dashed ratsnest, and each net carries a name sprite.
   All of it hangs off the netlist the server derives in lib/cables.js. */

const NET_CLASS_COLORS = { ground: 0x30343a, power: 0xc0392b, data: 0x2a6fb8 };
const SIGNAL_PALETTE = [0x2f6f3a, 0x7a4fa0, 0xb8860b, 0x1f7a8c, 0xa0522d];

function netColor(net) {
  if (!net) return 0xb6402a;
  if (NET_CLASS_COLORS[net.class]) return NET_CLASS_COLORS[net.class];
  let hash = 0;
  for (const ch of net.name || "") hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return SIGNAL_PALETTE[hash % SIGNAL_PALETTE.length];
}

function kindColor(kind) {
  if (/usb/.test(kind || "")) return 0x9a9a9a;
  if (kind === "jst-3") return 0xf4f4f4;
  if (kind === "lead") return 0xc9c9c9;
  if (kind === "barrel-5.5") return 0x2a2a2a;
  return 0xd4af37; // 2.54 mm header gold
}

function textSprite(text, { fontPx = 46, pad = 20, fg = "#1a1a1a", bg = "rgba(250, 250, 248, 0.92)", heightM = 0.016 } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `500 ${fontPx}px "IBM Plex Mono", monospace`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h * 0.3);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(heightM * (w / h), heightM, 1);
  sprite.renderOrder = 5;
  sprite.userData.keepColor = true;
  return sprite;
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

/* Foil laminate: printed grain under a thin melamine sheen. White foil keeps
   the grain to a whisper; birch foil shows streaks and flecks. */
function foilMaterial(part, hex, kind) {
  const color = new THREE.Color(hex);
  if (kind === "white") color.lerp(new THREE.Color(0xffffff), 0.55);
  else color.lerp(new THREE.Color(0xfaf4e6), 0.2);
  const map = grainTexture(
    { contrast: kind === "white" ? 0.035 : 0.085, seed: seedFrom(part), flecks: kind !== "white" },
    grainRepeat(part.dimsMm?.x),
    grainRepeat(part.dimsMm?.y),
  );
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    map,
    roughness: 0.55,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.55,
  });
  // Reuse the printed grain as a faint bump so streaks catch the key light —
  // one extra sample of a texture already on the GPU — and jitter roughness.
  mat.bumpMap = map;
  mat.bumpScale = kind === "white" ? 0.12 : 0.3;
  return addFoilGrain(mat);
}

function openWoodMaterial(part, hex) {
  const map = grainTexture(
    { contrast: 0.17, seed: seedFrom(part), flecks: true, arcs: true },
    grainRepeat(part.dimsMm?.x),
    grainRepeat(part.dimsMm?.y),
  );
  return stdMat({ color: new THREE.Color(hex), map, roughness: 0.74, metalness: 0 });
}

function materialFor(part, piece) {
  // Piece values win: the Materials panel retints and refinishes per piece,
  // and the server copies part defaults onto every new piece anyway.
  const hex = piece.color || part.color || PALE;
  const texture = piece.texture || part.texture;
  if (texture === "birch-foil") return foilMaterial(part, hex, "birch");
  if (texture === "white-foil") return foilMaterial(part, hex, "white");
  if (texture === "oak-open") return openWoodMaterial(part, hex);
  if (texture === "powder-coat")
    return stdMat({ color: new THREE.Color(hex), roughness: 0.42, metalness: 0.35 });
  const color = new THREE.Color(hex);
  const metal = texture === "metal" || part.material === "steel";
  const pcb = /^pcb-/.test(texture || "");
  const mat = stdMat({
    color,
    roughness: metal ? 0.28 : pcb ? 0.42 : texture === "gloss" ? 0.18 : 0.66,
    metalness: metal ? 0.72 : pcb ? 0.12 : 0.05,
    emissive: part.firmwareRole === "led" ? new THREE.Color(0x2a2a2a) : 0x000000,
  });
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

/* ------------------------------------------------------ Tabletop profiles
   Tops and legs are swept from a real board profile instead of a box: a
   rounded-rectangle plan (LINNMON's soft ~18 mm corners, LACK's tight ~5 mm,
   raw lumber nearly crisp) extruded through an eased edge bevel. The extrude
   splits caps from side walls, so the printed foil face and the edge band
   are two materials on one seamless board — no laminated-on skins, no
   ledges, nothing overhanging the corner radius. */

function roundedRectShape(w, d, r) {
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.max(0.0004, Math.min(r, hw * 0.45, hd * 0.45));
  const s = new THREE.Shape();
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd);
  s.absarc(hw - rr, -hd + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - rr);
  s.absarc(hw - rr, hd - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-hw + rr, hd);
  s.absarc(-hw + rr, hd - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + rr);
  s.absarc(-hw + rr, -hd + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Board body: plan corners and edge ease are independent, like a real top. */
function slabGeometry(w, h, d, cornerR) {
  const ease = Math.max(0.001, Math.min(0.0026, h * 0.24, w * 0.02, d * 0.02));
  const core = Math.max(h - ease * 2, h * 0.5);
  const geo = new THREE.ExtrudeGeometry(
    roundedRectShape(w - ease * 2, d - ease * 2, Math.max(cornerR - ease, 0.0006)),
    {
      depth: core,
      bevelEnabled: true,
      bevelThickness: ease,
      bevelSize: ease,
      bevelSegments: 3,
      curveSegments: 12,
    },
  );
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -core / 2, 0);
  return geo;
}

/* Extrude UVs land in shape-space metres, so foil maps swap the 0..1 box
   mapping for a physical scale — one grain tile ≈ 280 mm — and each part
   can shift its grain so four legs never repeat the same streaks. The map
   is cloned per part; the bump map rides the same clone. */
const GRAIN_TILES_PER_M = 1 / 0.28;

function perMeterFoil(mat, shift = 0) {
  if (!mat.map) return mat;
  const tex = mat.map.clone();
  tex.repeat.set(GRAIN_TILES_PER_M, GRAIN_TILES_PER_M);
  tex.offset.set((shift * 0.37) % 1, (shift * 0.19) % 1);
  tex.needsUpdate = true;
  if (mat.bumpMap === mat.map) mat.bumpMap = tex;
  mat.map = tex;
  return mat;
}

/* Edge band: the same foil a step darker and flatter, grain turned to run
   along the edge instead of through the thickness — the strip IKEA irons
   over every board edge. Carries its shading ratio for piece tints. */
function bandMaterial(mat) {
  const band = mat.clone();
  band.color = mat.color.clone().multiplyScalar(0.93);
  band.roughness = Math.min(1, (mat.roughness ?? 0.6) + 0.08);
  if (band.clearcoat !== undefined) band.clearcoat = (band.clearcoat ?? 0) * 0.6;
  if (mat.map) {
    const bandMap = mat.map.clone();
    bandMap.center.set(0.5, 0.5);
    bandMap.rotation = Math.PI / 2;
    bandMap.needsUpdate = true;
    band.map = bandMap;
    if (band.bumpMap) band.bumpMap = bandMap;
  }
  band.userData.tintMul = 0.93;
  return band;
}

let stickerTexCache = null;
function stickerTexture() {
  if (stickerTexCache) return stickerTexCache;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, 192, 120);
  ctx.fillStyle = "#20242a";
  ctx.font = "700 30px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("IKEALIVE", 12, 36);
  ctx.font = "400 13px 'IBM Plex Mono', monospace";
  ctx.fillText("FLAT PACK · KEEP DRY", 12, 58);
  let x = 12;
  for (let i = 0; i < 30; i += 1) {
    const bw = 1 + ((i * 7) % 4);
    if (i % 2 === 0) ctx.fillRect(x, 72, bw, 34);
    x += bw + 2;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  stickerTexCache = tex;
  return tex;
}

/* Flat-pack tabletop: one profile-swept board. The caps take the printed
   foil face, the walls take the edge band, zinc screw-insert sockets sit on
   the underside, and the article sticker every flat pack ships with rides
   near one corner. Raw lumber (opts.lumber) skips the flat-pack dressing
   and keeps near-crisp corners. */
function makeSlab(w, h, d, mat, opts = {}) {
  const g = new THREE.Group();
  const lumber = Boolean(opts.lumber);
  const cornerR = opts.cornerR ?? (lumber ? 0.0018 : w >= 0.8 ? 0.018 : 0.005);
  if (lumber) {
    add(g, slabGeometry(w, h, d, cornerR), mat);
    return g;
  }
  const lift = 0.0004;
  perMeterFoil(mat, opts.grainShift || 0);
  add(g, slabGeometry(w, h, d, cornerR), [mat, bandMaterial(mat)]);
  for (const [ix, iz] of opts.inserts || []) {
    add(g, new THREE.CylinderGeometry(0.0055, 0.0055, 0.0014, 18), insertRingMat, ix, -h / 2 - lift, iz, true);
    add(g, new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 12), insertHoleMat, ix, -h / 2 - lift - 0.0003, iz, true);
  }
  if (w >= 0.35 && d >= 0.25) {
    const sticker = add(
      g,
      new THREE.PlaneGeometry(0.046, 0.029),
      new THREE.MeshStandardMaterial({ map: stickerTexture(), color: 0xffffff, roughness: 0.85, metalness: 0 }),
      w * 0.22,
      -h / 2 - lift - 0.0002,
      d * 0.18,
      true,
    );
    sticker.rotation.x = Math.PI / 2;
  }
  return g;
}

/* Chunky flat-pack leg: the same board profile stood on end — vertical
   edges eased a couple of millimetres and plan corners matched to the
   tabletop, so a flush joint reads as one continuous wrapped surface. The
   side walls carry foil grain running the length, the caps read as wrapped
   end grain, a round plastic glide sits under the foot, and the
   double-ended screw stud waits on top (skipped when the leg ships
   pre-assembled under a table). */
function makeWoodLeg(w, h, d, mat, opts = {}) {
  const g = new THREE.Group();
  const padH = Math.max(0.002, Math.min(0.004, h * 0.02));
  const cornerR = opts.cornerR ?? Math.min(0.003, Math.min(w, d) * 0.09);
  perMeterFoil(mat, opts.grainShift || 0);
  const cap = mat.clone();
  cap.color = mat.color.clone().multiplyScalar(0.9);
  cap.roughness = Math.min(1, (mat.roughness ?? 0.6) + 0.1);
  cap.userData.tintMul = 0.9;
  add(g, slabGeometry(w, h - padH, d, cornerR), [cap, mat], 0, padH / 2, 0);
  add(
    g,
    new THREE.CylinderGeometry(Math.min(w, d) * 0.3, Math.min(w, d) * 0.34, padH, 18),
    glideMat,
    0,
    -h / 2 + padH / 2,
    0,
    true,
  );
  if (opts.stud !== false) add(g, new THREE.CylinderGeometry(0.0032, 0.0032, 0.016, 12), zincMat, 0, h / 2 + 0.005, 0, true);
  return g;
}

/* Round steel leg: powder-coated tube on a rounded-square zinc mounting
   plate (~58 mm, four corner screws and a centre weld boss), with a plastic
   foot cup and an adjustable glide at the floor. */
function makeSteelLeg(w, h, d, mat) {
  const g = new THREE.Group();
  const r = Math.max(w, d) / 2;
  const footH = Math.max(0.008, Math.min(0.02, h * 0.03));
  const plateT = 0.004;
  const tubeH = h - footH - plateT;
  add(g, new THREE.CylinderGeometry(r * 0.92, r * 0.92, tubeH, 24), mat, 0, (footH - plateT) / 2, 0);
  add(g, new THREE.CylinderGeometry(r * 0.96, r * 0.92, 0.008, 24), mat.clone(), 0, h / 2 - plateT - 0.004, 0);
  const plateW = Math.min(0.058, r * 3);
  add(g, slabGeometry(plateW, plateT, plateW, 0.006), zincMat, 0, h / 2 - plateT / 2, 0, true);
  add(g, new THREE.CylinderGeometry(r * 0.5, r * 0.5, plateT * 0.5, 16), zincMat, 0, h / 2 + plateT * 0.2, 0, true);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    add(
      g,
      new THREE.CylinderGeometry(0.0028, 0.0032, 0.0018, 10),
      zincMat,
      sx * plateW * 0.34,
      h / 2 + 0.0006,
      sz * plateW * 0.34,
      true,
    );
  }
  add(
    g,
    new THREE.CylinderGeometry(r * 1.02, r * 1.1, footH - 0.002, 24),
    footPlasticMat,
    0,
    -h / 2 + footH / 2 + 0.001,
    0,
    true,
  );
  add(g, new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.002, 24), glideMat, 0, -h / 2 + 0.001, 0, true);
  return g;
}

function makePost(w, h, d, mat, steel = false) {
  return steel ? makeSteelLeg(w, h, d, mat) : makeWoodLeg(w, h, d, mat);
}

// The LACK signature: outer leg faces sit dead flush with the top's edge
// band — zero reveal. Clamped so undersized tops still keep legs inboard.
function legCenterInset(topW, legW) {
  return Math.min(legW / 2, topW * 0.2);
}

function insertsFromPorts(part) {
  return (part.ports || [])
    .filter((port) => /insert/.test(port.kind || "") && Array.isArray(port.xyz))
    .map((port) => [port.xyz[0] * MM, port.xyz[1] * MM]);
}

/* The assembled side table, LACK proportions: a chunky ~50 mm top over four
   square legs screwed dead flush into the corners. Corner radii match
   between top and legs so each corner reads as one continuous wrapped
   surface, and every leg shifts its grain so the foil never repeats. */
function makeTable(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const topH = THREE.MathUtils.clamp(h * 0.11, 0.026, 0.05);
  const legW = Math.min(0.05, w * 0.09, d * 0.09);
  const legH = h - topH;
  const cornerR = Math.min(0.005, legW * 0.11);
  const inset = legCenterInset(Math.min(w, d), legW);
  const g = new THREE.Group();
  const slots = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz]) => [sx * (w / 2 - inset), sz * (d / 2 - inset)]);
  // The top carries its insert sockets right where the legs screw in.
  const top = makeSlab(w, topH, d, mat, { inserts: slots, cornerR });
  top.position.y = h / 2 - topH / 2;
  g.add(top);
  slots.forEach(([x, z], i) => {
    const leg = makeWoodLeg(legW, legH, legW, addFoilGrain(mat.clone()), {
      cornerR,
      stud: false,
      grainShift: i + 1,
    });
    leg.position.set(x, -h / 2 + legH / 2, z);
    g.add(leg);
  });
  return g;
}

function makeBoard(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  // PCB substrate
  add(g, new THREE.BoxGeometry(w, h * 0.3, d), mat, 0, -h * 0.2, 0);
  // MCU package with a pin-1 dot
  add(
    g,
    new THREE.BoxGeometry(w * 0.26, h * 0.26, d * 0.36),
    stdMat({ color: 0x141414, roughness: 0.38, metalness: 0.1 }),
    w * 0.07,
    h * 0.04,
    0,
    true,
  );
  add(
    g,
    new THREE.CylinderGeometry(w * 0.012, w * 0.012, h * 0.06, 8),
    stdMat({ color: 0xdddddd, roughness: 0.4 }),
    w * 0.07 - w * 0.09,
    h * 0.19,
    -d * 0.12,
    true,
  );
  // USB shield
  add(
    g,
    new THREE.BoxGeometry(w * 0.16, h * 0.36, d * 0.38),
    stdMat({ color: 0x9a9a9a, roughness: 0.24, metalness: 0.7 }),
    -w * 0.43,
    h * 0.04,
    0,
    true,
  );
  // Crystal can
  const crystal = add(
    g,
    new THREE.CylinderGeometry(d * 0.08, d * 0.08, w * 0.1, 10),
    stdMat({ color: 0xc7c7c7, roughness: 0.25, metalness: 0.8 }),
    -w * 0.16,
    h * 0.06,
    d * 0.2,
    true,
  );
  crystal.rotation.z = Math.PI / 2;
  // Power LED
  const pwr = add(
    g,
    new THREE.BoxGeometry(w * 0.03, h * 0.1, w * 0.03),
    stdMat({ color: 0x77cc77, roughness: 0.3, emissive: new THREE.Color(0x2a5a2a), emissiveIntensity: 0.7 }),
    w * 0.3,
    h * 0.05,
    -d * 0.22,
    true,
  );
  pwr.userData.keepColor = true;
  // Header strips: black plastic with gold pins along both long edges
  const plastic = stdMat({ color: 0x1c1c1c, roughness: 0.55 });
  const pin = stdMat({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 });
  for (const side of [1, -1]) {
    add(g, new THREE.BoxGeometry(w * 0.82, h * 0.24, d * 0.13), plastic.clone(), 0, h * 0.02, side * d * 0.4, true);
    for (let i = 0; i < 12; i += 1) {
      const px = -w * 0.38 + (i * w * 0.76) / 11;
      add(g, new THREE.CylinderGeometry(0.0004, 0.0004, h * 0.62, 6), pin, px, h * 0.3, side * d * 0.4, true);
    }
  }
  // ICSP 2×3 at the far end
  for (let i = 0; i < 6; i += 1) {
    add(
      g,
      new THREE.CylinderGeometry(0.0004, 0.0004, h * 0.5, 6),
      pin,
      w * 0.38 + (i % 3) * 0.0022 - 0.0022,
      h * 0.24,
      (i < 3 ? -1 : 1) * 0.0011,
      true,
    );
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
  // Flange with the flat cathode side, like the real package
  add(g, new THREE.CylinderGeometry(r * 1.08, r * 1.08, r * 0.14, 14), mat.clone(), 0, -r * 0.34, 0);
  const lead = stdMat({ color: 0xb0b0b0, roughness: 0.3, metalness: 0.75 });
  // Anode lead is the long one
  add(g, new THREE.CylinderGeometry(0.00035, 0.00035, r * 1.3, 6), lead, r * 0.22, -r * 0.95, 0, true);
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
  add(g, new THREE.BoxGeometry(w, h * 0.5, w), mat, 0, -h * 0.12, 0);
  // Stainless top plate and the round plunger
  add(
    g,
    new THREE.BoxGeometry(w * 0.92, h * 0.1, w * 0.92),
    stdMat({ color: 0xc9c9c9, roughness: 0.3, metalness: 0.7 }),
    0,
    h * 0.16,
    0,
    true,
  );
  add(
    g,
    new THREE.CylinderGeometry(w * 0.26, w * 0.28, h * 0.38, 14),
    stdMat({ color: 0x3a3a3a, roughness: 0.45 }),
    0,
    h * 0.32,
    0,
    true,
  );
  // Four gull-wing legs
  const leg = stdMat({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.75 });
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    add(g, new THREE.CylinderGeometry(w * 0.045, w * 0.045, h * 0.5, 6), leg, sx * w * 0.44, -h * 0.42, sz * w * 0.3, true);
  }
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
  // Centre channel where DIP packages straddle
  add(g, new THREE.BoxGeometry(w, h * 0.08, d * 0.07), stdMat({ color: 0xd8d8d2, roughness: 0.85 }), 0, h * 0.36, 0, true);
  // Power rails with their painted stripes
  add(g, new THREE.BoxGeometry(w, h * 0.12, 0.002), stdMat({ color: 0xb6402a }), 0, h * 0.42, d * 0.42, true);
  add(g, new THREE.BoxGeometry(w, h * 0.12, 0.002), stdMat({ color: 0x2a4f8a }), 0, h * 0.42, -d * 0.42, true);
  // Steel clips peeking out of the end rows
  const clip = stdMat({ color: 0xb0b0b0, roughness: 0.3, metalness: 0.7 });
  for (const side of [1, -1]) {
    add(g, new THREE.BoxGeometry(0.0016, h * 0.2, d * 0.6), clip, side * w * 0.47, h * 0.28, 0, true);
  }
  return g;
}

function makeResistor(part, mat) {
  const w = part.dimsMm.x * MM;
  const r = Math.max(part.dimsMm.y, part.dimsMm.z) * MM * 0.55;
  const g = new THREE.Group();
  // Capsule body: cylinder with rounded ends
  add(g, new THREE.CylinderGeometry(r, r, w * 0.66, 12), mat).rotation.z = Math.PI / 2;
  for (const side of [1, -1]) {
    add(g, new THREE.SphereGeometry(r, 10, 8), mat.clone(), side * w * 0.33, 0, 0);
  }
  const lead = stdMat({ color: 0xb8b8b8, roughness: 0.28, metalness: 0.7 });
  add(g, new THREE.CylinderGeometry(r * 0.18, r * 0.18, w * 1.3, 6), lead, 0, 0, 0, true).rotation.z = Math.PI / 2;
  for (const side of [1, -1]) {
    add(g, new THREE.CylinderGeometry(r * 0.18, r * 0.18, r * 2.2, 6), lead, side * w * 0.65, -r * 0.9, 0, true);
  }
  // 220 Ω color code: red, red, brown, gold tolerance
  const bands = [
    [0xc0392b, -w * 0.2],
    [0xc0392b, -w * 0.09],
    [0x6b3a2a, w * 0.02],
    [0xd4af37, w * 0.2],
  ];
  for (const [hex, x] of bands) {
    add(
      g,
      new THREE.CylinderGeometry(r * 1.06, r * 1.06, w * 0.05, 12),
      stdMat({ color: hex, roughness: 0.45 }),
      x,
      0,
      0,
      true,
    ).rotation.z = Math.PI / 2;
  }
  return g;
}

function makeScrew(part, mat) {
  const r = Math.min(part.dimsMm.x, part.dimsMm.y) * MM * 0.28;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, h * 0.92, 16), mat, 0, h * 0.04, 0);
  add(g, new THREE.CylinderGeometry(r * 0.98, r * 0.55, h * 0.08, 16), mat, 0, -h * 0.46, 0);
  for (let i = 0; i < 5; i += 1) {
    const ring = add(g, new THREE.TorusGeometry(r * 1.02, r * 0.09, 6, 18), mat, 0, -h * 0.34 + i * h * 0.16, 0);
    ring.rotation.x = Math.PI / 2;
  }
  add(g, new THREE.CylinderGeometry(r * 1.8, r * 1.8, h * 0.2, 20), mat, 0, h * 0.6, 0);
  add(g, new THREE.CylinderGeometry(r * 0.85, r * 0.85, h * 0.06, 6), insertHoleMat, 0, h * 0.7, 0, true);
  return g;
}

function makeDowel(part, mat) {
  const r = Math.min(part.dimsMm.x, part.dimsMm.y) * MM * 0.5;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  const cham = Math.min(r * 0.4, h * 0.05);
  add(g, new THREE.CylinderGeometry(r, r, h - cham * 2, 20), mat);
  add(g, new THREE.CylinderGeometry(r * 0.72, r, cham, 20), mat, 0, h / 2 - cham / 2, 0);
  add(g, new THREE.CylinderGeometry(r, r * 0.72, cham, 20), mat, 0, -h / 2 + cham / 2, 0);
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

function makeBracket(part, mat) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, Math.max(w, d * 0.12)), mat, 0, 0, -d * 0.44);
  add(g, new THREE.BoxGeometry(w, Math.max(w, h * 0.12), d), mat, 0, -h * 0.44, 0);
  const brace = add(g, new THREE.BoxGeometry(w * 0.72, Math.hypot(d, h) * 0.72, w), mat.clone());
  brace.rotation.x = -Math.atan2(d, h);
  return g;
}

function bodyFor(shape, part, mat) {
  if (shape === "table") return makeTable(part, mat);
  if (shape === "slab")
    return makeSlab(part.dimsMm.x * MM, part.dimsMm.z * MM, part.dimsMm.y * MM, mat, {
      inserts: insertsFromPorts(part),
      lumber: part.texture === "oak-open",
    });
  if (shape === "post")
    return makePost(part.dimsMm.x * MM, part.dimsMm.z * MM, part.dimsMm.y * MM, mat, part.material === "steel");
  if (shape === "bracket") return makeBracket(part, mat);
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
    if (child.userData.keepColor) return;
    const mats = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const mat of mats) {
      if (!mat.color || mat.userData?.keepColor) continue;
      mat.color.set(piece.color);
      // Edge bands and end-grain caps keep their relative shading under a tint.
      const mul = mat.userData?.tintMul ?? child.userData.tintMul;
      if (mul) mat.color.multiplyScalar(mul);
    }
  });
}

function isTableTop(part) {
  return inferShape(part) === "slab" || /top/.test(part.id);
}

function isTableLeg(part) {
  return inferShape(part) === "post" || /leg/.test(part.id);
}

/* ------------------------------------------------------------------ Lab CAD
   Fusion-lite bodies cooked on the bench. A sketch-extrude becomes a real
   piece through the ordinary project API: catalog stock (an off-cut slab or a
   dowel) scaled through the pose, tagged with texture "lab-box"/"lab-cyl" so
   sync() knows to render it as a clean primitive. No server changes needed. */

const LAB_GRAY = "#d9d9d9";
const LAB_STOCK = {
  box: { partId: "pine-offcut", dims: { x: 550, y: 550, z: 18 } },
  cyl: { partId: "dowel-18", dims: { x: 18, y: 18, z: 400 } },
};

function labKindOf(piece) {
  const hit = /^lab-(box|cyl)$/.exec(piece?.texture || "");
  return hit ? hit[1] : null;
}

function makeLabSolid(kind, part, piece) {
  const w = part.dimsMm.x * MM;
  const d = part.dimsMm.y * MM;
  const h = part.dimsMm.z * MM;
  const mat = stdMat({ color: new THREE.Color(piece.color || LAB_GRAY), roughness: 0.58 });
  const g = new THREE.Group();
  const geo = kind === "cyl" ? new THREE.CylinderGeometry(w / 2, w / 2, h, 40) : new THREE.BoxGeometry(w, h, d);
  add(g, geo, mat);
  return g;
}

function escText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

const asMm = (meters) => Math.max(1, Math.round(meters * 1000));
const round4 = (v) => Math.round(v * 10000) / 10000;

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
  // One ground only. A GridHelper on y = 0 sat on the same plane as this
  // disk and the bench top — do not add one back. Sink the mesh, offset
  // its depth, and never receiveShadow: shadow maps on a huge coplanar
  // ground flicker even after the helper is gone.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x6a6a6a,
      map: floorMap,
      roughness: 0.86,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 8,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.12;
  floor.renderOrder = -1;
  floor.receiveShadow = false;
  floor.castShadow = false;
  floor.userData.baseMaterial = floor.material;
  scene.add(floor);

  // Soft contact shadow grounding the bench on the floor. The floor never
  // receiveShadows (see above), so this baked blob is the AO feel instead:
  // unlit, depthWrite off, and drawn after the floor via renderOrder — three
  // reasons it cannot z-fight the plane 2 mm below it.
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 2.0),
    new THREE.MeshBasicMaterial({
      map: contactShadowMap(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = floor.position.y + 0.002;
  contactShadow.renderOrder = 0;
  contactShadow.castShadow = false;
  contactShadow.receiveShadow = false;
  scene.add(contactShadow);

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
  bench.userData.baseMaterial = bench.material;
  scene.add(bench);

  const group = new THREE.Group();
  scene.add(group);
  const cableGroup = new THREE.Group();
  scene.add(cableGroup);
  const fx = new THREE.Group();
  scene.add(fx);
  const gltfLoader = new GLTFLoader();
  let instructionRoot = null;
  let instructionUrl = null;

  const transform = new TransformControls(camera, canvas);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes = new Map();
  // Photo scans are intentionally client-only. Their compact triangle buffers
  // survive project syncs in this map and render as ordinary selectable bodies.
  const reconstructed = new Map();
  let selected = null;
  let boxHelper = null;
  let snapOn = true;
  let editMode = "translate";
  let simOn = false;
  let simOpts = {};
  let rain = [];
  let heatGlow = null;
  let forceArrow = null;
  let ledBlinkOn = false;
  let onSelect = () => {};
  let onPoseCommit = () => {};
  let onPortClick = () => {};

  // ---- KiCad bench state ---------------------------------------------------
  let edaOn = false;
  let pendingPortKey = null;
  let highlight = { net: null, members: [] };
  const portMarkers = new Map(); // "pieceId::portId" -> pad mesh
  const cableObjects = []; // { obj, label, net, cableId, baseOpacity }

  function addEdaDecor(root, piece, part) {
    if (!(part.category === "electronics" || part.category === "cable")) return;
    const maxDim = Math.max(part.dimsMm.x, part.dimsMm.y, part.dimsMm.z) * MM;
    const padR = THREE.MathUtils.clamp(maxDim * 0.03, 0.0012, 0.0024);
    for (const port of part.ports || []) {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(padR, padR, padR * 1.2, 10),
        stdMat({ color: kindColor(port.kind), roughness: 0.3, metalness: 0.75 }),
      );
      marker.position.set(port.xyz[0] * MM, port.xyz[2] * MM, port.xyz[1] * MM);
      marker.userData = {
        keepColor: true,
        portRef: { pieceId: piece.id, portId: port.id, kind: port.kind },
      };
      marker.visible = edaOn;
      root.add(marker);
      portMarkers.set(`${piece.id}::${port.id}`, marker);
    }
    const tag = [piece.ref, piece.functionLabel].filter(Boolean).join(" · ");
    if (tag) {
      const sprite = textSprite(tag);
      sprite.position.set(0, part.dimsMm.z * MM * 0.5 + 0.016, 0);
      sprite.visible = edaOn;
      sprite.userData.edaTag = true;
      root.add(sprite);
    }
  }

  function portWorld(mesh, portId) {
    const part = mesh?.userData?.part;
    const port = (part?.ports || []).find((p) => p.id === portId);
    if (!port) return null;
    mesh.updateWorldMatrix(true, false);
    return mesh.localToWorld(new THREE.Vector3(port.xyz[0] * MM, port.xyz[2] * MM, port.xyz[1] * MM));
  }

  function worldCenter(mesh) {
    const v = new THREE.Vector3();
    mesh.getWorldPosition(v);
    return v;
  }

  function liveMaterial(obj) {
    return obj.userData?.baseMaterial || obj.material;
  }

  function applyHighlightGlow() {
    const active = highlight.net;
    for (const row of cableObjects) {
      const on = !active || row.net === active;
      const mat = liveMaterial(row.obj);
      mat.transparent = true;
      mat.opacity = on ? row.baseOpacity : 0.12;
      if (mat.emissive !== undefined) {
        mat.emissive = new THREE.Color(active && on ? 0xffda1a : 0x000000);
        mat.emissiveIntensity = active && on ? 0.55 : 0;
      }
      if (row.label) row.label.material.opacity = on ? 1 : 0.12;
    }
    const members = new Set(highlight.members || []);
    for (const [key, marker] of portMarkers) {
      const mat = liveMaterial(marker);
      if (!mat.emissive) continue;
      const lit = members.has(key);
      mat.emissive = new THREE.Color(lit ? 0xffda1a : 0x000000);
      mat.emissiveIntensity = lit ? 0.9 : 0;
      marker.scale.setScalar(lit ? 1.5 : 1);
    }
  }

  function applyPendingGlow() {
    if (!pendingPortKey) return;
    const marker = portMarkers.get(pendingPortKey);
    if (!marker) return;
    const mat = liveMaterial(marker);
    if (mat.emissive) {
      mat.emissive = new THREE.Color(0xffda1a);
      mat.emissiveIntensity = 1.4;
    }
    marker.scale.setScalar(1.7);
  }

  function setEda(on) {
    edaOn = Boolean(on);
    for (const marker of portMarkers.values()) marker.visible = edaOn;
    group.traverse((child) => {
      if (child.userData?.edaTag) child.visible = edaOn;
    });
    cableGroup.traverse((child) => {
      if (child.isSprite) child.visible = edaOn;
    });
  }

  function highlightNet(name, members = []) {
    highlight = { net: name || null, members: name ? members : [] };
    applyHighlightGlow();
    applyPendingGlow();
  }

  function setPendingPort(key) {
    pendingPortKey = key || null;
    applyHighlightGlow();
    applyPendingGlow();
  }

  function drawBoardSubstrates(project) {
    for (const abs of project.abstractions || []) {
      if (abs.kind !== "board") continue;
      let min = null;
      let max = null;
      for (const id of abs.pieceIds || []) {
        const mesh = meshes.get(id);
        const part = mesh?.userData?.part;
        if (!mesh || !part) continue;
        const pos = worldCenter(mesh);
        const half = new THREE.Vector3(part.dimsMm.x, part.dimsMm.z, part.dimsMm.y).multiplyScalar(MM / 2);
        const lo = pos.clone().sub(half);
        const hi = pos.clone().add(half);
        min = min ? min.min(lo) : lo;
        max = max ? max.max(hi) : hi;
      }
      if (!min || !max) continue;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(max.x - min.x + 0.024, 0.0035, max.z - min.z + 0.024),
        stdMat({ color: 0x1e6b3f, roughness: 0.48, metalness: 0.08, transparent: true, opacity: 0.92 }),
      );
      slab.position.set((min.x + max.x) / 2, min.y - 0.001, (min.z + max.z) / 2);
      slab.receiveShadow = true;
      cableGroup.add(slab);
      const tag = textSprite(abs.label || "board", { heightM: 0.014, bg: "rgba(30, 107, 63, 0.9)", fg: "#f2f2f2" });
      tag.position.set((min.x + max.x) / 2, min.y + 0.012, max.z + 0.02);
      tag.visible = edaOn;
      cableGroup.add(tag);
    }
  }

  function applySnap() {
    if (snapOn) {
      transform.setTranslationSnap(0.01);
      transform.setRotationSnap(Math.PI / 12);
      transform.setScaleSnap(0.1);
    } else {
      transform.setTranslationSnap(null);
      transform.setRotationSnap(null);
      transform.setScaleSnap(null);
    }
  }
  applySnap();
  transform.setMode(editMode);

  function readPose(mesh = selected) {
    if (!mesh?.userData?.piece) return null;
    const pos = new THREE.Vector3();
    mesh.getWorldPosition(pos);
    return {
      id: mesh.userData.piece.id,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rx: mesh.rotation.x,
      ry: mesh.rotation.y,
      rz: mesh.rotation.z,
      sx: mesh.scale.x,
      sy: mesh.scale.y,
      sz: mesh.scale.z,
    };
  }

  function markSelected(mesh) {
    if (boxHelper) {
      scene.remove(boxHelper);
      boxHelper.dispose();
      boxHelper = null;
    }
    if (!mesh) return;
    boxHelper = new THREE.BoxHelper(mesh, 0xffc84a);
    scene.add(boxHelper);
  }

  function attach(mesh, quiet = false) {
    selected = mesh || null;
    if (!mesh) {
      transform.detach();
      markSelected(null);
      if (!quiet) onSelect(null);
      return false;
    }
    if (sculptMode || cadTool || meshTool) transform.detach();
    else transform.attach(mesh);
    markSelected(mesh);
    if (!quiet) onSelect(mesh.userData);
    return true;
  }

  function selectById(id, quiet = false) {
    if (!id) return attach(null, quiet);
    const mesh = meshes.get(id);
    if (!mesh) return attach(null, quiet);
    return attach(mesh, quiet);
  }

  function applyPose(piece) {
    const mesh = meshes.get(piece?.id);
    if (!mesh) return false;
    if (mesh.parent && mesh.parent !== group) {
      const world = new THREE.Vector3(piece.x || 0, piece.y || 0, piece.z || 0);
      mesh.parent.worldToLocal(world);
      mesh.position.copy(world);
    } else {
      mesh.position.set(piece.x || 0, piece.y || 0, piece.z || 0);
    }
    mesh.rotation.set(piece.rx || 0, piece.ry || 0, piece.rz || 0);
    mesh.scale.set(piece.sx || 1, piece.sy || 1, piece.sz || 1);
    markSelected(mesh);
    return true;
  }

  transform.addEventListener("dragging-changed", (e) => {
    orbit.enabled = !e.value;
    if (!e.value) {
      const pose = readPose(selected);
      if (pose) onPoseCommit(pose);
    }
  });
  scene.add(transform.getHelper());

  /* ---- Materials panel: per-piece color + roughness, applied live --------
     Color and texture persist through the project API (the server keeps
     them on the piece); roughness is a client-side dressing kept in a map
     so sync() can re-apply it after every rebuild. */
  const matOverrides = new Map(); // pieceId -> { roughness }

  function eachTintableMaterial(root, fn) {
    root.traverse((child) => {
      if (!child.isMesh || child.userData.keepColor) return;
      // Shading overrides may be live on child.material; edit the real one.
      const base = child.userData.baseMaterial || child.material;
      const mats = Array.isArray(base) ? base : base ? [base] : [];
      for (const mat of mats) {
        if (!mat || mat.userData?.keepColor) continue;
        fn(mat, child);
      }
    });
  }

  function setPieceMaterial(id, { color, roughness } = {}) {
    const mesh = meshes.get(id);
    if (!mesh) return false;
    if (roughness != null && Number.isFinite(Number(roughness))) {
      const value = THREE.MathUtils.clamp(Number(roughness), 0, 1);
      matOverrides.set(id, { ...(matOverrides.get(id) || {}), roughness: value });
      eachTintableMaterial(mesh, (mat) => {
        if (mat.roughness !== undefined) mat.roughness = value;
      });
    }
    if (color) {
      const piece = mesh.userData.piece;
      if (piece) piece.color = color;
      const record = reconstructed.get(id);
      if (record) record.piece.color = color;
      eachTintableMaterial(mesh, (mat, child) => {
        if (!mat.color) return;
        mat.color.set(color);
        const mul = mat.userData?.tintMul ?? child.userData.tintMul;
        if (mul) mat.color.multiplyScalar(mul);
      });
    }
    return true;
  }

  function getPieceMaterial(id) {
    const mesh = meshes.get(id);
    if (!mesh) return null;
    const piece = mesh.userData.piece || {};
    const part = mesh.userData.part || {};
    let roughness = matOverrides.get(id)?.roughness;
    if (roughness == null) {
      eachTintableMaterial(mesh, (mat) => {
        if (roughness == null && mat.roughness !== undefined) roughness = mat.roughness;
      });
    }
    return {
      color: `#${new THREE.Color(piece.color || part.color || PALE).getHexString()}`,
      texture: piece.texture || part.texture || null,
      roughness: roughness ?? 0.6,
    };
  }

  function applyMatOverrides() {
    for (const [id, override] of matOverrides) {
      const mesh = meshes.get(id);
      if (!mesh || override.roughness == null) continue;
      eachTintableMaterial(mesh, (mat) => {
        if (mat.roughness !== undefined) mat.roughness = override.roughness;
      });
    }
  }

  /* ---- Sculpt-lite: grab / smooth / inflate + one-shot subdivide ---------
     Blender-flavored vertex editing on the selected body. Deformed geometry
     is client-side dressing: sculptStore keeps the edited BufferGeometry per
     piece so sync() rebuilds put it back, exactly like matOverrides. */
  const sculptStore = new Map(); // pieceId -> [geometry per sculptable child]
  let sculptMode = null; // null | "grab" | "smooth" | "inflate"
  let sculptStroke = null;
  let onSculpt = () => {};

  function sculptTargets(root) {
    const out = [];
    root?.traverse((child) => {
      if (!child.isMesh || child.isSprite) return;
      if (!child.geometry?.getAttribute?.("position")) return;
      out.push(child);
    });
    return out;
  }

  // Non-indexed geometry keeps subdivide and the weld map trivial; boxes
  // are flat-shaded anyway so the lost index costs nothing visually.
  function sculptGeometry(child) {
    let geo = child.geometry;
    if (geo.index) {
      geo = geo.toNonIndexed();
      child.geometry = geo;
    }
    return geo;
  }

  // Corner vertices are split per face; weld co-located verts so a brush
  // stroke moves the surface, not one face of it.
  function weldGroups(geo) {
    const pos = geo.getAttribute("position");
    const byKey = new Map();
    for (let i = 0; i < pos.count; i += 1) {
      const key = `${pos.getX(i).toFixed(5)}|${pos.getY(i).toFixed(5)}|${pos.getZ(i).toFixed(5)}`;
      let list = byKey.get(key);
      if (!list) byKey.set(key, (list = []));
      list.push(i);
    }
    return [...byKey.values()];
  }

  function brushRadius(root) {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return 0.08;
    const size = box.getSize(new THREE.Vector3());
    return Math.max(0.025, size.length() * 0.16);
  }

  function sculptHit(ev) {
    if (!selected) return null;
    pointAt(ev);
    const hits = ray.intersectObject(selected, true).filter((h) => !h.object.isSprite);
    return hits.length ? hits[0].point.clone() : null;
  }

  function prepSculptTarget(child) {
    const geo = sculptGeometry(child);
    child.updateMatrixWorld(true);
    const pos = geo.getAttribute("position");
    const world = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      world[i * 3] = v.x;
      world[i * 3 + 1] = v.y;
      world[i * 3 + 2] = v.z;
    }
    return {
      child,
      geo,
      groups: weldGroups(geo),
      world,
      inverse: child.matrixWorld.clone().invert(),
    };
  }

  function writeSculptTarget(target) {
    const pos = target.geo.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.set(target.world[i * 3], target.world[i * 3 + 1], target.world[i * 3 + 2]).applyMatrix4(target.inverse);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    target.geo.computeVertexNormals();
    target.geo.computeBoundingBox();
    target.geo.computeBoundingSphere();
  }

  function groupCenter(target, group, out) {
    out.set(0, 0, 0);
    for (const i of group) {
      out.x += target.world[i * 3];
      out.y += target.world[i * 3 + 1];
      out.z += target.world[i * 3 + 2];
    }
    return out.divideScalar(group.length);
  }

  function saveSculpt() {
    const id = selected?.userData?.piece?.id;
    if (!id) return;
    sculptStore.set(id, sculptTargets(selected).map((child) => child.geometry));
  }

  function applySculptStore() {
    for (const [id, geos] of sculptStore) {
      const mesh = meshes.get(id);
      if (!mesh) {
        sculptStore.delete(id);
        continue;
      }
      const targets = sculptTargets(mesh);
      if (targets.length !== geos.length) {
        sculptStore.delete(id); // the body was rebuilt differently; drop the dressing
        continue;
      }
      targets.forEach((child, i) => {
        child.geometry = geos[i];
      });
    }
  }

  function beginSculptStroke(ev) {
    const hit = sculptHit(ev);
    if (!hit) return false;
    const targets = sculptTargets(selected).map(prepSculptTarget);
    const radius = brushRadius(selected);
    const stroke = { hit, targets, radius, moved: false };
    if (sculptMode === "grab") {
      const planeNormal = camera.getWorldDirection(new THREE.Vector3());
      stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, hit);
      const c = new THREE.Vector3();
      for (const target of targets) {
        target.grabbed = [];
        for (const group of target.groups) {
          const d = groupCenter(target, group, c).distanceTo(hit);
          if (d >= radius) continue;
          const w = (1 - d / radius) ** 2;
          target.grabbed.push({ group, w, base: group.map((i) => [target.world[i * 3], target.world[i * 3 + 1], target.world[i * 3 + 2]]) });
        }
      }
    }
    sculptStroke = stroke;
    orbit.enabled = false;
    return true;
  }

  function sculptStep(hit) {
    const stroke = sculptStroke;
    const { radius } = stroke;
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const target of stroke.targets) {
      const normal = target.geo.getAttribute("normal");
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(target.child.matrixWorld);
      let touched = false;
      for (const group of target.groups) {
        const d = groupCenter(target, group, c).distanceTo(hit);
        if (d >= radius) continue;
        const w = (1 - d / radius) ** 2;
        touched = true;
        if (sculptMode === "inflate") {
          n.set(0, 0, 0);
          for (const i of group) n.add(new THREE.Vector3().fromBufferAttribute(normal, i));
          n.applyMatrix3(normalMatrix).normalize().multiplyScalar(radius * 0.05 * w);
        } else {
          // smooth: relax the welded vertex toward the brush center
          n.copy(hit).sub(c).multiplyScalar(0.12 * w);
        }
        for (const i of group) {
          target.world[i * 3] += n.x;
          target.world[i * 3 + 1] += n.y;
          target.world[i * 3 + 2] += n.z;
        }
      }
      if (touched) {
        writeSculptTarget(target);
        stroke.moved = true;
      }
    }
  }

  function sculptGrab(ev) {
    const stroke = sculptStroke;
    pointAt(ev);
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(stroke.plane, out)) return;
    const delta = out.sub(stroke.hit);
    for (const target of stroke.targets) {
      if (!target.grabbed?.length) continue;
      for (const { group, w, base } of target.grabbed) {
        group.forEach((i, k) => {
          target.world[i * 3] = base[k][0] + delta.x * w;
          target.world[i * 3 + 1] = base[k][1] + delta.y * w;
          target.world[i * 3 + 2] = base[k][2] + delta.z * w;
        });
      }
      writeSculptTarget(target);
      stroke.moved = true;
    }
  }

  function moveSculptStroke(ev) {
    if (!sculptStroke) return;
    if (sculptMode === "grab") {
      sculptGrab(ev);
      return;
    }
    const hit = sculptHit(ev);
    if (hit) sculptStroke.hit = hit;
    sculptStep(sculptStroke.hit);
  }

  function endSculptStroke() {
    if (!sculptStroke) return;
    const moved = sculptStroke.moved;
    sculptStroke = null;
    orbit.enabled = true;
    if (!moved) return;
    saveSculpt();
    const name = selected?.userData?.part?.name || "body";
    pushOp("S", `Sculpt ${sculptMode} · ${name}`);
    onSculpt({ mode: sculptMode, name });
  }

  function setSculptMode(next) {
    const mode = ["grab", "smooth", "inflate"].includes(next) ? next : null;
    sculptMode = mode;
    if (mode) {
      if (cadTool) setCadTool(null);
      if (measureOn) setMeasure(false);
      if (meshTool) setMeshTool(null);
      transform.detach();
    } else if (selected && !meshTool) {
      transform.attach(selected);
    }
    canvas.classList.toggle("sculpting", Boolean(mode));
    for (const btn of document.querySelectorAll("[data-sculpt]")) {
      btn.classList.toggle("on", Boolean(mode) && btn.dataset.sculpt === mode);
    }
    return sculptMode;
  }

  function subdivideSelected() {
    const id = selected?.userData?.piece?.id;
    if (!id) return false;
    const targets = sculptTargets(selected);
    let total = 0;
    for (const child of targets) total += sculptGeometry(child).getAttribute("position").count;
    if (total > 60000) return false; // once around the loop is plenty
    for (const child of targets) {
      const geo = child.geometry;
      const pos = geo.getAttribute("position");
      const uv = geo.getAttribute("uv");
      const nextPos = new Float32Array(pos.count * 4 * 3);
      const nextUv = uv ? new Float32Array(pos.count * 4 * 2) : null;
      let w = 0;
      let wUv = 0;
      const P = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const U = (i) => (uv ? [uv.getX(i), uv.getY(i)] : null);
      const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
      const push = (p, t) => {
        nextPos.set(p, w);
        w += 3;
        if (nextUv && t) {
          nextUv.set(t, wUv);
          wUv += 2;
        }
      };
      for (let i = 0; i < pos.count; i += 3) {
        const [a, b, cV] = [P(i), P(i + 1), P(i + 2)];
        const [ta, tb, tc] = [U(i), U(i + 1), U(i + 2)];
        const ab = mid(a, b);
        const bc = mid(b, cV);
        const ca = mid(cV, a);
        const tab = ta && mid(ta, tb);
        const tbc = tb && mid(tb, tc);
        const tca = tc && mid(tc, ta);
        push(a, ta); push(ab, tab); push(ca, tca);
        push(ab, tab); push(b, tb); push(bc, tbc);
        push(ca, tca); push(bc, tbc); push(cV, tc);
        push(ab, tab); push(bc, tbc); push(ca, tca);
      }
      const nextGeo = new THREE.BufferGeometry();
      nextGeo.setAttribute("position", new THREE.BufferAttribute(nextPos, 3));
      if (nextUv) nextGeo.setAttribute("uv", new THREE.BufferAttribute(nextUv, 2));
      nextGeo.computeVertexNormals();
      child.geometry = nextGeo;
      geo.dispose();
    }
    saveSculpt();
    const name = selected?.userData?.part?.name || "body";
    pushOp("S", `Subdivide · ${name}`);
    return true;
  }

  /* ---- Mesh tools: extrude / inset / bevel / knife-lite / loop cut --------
     Fusion-flavored direct modeling on the selected body. Extrude and inset
     press-pull the face under the cursor (welded, so sides stretch with it).
     Bevel chamfers the nearest box edge. Knife and loop cut split triangles
     along a plane so the new edge loop is real geometry the sculpt brushes
     can grab. Everything persists through sculptStore, like the brushes. */
  const MESH_TOOLS = ["extrude", "inset", "bevel", "knife", "loopcut"];
  let meshTool = null;
  let meshStroke = null;
  let onMeshEdit = () => {};
  const knifeFx = new THREE.Group();
  scene.add(knifeFx);

  const FACE_EPS = 0.0012; // welded verts within 1.2 mm of the face plane move with it

  function selectedHit(ev) {
    if (!selected) return null;
    pointAt(ev);
    const hits = ray.intersectObject(selected, true).filter((h) => !h.object.isSprite && h.face);
    return hits.length ? hits[0] : null;
  }

  function worldFaceNormal(hit) {
    return hit.face.normal
      .clone()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .normalize();
  }

  function cameraPlaneThrough(point) {
    const normal = camera.getWorldDirection(new THREE.Vector3());
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  }

  function dragDelta(ev, stroke) {
    pointAt(ev);
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(stroke.dragPlane, out)) return null;
    return out.sub(stroke.hit);
  }

  // Split every triangle that crosses the plane so an edge lands exactly on
  // it. pos/uv are non-indexed local arrays; winding is preserved.
  function cutTrianglesWithPlane(pos, uv, plane, eps = 1e-6) {
    const nextPos = [];
    const nextUv = uv ? [] : null;
    const point = (vi) => new THREE.Vector3(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
    const tex = (vi) => (uv ? [uv[vi * 2], uv[vi * 2 + 1]] : null);
    const emit = (p, t) => {
      nextPos.push(p.x, p.y, p.z);
      if (nextUv) nextUv.push(t ? t[0] : 0, t ? t[1] : 0);
    };
    const mixUv = (a, b, t) => (a && b ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] : null);
    const count = pos.length / 3;
    for (let vi = 0; vi < count; vi += 3) {
      const p = [point(vi), point(vi + 1), point(vi + 2)];
      const t = [tex(vi), tex(vi + 1), tex(vi + 2)];
      const d = p.map((corner) => plane.distanceToPoint(corner));
      const side = d.map((x) => (x > eps ? 1 : x < -eps ? -1 : 0));
      if (!side.includes(1) || !side.includes(-1)) {
        for (let k = 0; k < 3; k += 1) emit(p[k], t[k]);
        continue;
      }
      const plus = side.filter((s) => s === 1).length;
      const minus = side.filter((s) => s === -1).length;
      if (plus === 1 && minus === 1) {
        // One corner sits on the plane: split the opposite edge once.
        const z = side.indexOf(0);
        const x = (z + 1) % 3;
        const y = (z + 2) % 3;
        const frac = d[x] / (d[x] - d[y]);
        const m = p[x].clone().lerp(p[y], frac);
        const mUv = mixUv(t[x], t[y], frac);
        emit(p[z], t[z]); emit(p[x], t[x]); emit(m, mUv);
        emit(p[z], t[z]); emit(m, mUv); emit(p[y], t[y]);
        continue;
      }
      // Classic 1-vs-2 split: three triangles around the lone corner.
      const loneSign = plus === 1 ? 1 : -1;
      const l = side.indexOf(loneSign);
      const x = (l + 1) % 3;
      const y = (l + 2) % 3;
      const fa = d[l] / (d[l] - d[x]);
      const fb = d[l] / (d[l] - d[y]);
      const a = p[l].clone().lerp(p[x], fa);
      const b = p[l].clone().lerp(p[y], fb);
      const aUv = mixUv(t[l], t[x], fa);
      const bUv = mixUv(t[l], t[y], fb);
      emit(p[l], t[l]); emit(a, aUv); emit(b, bUv);
      emit(a, aUv); emit(p[x], t[x]); emit(p[y], t[y]);
      emit(a, aUv); emit(p[y], t[y]); emit(b, bUv);
    }
    return { pos: new Float32Array(nextPos), uv: nextUv ? new Float32Array(nextUv) : null };
  }

  function writeCutGeometry(child, pos, uv) {
    const old = child.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    child.geometry = geo;
    if (old !== geo) old.dispose();
    return geo;
  }

  function localPlaneFor(child, worldPlane) {
    child.updateMatrixWorld(true);
    return worldPlane.clone().applyMatrix4(child.matrixWorld.clone().invert());
  }

  // Cut all sculptable children of the selected body with a world plane.
  function cutSelectedWithPlane(worldPlane) {
    let grew = false;
    for (const child of sculptTargets(selected)) {
      const geo = sculptGeometry(child);
      const pos = geo.getAttribute("position").array;
      const uv = geo.getAttribute("uv")?.array || null;
      const cut = cutTrianglesWithPlane(pos, uv, localPlaneFor(child, worldPlane));
      if (cut.pos.length === pos.length) continue;
      writeCutGeometry(child, cut.pos, cut.uv);
      grew = true;
    }
    if (grew) saveSculpt();
    return grew;
  }

  function beginFaceStroke(hit) {
    const normal = worldFaceNormal(hit);
    const targets = sculptTargets(selected).map(prepSculptTarget);
    const center = new THREE.Vector3();
    const c = new THREE.Vector3();
    let picked = 0;
    let maxR = 0.001;
    for (const target of targets) {
      target.facePicks = [];
      for (const group of target.groups) {
        groupCenter(target, group, c);
        if (Math.abs(c.clone().sub(hit.point).dot(normal)) > FACE_EPS) continue;
        target.facePicks.push({
          group,
          base: group.map((i) => [target.world[i * 3], target.world[i * 3 + 1], target.world[i * 3 + 2]]),
        });
        center.add(c);
        picked += 1;
      }
    }
    if (!picked) return false;
    center.divideScalar(picked);
    for (const target of targets) {
      for (const pick of target.facePicks) {
        const r = c.set(pick.base[0][0], pick.base[0][1], pick.base[0][2]).distanceTo(center);
        if (r > maxR) maxR = r;
      }
    }
    meshStroke = {
      kind: meshTool,
      hit: hit.point.clone(),
      normal,
      center,
      maxR,
      targets,
      dragPlane: cameraPlaneThrough(hit.point),
      moved: false,
      label: "",
    };
    orbit.enabled = false;
    return true;
  }

  function moveFaceStroke(ev) {
    const stroke = meshStroke;
    const delta = dragDelta(ev, stroke);
    if (!delta) return;
    const v = new THREE.Vector3();
    if (stroke.kind === "extrude") {
      const step = snapOn ? 0.001 : 0.0005;
      const dist = Math.round(delta.dot(stroke.normal) / step) * step;
      for (const target of stroke.targets) {
        for (const { group, base } of target.facePicks) {
          group.forEach((i, k) => {
            target.world[i * 3] = base[k][0] + stroke.normal.x * dist;
            target.world[i * 3 + 1] = base[k][1] + stroke.normal.y * dist;
            target.world[i * 3 + 2] = base[k][2] + stroke.normal.z * dist;
          });
        }
        writeSculptTarget(target);
      }
      stroke.moved = true;
      stroke.label = `Extrude ${asMm(Math.abs(dist))} mm`;
      placeDims(
        stroke.center.clone().addScaledVector(stroke.normal, dist + 0.02),
        `<strong>${asMm(dist)} mm</strong><small>extrude · release to keep</small>`,
      );
      return;
    }
    // Inset: drag toward the face center to taper the face inward.
    const inward = stroke.center.clone().sub(stroke.hit);
    inward.addScaledVector(stroke.normal, -inward.dot(stroke.normal));
    if (inward.lengthSq() < 1e-8) inward.set(1, 0, 0);
    inward.normalize();
    const k = THREE.MathUtils.clamp(1 - delta.dot(inward) / stroke.maxR, 0.05, 2.5);
    for (const target of stroke.targets) {
      for (const { group, base } of target.facePicks) {
        group.forEach((i, idx) => {
          v.set(base[idx][0], base[idx][1], base[idx][2]).sub(stroke.center).multiplyScalar(k).add(stroke.center);
          target.world[i * 3] = v.x;
          target.world[i * 3 + 1] = v.y;
          target.world[i * 3 + 2] = v.z;
        });
      }
      writeSculptTarget(target);
    }
    stroke.moved = true;
    const pct = Math.round((1 - k) * 100);
    stroke.label = `Inset ${pct}%`;
    placeDims(
      stroke.center.clone().addScaledVector(stroke.normal, 0.02),
      `<strong>${pct}%</strong><small>inset · release to keep</small>`,
    );
  }

  // The 12 edges of the selected body's world box, each with its two
  // outward face axes — bevel chamfers whichever edge sits under the click.
  function nearestBoxEdge(box, point) {
    const min = box.min;
    const max = box.max;
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    let best = null;
    for (let run = 0; run < 3; run += 1) {
      const fixed = [0, 1, 2].filter((axis) => axis !== run);
      for (const signA of [-1, 1]) {
        for (const signB of [-1, 1]) {
          const a = new THREE.Vector3();
          const b = new THREE.Vector3();
          a.setComponent(run, min.getComponent(run));
          b.setComponent(run, max.getComponent(run));
          for (const [fi, sign] of [[fixed[0], signA], [fixed[1], signB]]) {
            const value = sign > 0 ? max.getComponent(fi) : min.getComponent(fi);
            a.setComponent(fi, value);
            b.setComponent(fi, value);
          }
          const closest = new THREE.Vector3();
          new THREE.Line3(a, b).closestPointToPoint(point, true, closest);
          const dist = closest.distanceTo(point);
          if (best && dist >= best.dist) continue;
          const outward = axes[fixed[0]].clone().multiplyScalar(signA)
            .add(axes[fixed[1]].clone().multiplyScalar(signB))
            .normalize();
          const size = box.getSize(new THREE.Vector3());
          best = {
            dist,
            point: closest,
            outward,
            maxW: 0.45 * Math.min(size.getComponent(fixed[0]), size.getComponent(fixed[1])),
          };
        }
      }
    }
    return best;
  }

  function beginBevelStroke(hit) {
    const box = new THREE.Box3().setFromObject(selected);
    if (box.isEmpty()) return false;
    const edge = nearestBoxEdge(box, hit.point);
    if (!edge || !(edge.maxW > 0.001)) return false;
    const targets = sculptTargets(selected).map((child) => {
      const geo = sculptGeometry(child);
      return {
        child,
        basePos: geo.getAttribute("position").array.slice(),
        baseUv: geo.getAttribute("uv")?.array.slice() || null,
      };
    });
    meshStroke = {
      kind: "bevel",
      hit: hit.point.clone(),
      edge,
      targets,
      dragPlane: cameraPlaneThrough(hit.point),
      width: 0,
      moved: false,
      label: "",
    };
    orbit.enabled = false;
    return true;
  }

  function applyBevel(width) {
    const stroke = meshStroke;
    const { edge } = stroke;
    for (const target of stroke.targets) {
      if (width < 0.0005) {
        writeCutGeometry(target.child, target.basePos.slice(), target.baseUv ? target.baseUv.slice() : null);
        continue;
      }
      const worldPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        edge.outward,
        edge.point.clone().addScaledVector(edge.outward, -width),
      );
      const plane = localPlaneFor(target.child, worldPlane);
      const cut = cutTrianglesWithPlane(target.basePos, target.baseUv, plane);
      // Flatten everything past the plane onto it: the chamfer facet.
      const v = new THREE.Vector3();
      for (let i = 0; i < cut.pos.length; i += 3) {
        v.set(cut.pos[i], cut.pos[i + 1], cut.pos[i + 2]);
        const d = plane.distanceToPoint(v);
        if (d > 1e-6) {
          v.addScaledVector(plane.normal, -d);
          cut.pos[i] = v.x;
          cut.pos[i + 1] = v.y;
          cut.pos[i + 2] = v.z;
        }
      }
      writeCutGeometry(target.child, cut.pos, cut.uv);
    }
  }

  function moveBevelStroke(ev) {
    const stroke = meshStroke;
    const delta = dragDelta(ev, stroke);
    if (!delta) return;
    const step = snapOn ? 0.001 : 0.0005;
    const width = THREE.MathUtils.clamp(
      Math.round(-delta.dot(stroke.edge.outward) / step) * step,
      0,
      stroke.edge.maxW,
    );
    stroke.width = width;
    applyBevel(width);
    stroke.moved = width >= 0.0005;
    stroke.label = `Bevel ${asMm(width)} mm`;
    placeDims(
      stroke.edge.point.clone().addScaledVector(stroke.edge.outward, 0.03),
      `<strong>${asMm(width)} mm</strong><small>bevel · drag inward, release to keep</small>`,
    );
  }

  function beginKnifeStroke(hit) {
    meshStroke = {
      kind: "knife",
      hit: hit.point.clone(),
      end: hit.point.clone(),
      dragPlane: cameraPlaneThrough(hit.point),
      moved: false,
      label: "",
    };
    orbit.enabled = false;
    return true;
  }

  function moveKnifeStroke(ev) {
    const stroke = meshStroke;
    const delta = dragDelta(ev, stroke);
    if (!delta) return;
    stroke.end = stroke.hit.clone().add(delta);
    knifeFx.clear();
    knifeFx.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([stroke.hit, stroke.end]), measureLineMat));
    placeDims(
      stroke.hit.clone().lerp(stroke.end, 0.5).add(new THREE.Vector3(0, 0.02, 0)),
      `<strong>Knife</strong><small>release to cut through the body</small>`,
    );
  }

  function endKnifeStroke() {
    const stroke = meshStroke;
    knifeFx.clear();
    if (stroke.end.distanceTo(stroke.hit) < 0.005) return false;
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const normal = stroke.end.clone().sub(stroke.hit).cross(camDir);
    if (normal.lengthSq() < 1e-10) return false;
    normal.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, stroke.hit);
    if (!cutSelectedWithPlane(plane)) return false;
    stroke.label = "Knife cut";
    return true;
  }

  // Loop cut: one click adds a real edge loop across the body, perpendicular
  // to its longest axis that is not the clicked face's normal.
  function applyLoopCut(hit) {
    const normal = worldFaceNormal(hit);
    const box = new THREE.Box3().setFromObject(selected);
    if (box.isEmpty()) return false;
    const size = box.getSize(new THREE.Vector3());
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    let bestAxis = -1;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(normal.dot(axes[axis])) > 0.7) continue;
      if (bestAxis < 0 || size.getComponent(axis) > size.getComponent(bestAxis)) bestAxis = axis;
    }
    if (bestAxis < 0) bestAxis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
    const at = snapOn ? snap10(hit.point.getComponent(bestAxis)) : hit.point.getComponent(bestAxis);
    const point = hit.point.clone().setComponent(bestAxis, at);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axes[bestAxis], point);
    if (!cutSelectedWithPlane(plane)) return false;
    const name = selected?.userData?.part?.name || "body";
    pushOp("L", `Loop cut · ${name}`);
    onMeshEdit({ tool: "loopcut", name });
    return true;
  }

  function beginMeshStroke(ev) {
    const hit = selectedHit(ev);
    if (!hit) return false;
    if (meshTool === "loopcut") {
      applyLoopCut(hit);
      return true;
    }
    if (meshTool === "extrude" || meshTool === "inset") return beginFaceStroke(hit);
    if (meshTool === "bevel") return beginBevelStroke(hit);
    if (meshTool === "knife") return beginKnifeStroke(hit);
    return false;
  }

  function moveMeshStroke(ev) {
    if (!meshStroke) return;
    if (meshStroke.kind === "bevel") moveBevelStroke(ev);
    else if (meshStroke.kind === "knife") moveKnifeStroke(ev);
    else moveFaceStroke(ev);
  }

  function endMeshStroke() {
    const stroke = meshStroke;
    if (!stroke) return;
    let moved = stroke.moved;
    if (stroke.kind === "knife") moved = endKnifeStroke();
    meshStroke = null;
    orbit.enabled = true;
    dimsEl?.classList.remove("on");
    if (!moved) return;
    saveSculpt();
    const name = selected?.userData?.part?.name || "body";
    const chips = { extrude: "E", inset: "I", bevel: "B", knife: "K" };
    pushOp(chips[stroke.kind] || "M", `${stroke.label || stroke.kind} · ${name}`);
    onMeshEdit({ tool: stroke.kind, name, label: stroke.label });
  }

  function setMeshTool(next) {
    const mode = MESH_TOOLS.includes(next) ? next : null;
    meshTool = mode;
    if (mode) {
      if (cadTool) setCadTool(null);
      if (measureOn) setMeasure(false);
      if (sculptMode) setSculptMode(null);
      transform.detach();
    } else if (selected && !sculptMode && !cadTool && !measureOn) {
      transform.attach(selected);
    }
    canvas.classList.toggle("modeling", Boolean(mode));
    for (const btn of document.querySelectorAll("[data-mesh-tool]")) {
      btn.classList.toggle("on", Boolean(mode) && btn.dataset.meshTool === mode);
    }
    return meshTool;
  }

  /* ---- Hide / unhide: Blender's H and Alt+H for bench bodies ------------- */
  const hiddenIds = new Set();

  function applyHidden() {
    for (const id of [...hiddenIds]) {
      const mesh = meshes.get(id);
      if (!mesh) {
        hiddenIds.delete(id);
        continue;
      }
      mesh.visible = false;
    }
  }

  function setPieceHidden(id, on) {
    const mesh = meshes.get(id);
    if (!mesh) return false;
    if (on) {
      hiddenIds.add(id);
      mesh.visible = false;
      if (selected === mesh) attach(null);
    } else {
      hiddenIds.delete(id);
      mesh.visible = true;
    }
    return true;
  }

  function hideSelected() {
    const id = selected?.userData?.piece?.id;
    if (!id) return false;
    const name = selected.userData.part?.name || "body";
    setPieceHidden(id, true);
    pushOp("H", `Hide ${name}`);
    return true;
  }

  function unhideAll() {
    const count = hiddenIds.size;
    for (const id of [...hiddenIds]) setPieceHidden(id, false);
    if (count) pushOp("H", `Unhide ${count} ${count === 1 ? "body" : "bodies"}`);
    return count;
  }

  // Blender-style viewport shading: solid and wire share one override material
  // each; "material" restores whatever the part builders assigned.
  // Look is unlit clay — MeshBasicMaterial, no shadows — so the bench reads as form.
  let shading = "material";
  let lookOn = false;
  let measureOn = false;
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0xcfcfcf,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, wireframe: true, toneMapped: false });
  const unlitMat = new THREE.MeshBasicMaterial({ color: 0xd4d0c8, toneMapped: false });
  const unlitFloorMat = new THREE.MeshBasicMaterial({
    color: 0xd4d0c8,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 8,
  });

  function emitViewport() {
    canvas.dispatchEvent(new CustomEvent("ikealive-viewport", { detail: { look: lookOn, measure: measureOn } }));
  }

  function applyLookLights() {
    renderer.shadowMap.enabled = !lookOn;
    key.castShadow = !lookOn;
    key.intensity = lookOn ? 0 : 1.3;
    fill.intensity = lookOn ? 0 : 0.32;
    rim.intensity = lookOn ? 0 : 0.18;
    hemi.intensity = lookOn ? 1 : 0.9;
    floor.receiveShadow = false;
    bench.receiveShadow = !lookOn;
    // Clay renders still want grounding, just less of it.
    contactShadow.material.opacity = lookOn ? 0.28 : 0.55;
  }

  function meshOverride() {
    if (lookOn) return unlitMat;
    if (shading === "solid") return solidMat;
    if (shading === "wire") return wireMat;
    return null;
  }

  function applyShading() {
    applyLookLights();
    const override = meshOverride();
    for (const root of [group, cableGroup]) {
      root.traverse((child) => {
        if (!child.isMesh) return;
        if (!child.userData.baseMaterial) child.userData.baseMaterial = child.material;
        child.material = override || child.userData.baseMaterial;
      });
    }
    floor.material = lookOn ? unlitFloorMat : floor.userData.baseMaterial;
    bench.material = lookOn ? unlitMat : bench.userData.baseMaterial;
  }

  function setShading(mode) {
    if (!["solid", "material", "wire"].includes(mode)) return;
    shading = mode;
    lookOn = false;
    applyShading();
    emitViewport();
  }

  function setLook(on) {
    lookOn = Boolean(on);
    applyShading();
    emitViewport();
    return lookOn;
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

  /* ---- Lab CAD: sketch-extrude, joint mate, op timeline, dims overlay ----
     Sketch a rect or circle on the bench plane, pull it up, click to build.
     Joint picks the piece to move, then the piece to mate it to, flush faces.
     Every op lands as a chip on #cad-timeline; undo rides the server's edit
     history. Commits go through callbacks so main.js keeps owning the project
     API (api.add / api.move / refresh). */

  let knownParts = {};
  let cadTool = null; // null | "sketch-rect" | "sketch-circle" | "joint"
  let sketch = null; // { kind, phase: "draw" | "pull", a, b, height }
  let jointFirstMesh = null;
  let jointMark = null;
  let cadBusy = false;
  let prevPieceLabels = null;
  let suppressDiff = 0;
  const ops = [];
  let onSketchCommit = () => {};
  let onJointCommit = () => {};

  const timelineEl = document.getElementById("cad-timeline");
  const dimsEl = document.getElementById("cad-dims");
  const measureEl = document.getElementById("cad-measure");
  const benchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const sketchFx = new THREE.Group();
  scene.add(sketchFx);

  const sketchFill = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sketchEdge = new THREE.LineBasicMaterial({ color: 0xffda1a, toneMapped: false });
  const pullMat = new THREE.MeshStandardMaterial({
    color: 0xd9d9d9,
    transparent: true,
    opacity: 0.5,
    roughness: 0.6,
    metalness: 0.04,
  });

  // Same 10 mm grid the status bar promises.
  const snap10 = (v) => Math.round(v / 0.01) * 0.01;

  function pointAt(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
  }

  function castBench(ev) {
    pointAt(ev);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(benchPlane, out) ? out : null;
  }

  function disposeSketchFx() {
    sketchFx.traverse((child) => child.geometry?.dispose?.());
    sketchFx.clear();
  }

  function clearSketch() {
    sketch = null;
    disposeSketchFx();
    dimsEl?.classList.remove("on");
  }

  function clearJoint() {
    jointFirstMesh = null;
    if (jointMark) {
      scene.remove(jointMark);
      jointMark.dispose();
      jointMark = null;
    }
  }

  function setCadTool(next) {
    clearSketch();
    clearJoint();
    cadTool = next || null;
    if (cadTool && sculptMode) setSculptMode(null);
    if (cadTool && meshTool) setMeshTool(null);
    if (cadTool && measureOn) {
      measureOn = false;
      clearMeasure();
      canvas.classList.remove("measuring");
      emitViewport();
    }
    orbit.enabled = cadTool !== "sketch-rect" && cadTool !== "sketch-circle";
    if (cadTool) transform.detach();
    else if (selected && !measureOn) transform.attach(selected);
    for (const btn of document.querySelectorAll("[data-cad-tool]")) {
      btn.classList.toggle("on", Boolean(cadTool) && btn.dataset.cadTool === cadTool);
    }
  }

  const dimVec = new THREE.Vector3();
  function placeDims(world, html) {
    if (!dimsEl) return;
    dimVec.copy(world).project(camera);
    if (dimVec.z > 1) {
      dimsEl.classList.remove("on");
      return;
    }
    dimsEl.style.left = `${(dimVec.x * 0.5 + 0.5) * canvas.clientWidth}px`;
    dimsEl.style.top = `${(-dimVec.y * 0.5 + 0.5) * canvas.clientHeight}px`;
    if (dimsEl.dataset.body !== html) {
      dimsEl.dataset.body = html;
      dimsEl.innerHTML = html;
    }
    dimsEl.classList.add("on");
  }

  const dimBox = new THREE.Box3();
  const dimCenter = new THREE.Vector3();
  function updateDims() {
    if (!dimsEl || sketch || measureOn || meshStroke) return;
    const data = selected?.userData;
    if (!data?.part || !selected.parent) {
      dimsEl.classList.remove("on");
      return;
    }
    dimBox.setFromObject(selected);
    if (dimBox.isEmpty()) {
      dimsEl.classList.remove("on");
      return;
    }
    dimBox.getCenter(dimCenter);
    dimCenter.y = dimBox.max.y + 0.025;
    const d = data.part.dimsMm;
    const w = Math.max(1, Math.round(d.x * selected.scale.x));
    const dep = Math.max(1, Math.round(d.y * selected.scale.z));
    const h = Math.max(1, Math.round(d.z * selected.scale.y));
    placeDims(dimCenter, `<strong>${w} × ${dep} × ${h} mm</strong><small>${escText(data.part.name)}</small>`);
  }

  /* ---- Measure: click two world points, read millimetres (Blender ruler) ---- */
  const measureFx = new THREE.Group();
  scene.add(measureFx);
  const measureDotGeo = new THREE.SphereGeometry(0.006, 14, 12);
  const measureDotMat = new THREE.MeshBasicMaterial({
    color: 0xffda1a,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const measureLineMat = new THREE.LineBasicMaterial({
    color: 0xffda1a,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  let measureA = null;
  let measureB = null;
  let measureLocked = false;
  let measureDown = null;

  function snapMeasure(point) {
    const step = snapOn ? 0.001 : 0.0001;
    return new THREE.Vector3(
      Math.round(point.x / step) * step,
      Math.round(point.y / step) * step,
      Math.round(point.z / step) * step,
    );
  }

  function hitWorld(ev) {
    pointAt(ev);
    const visibleRoots = group.children.filter((child) => child.visible);
    const hits = ray.intersectObjects([...visibleRoots, bench, floor], true);
    if (hits.length) return hits[0].point.clone();
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(benchPlane, out) ? out : null;
  }

  // Sidebar twin of the floating label — the Fusion-style measure readout.
  function syncMeasureRead() {
    const readEl = document.getElementById("measure-readout");
    if (!readEl) return;
    if (!measureA || !measureB) {
      readEl.textContent = measureOn
        ? "Click two points in the viewport."
        : "Turn Measure on, then click two points.";
      return;
    }
    const dx = Math.round(Math.abs(measureB.x - measureA.x) * 1000);
    const dy = Math.round(Math.abs(measureB.y - measureA.y) * 1000);
    const dz = Math.round(Math.abs(measureB.z - measureA.z) * 1000);
    readEl.textContent = `${fmtMm(measureA.distanceTo(measureB))} · Δ ${dx} × ${dy} × ${dz} mm`;
  }

  function getMeasuredMm() {
    if (!measureA || !measureB) return 0;
    return measureA.distanceTo(measureB) * 1000;
  }

  function clearMeasure() {
    measureA = null;
    measureB = null;
    measureLocked = false;
    measureFx.clear();
    measureEl?.classList.remove("on");
    syncMeasureRead();
  }

  function drawMeasure() {
    measureFx.clear();
    syncMeasureRead();
    if (!measureA) return;
    const a = new THREE.Mesh(measureDotGeo, measureDotMat);
    a.position.copy(measureA);
    measureFx.add(a);
    if (!measureB) return;
    const b = new THREE.Mesh(measureDotGeo, measureDotMat);
    b.position.copy(measureB);
    measureFx.add(b);
    measureFx.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([measureA, measureB]), measureLineMat));
  }

  function fmtMm(meters) {
    const rounded = Math.round(meters * 1000 * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded} mm` : `${rounded.toFixed(1)} mm`;
  }

  function placeMeasure(world, html) {
    if (!measureEl) return;
    dimVec.copy(world).project(camera);
    if (dimVec.z > 1) {
      measureEl.classList.remove("on");
      return;
    }
    measureEl.style.left = `${(dimVec.x * 0.5 + 0.5) * canvas.clientWidth}px`;
    measureEl.style.top = `${(-dimVec.y * 0.5 + 0.5) * canvas.clientHeight}px`;
    if (measureEl.dataset.body !== html) {
      measureEl.dataset.body = html;
      measureEl.innerHTML = html;
    }
    measureEl.classList.add("on");
  }

  function updateMeasureLabel() {
    if (!measureEl || !measureOn || !measureA || !measureB) {
      measureEl?.classList.remove("on");
      return;
    }
    const mid = measureA.clone().lerp(measureB, 0.5);
    const dx = Math.round(Math.abs(measureB.x - measureA.x) * 1000);
    const dy = Math.round(Math.abs(measureB.y - measureA.y) * 1000);
    const dz = Math.round(Math.abs(measureB.z - measureA.z) * 1000);
    placeMeasure(
      mid,
      `<strong>${fmtMm(measureA.distanceTo(measureB))}</strong><small>Δ ${dx} × ${dy} × ${dz} mm</small>`,
    );
  }

  function measureClick(ev) {
    const hit = hitWorld(ev);
    if (!hit) return;
    const point = snapMeasure(hit);
    if (!measureA || measureLocked) {
      measureA = point;
      measureB = null;
      measureLocked = false;
      drawMeasure();
      return;
    }
    measureB = point;
    measureLocked = true;
    drawMeasure();
  }

  function setMeasure(on) {
    const next = Boolean(on);
    if (next === measureOn) return measureOn;
    measureOn = next;
    canvas.classList.toggle("measuring", measureOn);
    if (measureOn) {
      if (cadTool) setCadTool(null);
      if (meshTool) setMeshTool(null);
      if (sculptMode) setSculptMode(null);
      transform.detach();
    } else {
      clearMeasure();
      if (selected && !cadTool && !meshTool && !sculptMode) transform.attach(selected);
    }
    syncMeasureRead();
    emitViewport();
    return measureOn;
  }

  function sketchCenter(s) {
    return s.kind === "rect"
      ? new THREE.Vector3((s.a.x + s.b.x) / 2, 0, (s.a.z + s.b.z) / 2)
      : new THREE.Vector3(s.a.x, 0, s.a.z);
  }

  function redrawSketch() {
    disposeSketchFx();
    if (!sketch) return;
    const s = sketch;
    const c = sketchCenter(s);
    const w = Math.max(Math.abs(s.b.x - s.a.x), 0.001);
    const d = Math.max(Math.abs(s.b.z - s.a.z), 0.001);
    const r = Math.max(Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z), 0.0005);
    const flatGeo = s.kind === "rect" ? new THREE.PlaneGeometry(w, d) : new THREE.CircleGeometry(r, 48);
    const flat = new THREE.Mesh(flatGeo, sketchFill);
    flat.rotation.x = -Math.PI / 2;
    flat.position.set(c.x, 0.004, c.z);
    sketchFx.add(flat);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(flatGeo), sketchEdge);
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(c.x, 0.0045, c.z);
    sketchFx.add(outline);
    if (s.phase !== "pull") return;
    const solidGeo =
      s.kind === "rect" ? new THREE.BoxGeometry(w, s.height, d) : new THREE.CylinderGeometry(r, r, s.height, 48);
    const solid = new THREE.Mesh(solidGeo, pullMat);
    solid.position.set(c.x, s.height / 2, c.z);
    sketchFx.add(solid);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(solidGeo), sketchEdge);
    edges.position.copy(solid.position);
    sketchFx.add(edges);
  }

  function sketchOverlay() {
    if (!sketch) return;
    const s = sketch;
    const c = sketchCenter(s);
    const size =
      s.kind === "rect"
        ? `${asMm(Math.abs(s.b.x - s.a.x))} × ${asMm(Math.abs(s.b.z - s.a.z))} mm`
        : `Ø ${asMm(2 * Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z))} mm`;
    const tail = s.phase === "pull" ? ` · H ${asMm(s.height)} mm` : "";
    c.y = s.phase === "pull" ? s.height + 0.02 : 0.02;
    placeDims(
      c,
      `<strong>${size}${tail}</strong><small>${
        s.phase === "pull" ? "click to build · Esc cancels" : "release, then pull up"
      }</small>`,
    );
  }

  function pullHeight(ev) {
    pointAt(ev);
    const c = sketchCenter(sketch);
    const n = new THREE.Vector3().subVectors(camera.position, c);
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c);
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, out)) return null;
    return Math.min(1.2, Math.max(0.01, snap10(out.y)));
  }

  function sketchDown(ev) {
    if (sketch?.phase === "pull") {
      commitSketch();
      return;
    }
    const hit = castBench(ev);
    if (!hit) return;
    const a = new THREE.Vector3(snap10(hit.x), 0, snap10(hit.z));
    sketch = { kind: cadTool === "sketch-rect" ? "rect" : "circle", phase: "draw", a, b: a.clone(), height: 0.05 };
    redrawSketch();
  }

  window.addEventListener("pointermove", (ev) => {
    if (sculptStroke) {
      moveSculptStroke(ev);
      return;
    }
    if (meshStroke) {
      moveMeshStroke(ev);
      return;
    }
    if (measureOn && measureA && !measureLocked) {
      const hit = hitWorld(ev);
      if (hit) {
        measureB = snapMeasure(hit);
        drawMeasure();
      }
    }
    if (!sketch) return;
    if (sketch.phase === "draw") {
      const hit = castBench(ev);
      if (!hit) return;
      sketch.b.set(snap10(hit.x), 0, snap10(hit.z));
    } else {
      const h = pullHeight(ev);
      if (h == null) return;
      sketch.height = h;
    }
    redrawSketch();
    sketchOverlay();
  });

  window.addEventListener("pointerup", () => {
    if (sculptStroke) {
      endSculptStroke();
      return;
    }
    if (meshStroke) {
      endMeshStroke();
      return;
    }
    if (!sketch || sketch.phase !== "draw") return;
    const size =
      sketch.kind === "rect"
        ? Math.min(Math.abs(sketch.b.x - sketch.a.x), Math.abs(sketch.b.z - sketch.a.z))
        : Math.hypot(sketch.b.x - sketch.a.x, sketch.b.z - sketch.a.z);
    if (size < 0.01) {
      clearSketch();
      return;
    }
    sketch.phase = "pull";
    sketch.height = 0.05;
    redrawSketch();
    sketchOverlay();
  });

  function commitSketch() {
    if (!sketch || cadBusy) return;
    const s = sketch;
    clearSketch();
    const stock = s.kind === "rect" ? LAB_STOCK.box : LAB_STOCK.cyl;
    const dims = knownParts[stock.partId]?.dimsMm || stock.dims;
    let pose;
    let label;
    if (s.kind === "rect") {
      const w = Math.max(Math.abs(s.b.x - s.a.x), 0.01);
      const d = Math.max(Math.abs(s.b.z - s.a.z), 0.01);
      pose = {
        x: round4((s.a.x + s.b.x) / 2),
        y: round4(s.height / 2),
        z: round4((s.a.z + s.b.z) / 2),
        sx: round4(w / (dims.x * MM)),
        sy: round4(s.height / (dims.z * MM)),
        sz: round4(d / (dims.y * MM)),
        texture: "lab-box",
        color: LAB_GRAY,
      };
      label = `Extrude box ${asMm(w)} × ${asMm(d)} × ${asMm(s.height)} mm`;
    } else {
      const r = Math.max(Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z), 0.005);
      pose = {
        x: round4(s.a.x),
        y: round4(s.height / 2),
        z: round4(s.a.z),
        sx: round4((2 * r) / (dims.x * MM)),
        sy: round4(s.height / (dims.z * MM)),
        sz: round4((2 * r) / (dims.y * MM)),
        texture: "lab-cyl",
        color: LAB_GRAY,
      };
      label = `Extrude cylinder Ø ${asMm(2 * r)} × ${asMm(s.height)} mm`;
    }
    cadBusy = true;
    suppressDiff += 1; // the refresh after api.add would double-count this op
    pushOp("E", label);
    Promise.resolve(onSketchCommit({ partId: stock.partId, pose, label }))
      .catch(() => {})
      .finally(() => {
        cadBusy = false;
      });
    setCadTool(null);
  }

  function mateMoves(aMesh, bMesh) {
    const a = aMesh.userData;
    const b = bMesh.userData;
    const boxA = new THREE.Box3().setFromObject(aMesh);
    const boxB = new THREE.Box3().setFromObject(bMesh);
    if (boxA.isEmpty() || boxB.isEmpty()) return null;
    const hA = boxA.max.y - boxA.min.y;
    const cA = boxA.getCenter(new THREE.Vector3());
    const cB = boxB.getCenter(new THREE.Vector3());
    const moves = [];
    const plain = !labKindOf(a.piece) && !labKindOf(b.piece);
    const legToTop = plain && isTableLeg(a.part) && isTableTop(b.part);
    const topToLeg = plain && isTableTop(a.part) && isTableLeg(b.part);
    let target;
    let label;
    if (legToTop) {
      const tw = boxB.max.x - boxB.min.x;
      const td = boxB.max.z - boxB.min.z;
      const legW = Math.max(boxA.max.x - boxA.min.x, boxA.max.z - boxA.min.z);
      const inset = legCenterInset(tw, legW);
      const sx = cA.x >= cB.x ? 1 : -1;
      const sz = cA.z >= cB.z ? 1 : -1;
      let y = boxB.min.y - hA / 2;
      if (y < hA / 2 - 1e-6) {
        // No room under the top: stand the leg on the floor, lift the top onto it.
        y = hA / 2;
        moves.push({ id: b.piece.id, pose: { y: round4(cB.y + (hA - boxB.min.y)) } });
      }
      target = { x: cB.x + sx * (tw / 2 - inset), y, z: cB.z + sz * (td / 2 - inset) };
      label = `Joint ${a.part.name} under ${b.part.name}, flush`;
    } else if (topToLeg) {
      const tw = boxA.max.x - boxA.min.x;
      const td = boxA.max.z - boxA.min.z;
      const legW = Math.max(boxB.max.x - boxB.min.x, boxB.max.z - boxB.min.z);
      const inset = legCenterInset(tw, legW);
      const sx = cB.x >= cA.x ? 1 : -1;
      const sz = cB.z >= cA.z ? 1 : -1;
      target = {
        x: cB.x - sx * (tw / 2 - inset),
        y: boxB.max.y + hA / 2,
        z: cB.z - sz * (td / 2 - inset),
      };
      label = `Joint ${a.part.name} onto ${b.part.name}, flush`;
    } else {
      target = { x: cB.x, y: boxB.max.y + hA / 2, z: cB.z };
      label = `Joint ${a.part.name} flush on ${b.part.name}`;
    }
    moves.unshift({
      id: a.piece.id,
      pose: { x: round4(target.x), y: round4(target.y), z: round4(target.z), rx: 0, ry: 0, rz: 0 },
    });
    return {
      moves,
      joint: { fromPiece: a.piece.id, toPiece: b.piece.id, kind: "mate-flush", note: label },
      label,
    };
  }

  function jointPick(ev) {
    pointAt(ev);
    const hits = ray.intersectObjects(group.children.filter((child) => child.visible), true);
    const mesh = hits.length ? hitsWalk(hits[0].object) : null;
    if (!mesh?.userData?.piece) return;
    if (!jointFirstMesh) {
      jointFirstMesh = mesh;
      jointMark = new THREE.BoxHelper(mesh, 0xffffff);
      scene.add(jointMark);
      return;
    }
    if (mesh === jointFirstMesh) return;
    const payload = mateMoves(jointFirstMesh, mesh);
    setCadTool(null);
    if (!payload || cadBusy) return;
    cadBusy = true;
    pushOp("J", payload.label);
    Promise.resolve(onJointCommit(payload))
      .catch(() => {})
      .finally(() => {
        cadBusy = false;
      });
  }

  function pushOp(chip, label) {
    ops.push({ chip, label });
    if (ops.length > 30) ops.shift();
    renderTimeline();
  }

  function renderTimeline() {
    if (!timelineEl) return;
    if (!ops.length) {
      timelineEl.innerHTML = "";
      return;
    }
    const last = ops[ops.length - 1];
    const chips = ops
      .slice(-8)
      .map((op) => `<span class="cad-chip" title="${escText(op.label)}">${escText(op.chip)}</span>`)
      .join("");
    timelineEl.innerHTML =
      `<span class="cad-tl-kicker">Timeline</span>${chips}` +
      `<span class="cad-tl-last" title="${escText(last.label)}">${escText(last.label)}</span>` +
      `<button type="button" class="cad-tl-undo" title="Undo the last op (Ctrl+Z)">Undo</button>`;
  }

  timelineEl?.addEventListener("click", (ev) => {
    if (ev.target.closest(".cad-tl-undo")) document.querySelector("[data-undo]")?.click();
  });

  // Place / delete chips fall out of the piece-list diff between syncs, so
  // shelf adds, chat adds and deletes all land on the timeline for free.
  function trackPieces(project, partsById) {
    const next = new Map();
    for (const piece of project.pieces) {
      next.set(piece.id, partsById[piece.partId]?.name || piece.partId);
    }
    if (suppressDiff > 0) {
      suppressDiff -= 1;
    } else if (prevPieceLabels) {
      const added = [...next.keys()].filter((id) => !prevPieceLabels.has(id));
      const removed = [...prevPieceLabels.keys()].filter((id) => !next.has(id));
      if (added.length && !removed.length) {
        pushOp("P", added.length === 1 ? `Place ${next.get(added[0])}` : `Place ${added.length} pieces`);
      } else if (removed.length && !added.length) {
        pushOp(
          "D",
          removed.length === 1 ? `Delete ${prevPieceLabels.get(removed[0])}` : `Delete ${removed.length} pieces`,
        );
      }
    }
    prevPieceLabels = next;
  }

  function noteHistory(direction) {
    suppressDiff += 1;
    if (direction === "redo") {
      pushOp("Y", "Redo the last undone op");
      return;
    }
    ops.pop();
    renderTimeline();
  }

  // Transform ops become timeline chips; the pose itself is persisted by the
  // dragging-changed listener above through onPoseCommit.
  let chipPoseBefore = null;
  transform.addEventListener("dragging-changed", (e) => {
    if (e.value) {
      chipPoseBefore = selected ? JSON.stringify(readPose(selected)) : null;
      return;
    }
    if (!selected || !chipPoseBefore) return;
    const after = JSON.stringify(readPose(selected));
    const changed = after !== chipPoseBefore;
    chipPoseBefore = null;
    if (!changed) return;
    const verbs = { translate: "Move", rotate: "Rotate", scale: "Scale" };
    const verb = verbs[editMode] || "Move";
    pushOp(verb[0], `${verb} ${selected.userData.part?.name || "piece"}`);
  });

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cad-tool]");
    if (!btn) return;
    const next = btn.dataset.cadTool;
    setCadTool(cadTool === next ? null : next);
  });

  window.addEventListener("keydown", (ev) => {
    const tag = ev.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
    if (ev.key === "Escape" && measureOn) {
      if (measureA) {
        clearMeasure();
        return;
      }
      setMeasure(false);
      return;
    }
    if (ev.key === "Escape" && cadTool) setCadTool(null);
    if (ev.key === "Escape" && meshTool) setMeshTool(null);
    if (ev.key === "Escape" && sculptMode) setSculptMode(null);
  });

  function meshFor(piece, part) {
    const lab = labKindOf(piece);
    const root = lab ? makeLabSolid(lab, part, piece) : bodyFor(inferShape(part), part, materialFor(part, piece));
    shadow(root);
    root.userData = { piece, part, ports: part.ports || [] };
    if (!lab) addEdaDecor(root, piece, part);
    return root;
  }

  function meshForReconstruction(record) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(record.positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = stdMat({
      color: new THREE.Color(record.piece.color || "#c9d2da"),
      roughness: 0.5,
      metalness: 0.04,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    const root = shadow(new THREE.Mesh(geometry, material));
    root.userData = {
      piece: record.piece,
      part: record.part,
      ports: [],
      reconstructed: true,
      voxelCount: record.voxelCount,
      triangleCount: record.triangleCount,
    };
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
      if (labKindOf(piece)) continue; // sketched bodies are stock, not table parts
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
        const inset = legCenterInset(tw, Math.max(leg.part.dimsMm.x, leg.part.dimsMm.y) * MM);
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
    knownParts = partsById;
    trackPieces(project, partsById);
    const keepId = selected?.userData?.piece?.id || project.selection || null;
    transform.detach();
    group.clear();
    meshes.clear();
    portMarkers.clear();
    cableObjects.length = 0;
    selected = null;
    markSelected(null);
    for (const piece of project.pieces) {
      const part = partsById[piece.partId];
      if (!part) continue;
      const mesh = meshFor(piece, part);
      poseMesh(mesh, piece, part);
      group.add(mesh);
      meshes.set(piece.id, mesh);
    }
    for (const record of reconstructed.values()) {
      const mesh = meshForReconstruction(record);
      poseMesh(mesh, record.piece, record.part);
      group.add(mesh);
      meshes.set(record.piece.id, mesh);
    }
    for (const id of [...matOverrides.keys()]) {
      if (!meshes.has(id)) matOverrides.delete(id);
    }
    applyMatOverrides();
    applySculptStore();
    applyHidden();
    cableGroup.clear();
    const cableNets = project.netlist?.cableNets || {};
    const netByName = new Map((project.netlist?.nets || []).map((n) => [n.name, n]));
    for (const cable of project.cables) {
      const a = meshes.get(cable.fromPiece);
      const b = meshes.get(cable.toPiece);
      if (!a || !b) continue;
      const aPos = portWorld(a, cable.fromPort) || worldCenter(a);
      const bPos = portWorld(b, cable.toPort) || worldCenter(b);
      const netName = cableNets[cable.id] || cable.net || null;
      const color = netColor(netName ? netByName.get(netName) : null);
      const mid = aPos.clone().lerp(bPos, 0.5).add(new THREE.Vector3(0, cable.locked ? 0.045 : 0.02, 0));
      let obj;
      let baseOpacity;
      if (cable.locked) {
        // Routed wire: a tube colored by net class.
        const curve = new THREE.CatmullRomCurve3([aPos.clone(), mid, bPos.clone()]);
        obj = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 20, 0.0016, 6, false),
          new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, transparent: true }),
        );
        baseOpacity = 1;
      } else {
        // Unlocked connection: dashed air-line — the ratsnest.
        const geo = new THREE.BufferGeometry().setFromPoints([aPos.clone(), mid, bPos.clone()]);
        obj = new THREE.Line(
          geo,
          new THREE.LineDashedMaterial({ color, dashSize: 0.011, gapSize: 0.007, transparent: true }),
        );
        obj.computeLineDistances();
        baseOpacity = 0.85;
      }
      obj.material.opacity = baseOpacity;
      obj.userData.cableId = cable.id;
      cableGroup.add(obj);
      let label = null;
      if (netName) {
        label = textSprite(netName, { heightM: 0.013 });
        label.position.copy(mid).add(new THREE.Vector3(0, 0.011, 0));
        label.visible = edaOn;
        cableGroup.add(label);
      }
      cableObjects.push({ obj, label, net: netName, cableId: cable.id, baseOpacity });
    }
    drawBoardSubstrates(project);
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
    applyHighlightGlow();
    applyPendingGlow();
    if (keepId && meshes.has(keepId)) attach(meshes.get(keepId), true);
  }

  function pick(ev) {
    if (transform.axis || transform.dragging) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    const hits = ray
      .intersectObjects(group.children.filter((child) => child.visible), true)
      .filter((h) => !h.object.isSprite && h.object.visible !== false);
    if (!hits.length) {
      attach(null);
      return;
    }
    // Gold pads outrank the piece under them: a click wires, not drags.
    const portRef = edaOn ? hits[0].object.userData?.portRef : null;
    if (portRef) {
      onPortClick({ ...portRef });
      return;
    }
    const mesh = hitsWalk(hits[0].object);
    if (!mesh) {
      attach(null);
      return;
    }
    attach(mesh);
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || transform.dragging) return;
    if (measureOn) {
      measureDown = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (cadTool === "sketch-rect" || cadTool === "sketch-circle") {
      sketchDown(ev);
      return;
    }
    if (cadTool === "joint") {
      jointPick(ev);
      return;
    }
    if (meshTool && selected && beginMeshStroke(ev)) return;
    if (sculptMode && selected && beginSculptStroke(ev)) {
      if (sculptMode !== "grab") sculptStep(sculptStroke.hit);
      return;
    }
    pick(ev);
  });

  canvas.addEventListener("pointerup", (ev) => {
    if (!measureOn || !measureDown || ev.button !== 0) return;
    const dx = ev.clientX - measureDown.x;
    const dy = ev.clientY - measureDown.y;
    measureDown = null;
    if (dx * dx + dy * dy > 25) return;
    measureClick(ev);
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
    const target = instructionRoot || group;
    let i = 0;
    target.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.position.y += amount * (0.02 + (i % 4) * 0.03);
      i += 1;
    });
  }

  function disposeObject(root) {
    root.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material?.map?.dispose?.();
        material?.dispose?.();
      }
    });
  }

  function clearInstructionMesh() {
    if (instructionRoot) {
      scene.remove(instructionRoot);
      disposeObject(instructionRoot);
      instructionRoot = null;
    }
    instructionUrl = null;
    group.visible = true;
    cableGroup.visible = true;
  }

  function frameInstruction(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    root.scale.multiplyScalar(0.9 / maxDim);
    const fitted = new THREE.Box3().setFromObject(root);
    const fittedCenter = fitted.getCenter(new THREE.Vector3());
    root.position.sub(fittedCenter);
    root.position.y -= fitted.min.y;
  }

  async function loadInstructionMesh(url, { camera: nextCamera } = {}) {
    const meshUrl = String(url || "").trim();
    if (!meshUrl) throw new Error("No mesh URL");
    if (instructionUrl === meshUrl && instructionRoot) {
      if (nextCamera) setCamera(nextCamera);
      resize();
      return { meshUrl, reused: true };
    }
    clearInstructionMesh();
    group.visible = false;
    cableGroup.visible = false;
    const gltf = await gltfLoader.loadAsync(meshUrl);
    instructionRoot = gltf.scene || gltf.scenes?.[0];
    if (!instructionRoot) throw new Error("GLB had no scene");
    frameInstruction(instructionRoot);
    scene.add(instructionRoot);
    instructionUrl = meshUrl;
    if (nextCamera) setCamera(nextCamera);
    resize();
    return { meshUrl };
  }

  function setLed(on) {
    // Emission only draws in material shading — same rule as Blender's solid view.
    if (lookOn || shading !== "material") return;
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
    if (boxHelper && selected) boxHelper.update();
    if (jointMark && jointFirstMesh) jointMark.update();
    updateDims();
    updateMeasureLabel();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  function addReconstructedMesh(spec) {
    if (!spec?.id || !(spec.positions instanceof Float32Array) || spec.positions.length < 9) {
      throw new Error("The reconstructed body has no triangle vertices.");
    }
    const dimsMm = {
      x: Math.max(1, Number(spec.dimensionsMm?.x) || 1),
      y: Math.max(1, Number(spec.dimensionsMm?.y) || 1),
      z: Math.max(1, Number(spec.dimensionsMm?.z) || 1),
    };
    const piece = {
      id: spec.id,
      partId: "scan-mesh",
      x: Number(spec.x) || 0,
      y: Number(spec.y) || (dimsMm.z * MM) / 2,
      z: Number(spec.z) || 0,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      color: spec.color || "#c9d2da",
      reconstructed: true,
    };
    const part = {
      id: "scan-mesh",
      name: spec.name || "Scanned object",
      category: "scan",
      dimsMm,
      color: piece.color,
    };
    const record = {
      piece,
      part,
      positions: spec.positions,
      voxelCount: Number(spec.voxelCount) || 0,
      triangleCount: Number(spec.triangleCount) || spec.positions.length / 9,
    };
    reconstructed.set(piece.id, record);
    const old = meshes.get(piece.id);
    if (old) {
      group.remove(old);
      old.geometry?.dispose?.();
      old.material?.dispose?.();
    }
    const mesh = meshForReconstruction(record);
    poseMesh(mesh, piece, part);
    group.add(mesh);
    meshes.set(piece.id, mesh);
    pushOp("S", `Scan ${part.name} · ${record.triangleCount.toLocaleString()} triangles`);
    attach(mesh);
    return { piece, part };
  }

  function removeReconstructed(id) {
    if (!reconstructed.has(id)) return false;
    const mesh = meshes.get(id);
    if (mesh) {
      if (selected === mesh) attach(null);
      group.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
      meshes.delete(id);
    }
    reconstructed.delete(id);
    pushOp("D", "Delete scanned object");
    return true;
  }

  function updateReconstructedPose(pose) {
    const record = reconstructed.get(pose?.id);
    if (!record) return false;
    for (const key of ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"]) {
      if (Number.isFinite(Number(pose[key]))) record.piece[key] = Number(pose[key]);
    }
    applyPose(record.piece);
    return true;
  }

  function duplicateReconstructed(id) {
    const source = reconstructed.get(id);
    if (!source) return null;
    let suffix = reconstructed.size + 1;
    while (reconstructed.has(`scan-mesh-${suffix}`)) suffix += 1;
    return addReconstructedMesh({
      id: `scan-mesh-${suffix}`,
      name: `${source.part.name} copy`,
      positions: source.positions,
      dimensionsMm: source.part.dimsMm,
      voxelCount: source.voxelCount,
      triangleCount: source.triangleCount,
      color: source.piece.color,
      x: source.piece.x + source.part.dimsMm.x * MM + 0.02,
      y: source.piece.y,
      z: source.piece.z,
    });
  }

  return {
    sync,
    setSim,
    setCamera,
    loadInstructionMesh,
    clearInstructionMesh,
    setShading,
    getShading: () => shading,
    setLook,
    getLook: () => lookOn,
    setMeasure,
    getMeasure: () => measureOn,
    frameSelected,
    explode,
    setLed,
    resize,
    select: (id) => selectById(id),
    clearSelect: () => attach(null),
    applyPose,
    setPieceMaterial,
    getPieceMaterial,
    setEda,
    highlightNet,
    setPendingPort,
    onPortClick: (fn) => {
      onPortClick = fn;
    },
    onSelect: (fn) => {
      onSelect = fn;
    },
    onPoseCommit: (fn) => {
      onPoseCommit = fn;
    },
    getSelected: () => selected?.userData || null,
    getReconstructed: () => [...reconstructed.values()].map(({ piece, part, positions, voxelCount, triangleCount }) => ({
      piece,
      part,
      positions,
      voxelCount,
      triangleCount,
    })),
    addReconstructedMesh,
    removeReconstructed,
    updateReconstructedPose,
    duplicateReconstructed,
    getSelectedPose: () => readPose(selected),
    onSketch: (fn) => {
      onSketchCommit = fn;
    },
    onJoint: (fn) => {
      onJointCommit = fn;
    },
    noteHistory,
    setCadTool,
    getCadTool: () => cadTool,
    setSculptMode,
    getSculptMode: () => sculptMode,
    subdivideSelected,
    onSculpt: (fn) => {
      onSculpt = fn;
    },
    setMeshTool,
    getMeshTool: () => meshTool,
    onMeshEdit: (fn) => {
      onMeshEdit = fn;
    },
    hideSelected,
    unhideAll,
    setPieceHidden,
    isPieceHidden: (id) => hiddenIds.has(id),
    hiddenCount: () => hiddenIds.size,
    getMeasuredMm,
    setMode: (mode) => {
      if (!["translate", "rotate", "scale"].includes(mode)) return editMode;
      if (cadTool) setCadTool(null);
      if (sculptMode) setSculptMode(null);
      if (meshTool) setMeshTool(null);
      editMode = mode;
      transform.setMode(mode);
      if (selected) transform.attach(selected);
      return editMode;
    },
    getMode: () => editMode,
    setSnap: (on) => {
      snapOn = Boolean(on);
      applySnap();
      return snapOn;
    },
    getSnap: () => snapOn,
  };
}

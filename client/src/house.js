/**
 * Lab → House: a room photo, measurements and a budget become a placement
 * plan. Photo + measurements sit in the Lab rails with the bench. The
 * #ar-photo id is retained as the room-photo overlay for compatibility.
 *
 * After a table is popped into the photo, the house regenerates as a real 3D
 * scene on #room-scene: the floor plane is textured from the photo, the walls
 * are boxes sized by the vanishing-line/aspect heuristic in photogram.js, and
 * the reconstructed/scanned furniture lands inside. Known width/depth scales
 * the room mesh to metres.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  assignSurfaces,
  cropRegion,
  estimateHorizon,
  frameRoomCamera,
  lumaRows,
  overlayFloorFromHorizon,
  overlayFootprintPx,
  placeFurniture,
  wallBoxes,
} from "./photogram.js";
import { knownObject, resolveRoomScale } from "./frame-scale.js";
import { GENERIC_SIDE_TABLE_M, makeGenericSideTable } from "./generic-table.js";
import { grabVideoFrames } from "./video-frames.js";
import { qrSvg } from "./qr.js";
import {
  fitModelToRoom,
  modelEnvelope,
  scenePlanSource,
} from "./scene-refit.js";
import {
  createOccupancyGrid,
  detectDesignIssues,
  mergeFrameOccupancy,
  reconcileFurniturePlacement,
  stampFootprint,
  tableModelFromComponents,
} from "./room-intelligence.js";

const $ = (id) => document.getElementById(id);

function money(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "";
  return `$${value % 1 ? value.toFixed(2) : value}`;
}

function readNumber(id, fallback) {
  const value = Number($(id)?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function footprintOf(plan) {
  const pick = plan?.pick || {};
  const place = plan?.ordered?.[0] || {};
  const overlay = plan?.overlay || {};
  const dims = pick.dimsMm || {};
  return {
    w: overlay.widthM || place.widthM || pick.footprintM?.w || GENERIC_SIDE_TABLE_M.w,
    d: overlay.depthM || place.depthM || pick.footprintM?.d || GENERIC_SIDE_TABLE_M.d,
    h: overlay.heightM || place.heightM || pick.footprintM?.h || GENERIC_SIDE_TABLE_M.h,
  };
}

function sizeCanvas(canvas) {
  const host = canvas.parentElement || canvas;
  const rect = host.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round((rect.width || 900) * dpr));
  const height = Math.max(200, Math.round((rect.height || 560) * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function drawPhoto(ctx, photo, width, height) {
  ctx.fillStyle = "#d8d4cc";
  ctx.fillRect(0, 0, width, height);
  const sourceWidth = photo.videoWidth || photo.naturalWidth || photo.width;
  const sourceHeight = photo.videoHeight || photo.naturalHeight || photo.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const dw = sourceWidth * scale;
  const dh = sourceHeight * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.drawImage(photo, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

function drawEmptyRoom(ctx, width, height, room) {
  ctx.fillStyle = "#8a9aaa";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#c5b7a0";
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.94);
  ctx.lineTo(width * 0.46, height * 0.4);
  ctx.lineTo(width * 0.96, height * 0.94);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#9aa8b6";
  ctx.fillRect(0, 0, width, height * 0.42);
  ctx.fillStyle = "rgba(17, 17, 17, 0.55)";
  ctx.font = `${Math.round(height * 0.032)}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(`${room.widthM} m × ${room.depthM} m`, width * 0.06, height * 0.08);
  return { x: width * 0.08, y: height * 0.42, w: width * 0.84, h: height * 0.5 };
}

// Lens atmosphere over the room photo: a depth-ish gradient that cools the
// far (top) edge plus a light vignette. Plain 2D gradients painted once per
// event-driven redraw — there is no animation loop here, so nothing flickers.
function applyAtmosphere(ctx, width, height) {
  const depth = ctx.createLinearGradient(0, 0, 0, height);
  depth.addColorStop(0, "rgba(22, 28, 36, 0.16)");
  depth.addColorStop(0.55, "rgba(22, 28, 36, 0)");
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, width, height);
  const radius = Math.hypot(width, height) / 2;
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, radius * 0.55,
    width / 2, height / 2, radius,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

// A soft elliptical blob under the piece so it sits on the photo floor
// instead of floating over it — the 2D twin of the Lab's contact shadow.
function drawContactShadow(ctx, cx, cy, radius) {
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, "rgba(14, 17, 21, 0.32)");
  grad.addColorStop(1, "rgba(14, 17, 21, 0)");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.36);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function shade(hex, amount = -22) {
  const raw = String(hex || "#f3efe6").replace("#", "");
  if (raw.length < 6) return "#d8c7a1";
  const n = (i) => Math.max(0, Math.min(255, parseInt(raw.slice(i, i + 2), 16) + amount));
  return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
}

function drawPiece(ctx, plan, floor) {
  const room = plan.room || { widthM: 3.2, depthM: 3.8 };
  const place = plan.ordered?.[0] || { x: room.widthM * 0.35, z: room.depthM * 0.25 };
  const foot = footprintOf(plan);
  const color = plan.overlay?.color || plan.pick?.color || "#f3efe6";
  const shape = plan.overlay?.shape || plan.pick?.shape || "table";

  const nx = Math.min(0.92, Math.max(0.04, place.x / room.widthM));
  const nz = Math.min(0.92, Math.max(0.04, place.z / room.depthM));
  const sized = overlayFootprintPx(foot, floor, room);
  const topW = sized.topW;
  const topD = sized.topD;
  const height = sized.height;
  const x = floor.x + nx * floor.w;
  const y = floor.y + nz * floor.h;
  const skew = topD * 0.45;

  ctx.save();
  const legDrop = shape !== "slab" ? height : 0;
  drawContactShadow(ctx, x + topW / 2 - skew / 2, y + topD * 0.85 + legDrop, Math.max(topW, topD) * 0.72);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(17, 17, 17, 0.35)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + topW, y);
  ctx.lineTo(x + topW - skew, y + topD);
  ctx.lineTo(x - skew, y + topD);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (shape !== "slab") {
    ctx.fillStyle = shade(color, -28);
    const legW = Math.max(5, topW * 0.08);
    const legs = [
      [x + topW * 0.1, y + topD * 0.55],
      [x + topW * 0.72, y + topD * 0.55],
      [x + topW * 0.04 - skew * 0.15, y + topD * 0.85],
      [x + topW * 0.66 - skew, y + topD * 0.85],
    ];
    for (const [lx, ly] of legs) ctx.fillRect(lx, ly, legW, height);
  }

  ctx.fillStyle = "rgba(17, 17, 17, 0.78)";
  ctx.font = `${Math.max(11, Math.round(floor.h * 0.055))}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(plan.pick?.name || "piece", x - 4, y - 8);
  ctx.restore();
}

function notesFor(plan) {
  const place = plan.ordered?.[0];
  const cheaper = plan.cheaper || [];
  const lines = [
    `Pick: ${plan.pick?.name || "—"} ${money(plan.pick?.cost)}${plan.pick?.store ? ` (${plan.pick.store})` : ""}`,
  ];
  if (place) {
    lines.push(`Place at ${Number(place.x).toFixed(2)} × ${Number(place.z).toFixed(2)} m`);
    if (place.why) lines.push(place.why);
  }
  lines.push("", "CHEAPER FITS");
  if (cheaper.length) {
    lines.push(...cheaper.map((item) => `• ${item.name} ${money(item.cost)} save ${money(item.saved)}`));
  } else {
    lines.push("• No cheaper fit in this room and budget.");
  }
  if (plan.note) lines.push("", plan.note);
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function fmtMm(dims) {
  if (!dims) return "";
  const parts = [dims.x, dims.y, dims.z].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return parts.length ? `${parts.map((n) => Math.round(n)).join(" × ")} mm` : "";
}

function loadImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

/** Sample the photo's row luminance and find the wall/floor vanishing line. */
function horizonOf(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 48;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    return estimateHorizon(lumaRows(data, c.width, c.height));
  } catch {
    return 0.55;
  }
}

function occupancyEvidence(images = []) {
  return images
    .map((img) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 36;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const luma = new Uint8Array(canvas.width * canvas.height);
        for (let pixel = 0, source = 0; pixel < luma.length; pixel += 1, source += 4) {
          luma[pixel] = Math.round(rgba[source] * 0.299 + rgba[source + 1] * 0.587 + rgba[source + 2] * 0.114);
        }
        return { width: canvas.width, height: canvas.height, horizon: horizonOf(img), luma };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function initHouse({ api, hud = () => {}, onPhoto, onPlan, onScene, onRefit, getSelectedPart, getPieces, onAdd } = {}) {
  if (!api?.adapt) throw new Error("initHouse requires api.adapt");

  const photoInput = $("room-photo");
  const photosInput = $("room-photos");
  const adaptBtn = $("adapt-btn");
  const out = $("adapt-out");
  const scanBtn = $("scan-btn");
  const scanOut = $("scan-out");
  const viewBtn = $("house-view-btn");
  const refitOut = $("scene-refit-status");
  const issuesOut = $("design-issues");
  const canvas = $("ar-photo");
  const sceneCanvas = $("room-scene");
  if (!adaptBtn || !canvas) {
    return {
      applyPlan() {},
      createRoom() {},
      draw() {},
      setActive() {},
      hasPhoto: () => false,
      hasScene: () => false,
      rebuildHouse3d() {},
      applyRoomFrames() {},
      startPhoneWatch() {},
    };
  }

  let photo = null;
  let extraPhotos = [];
  let videoFrames = [];
  let lastPlan = null;
  let describedRoom = null;
  let currentSpace = "desk";
  let active = false;
  let view3d = false;
  let three = null;
  let roomTaps = [];
  let lastPhotoRect = null;
  let modelPlacement = null;
  let lastRefit = null;
  let currentIssues = [];
  let captureRevision = 0;

  function allPhotos() {
    const list = [...videoFrames, photo, ...extraPhotos].filter(Boolean);
    return list.filter((img, i) => list.indexOf(img) === i);
  }

  function markPhoto() {
    $("app")?.classList.toggle("has-room-photo", allPhotos().length > 0);
  }

  function draw(plan = lastPlan) {
    const ctx = canvas.getContext("2d");
    const { width, height } = sizeCanvas(canvas);
    const room = plan?.room || {
      widthM: readNumber("room-w", 3.2),
      depthM: readNumber("room-d", 3.8),
    };
    const backdrop = photo || extraPhotos[0];
    const photoRect = backdrop ? drawPhoto(ctx, backdrop, width, height) : drawEmptyRoom(ctx, width, height, room);
    lastPhotoRect = photoRect;
    const horizon = backdrop ? horizonOf(backdrop) : 0.55;
    const floor = backdrop ? overlayFloorFromHorizon(photoRect, horizon) : photoRect;
    if (plan?.ordered?.[0]) drawPiece(ctx, plan, floor);
    if (roomTaps.length && photoRect) {
      ctx.fillStyle = "#7ac7b7";
      ctx.strokeStyle = "#7ac7b7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const point of roomTaps) {
        ctx.lineTo(photoRect.x + point.nx * photoRect.w, photoRect.y + point.ny * photoRect.h);
      }
      if (roomTaps.length > 1) ctx.stroke();
      for (const point of roomTaps) {
        ctx.beginPath();
        ctx.arc(photoRect.x + point.nx * photoRect.w, photoRect.y + point.ny * photoRect.h, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    applyAtmosphere(ctx, width, height);
    if (!view3d) canvas.classList.remove("hidden");
  }

  /* ------------------------------------------------ the regenerated house */

  function ensureThree() {
    if (three || !sceneCanvas) return three;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14181e);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.02, 80);
    const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneCanvas.style.touchAction = "none";
    const orbit = new OrbitControls(camera, sceneCanvas);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.enablePan = true;
    orbit.screenSpacePanning = true;
    orbit.enableRotate = true;
    orbit.enableZoom = true;
    orbit.rotateSpeed = 0.72;
    orbit.panSpeed = 0.7;
    orbit.zoomSpeed = 1.05;
    orbit.minPolarAngle = 0.18;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 0.85;
    orbit.maxDistance = 22;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2c2c34, 1.05));
    const sun = new THREE.DirectionalLight(0xfff2df, 1.1);
    sun.position.set(3, 6, 2);
    scene.add(sun);
    const roomGroup = new THREE.Group();
    const furnitureGroup = new THREE.Group();
    scene.add(roomGroup, furnitureGroup);
    const transform = new TransformControls(camera, sceneCanvas);
    transform.setMode("translate");
    transform.setTranslationSnap(0.05);
    transform.showY = false;
    scene.add(transform.getHelper());
    three = {
      scene,
      camera,
      renderer,
      orbit,
      roomGroup,
      furnitureGroup,
      transform,
      modelRoot: null,
      model: null,
      obstacles: [],
      occupancy: null,
      remainingOccupancy: null,
      occupancyKey: "",
      dragFootprint: null,
      raf: 0,
      built: false,
      room: null,
      framedKey: "",
      keys: { w: 0, a: 0, s: 0, d: 0, q: 0, e: 0 },
      lastTick: 0,
    };
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !event.value;
      if (event.value) {
        three.dragFootprint = three.model ? { ...three.model } : null;
        return;
      }
      commitModelRefit();
    });
    bindWalkKeys();
    return three;
  }

  function sizeScene() {
    if (!three) return;
    const host = sceneCanvas.parentElement || sceneCanvas;
    const rect = host.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 900));
    const height = Math.max(200, Math.round(rect.height || 560));
    three.renderer.setSize(width, height, false);
    three.camera.aspect = width / height;
    three.camera.updateProjectionMatrix();
  }

  function bindWalkKeys() {
    const codeMap = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyQ: "q", KeyE: "e" };
    const onKey = (ev, down) => {
      if (!active || !view3d || !three?.built) return;
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
      const axis = codeMap[ev.code];
      if (axis) {
        three.keys[axis] = down ? 1 : 0;
        ev.preventDefault();
        return;
      }
      if (down && ev.code === "Space") {
        if (three.room) applyFrame(three.room, true);
        ev.preventDefault();
      }
    };
    window.addEventListener("keydown", (ev) => onKey(ev, true));
    window.addEventListener("keyup", (ev) => onKey(ev, false));
  }

  function walkStep(dt) {
    if (!three?.built || !view3d) return;
    const { w, a, s, d, q, e } = three.keys;
    if (!(w || a || s || d || q || e)) return;
    const speed = 1.7 * Math.min(0.08, dt);
    const forward = new THREE.Vector3();
    three.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    else forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    move.addScaledVector(forward, w - s);
    move.addScaledVector(right, d - a);
    move.y += e - q;
    if (move.lengthSq() < 1e-8) return;
    move.normalize().multiplyScalar(speed);
    const room = three.room || { widthM: 3.2, depthM: 3.8, heightM: 2.7 };
    const next = three.camera.position.clone().add(move);
    // The front wall is open, so walk can circle the house — not only the interior.
    next.x = Math.min(room.widthM + 1.4, Math.max(-1.4, next.x));
    next.y = Math.min(room.heightM + 0.45, Math.max(0.35, next.y));
    next.z = Math.min(room.depthM + 2.4, Math.max(-0.6, next.z));
    const delta = next.sub(three.camera.position);
    three.camera.position.add(delta);
    three.orbit.target.add(delta);
    three.orbit.target.y = Math.min(room.heightM * 0.8, Math.max(0.1, three.orbit.target.y));
  }

  function applyFrame(room, force = false) {
    if (!three || !room) return;
    const key = `${room.widthM}:${room.depthM}:${room.heightM}`;
    if (!force && three.framedKey === key) return;
    const pose = frameRoomCamera(room);
    three.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    three.orbit.target.set(pose.target.x, pose.target.y, pose.target.z);
    three.orbit.minDistance = pose.minDistance;
    three.orbit.maxDistance = pose.maxDistance;
    three.orbit.minPolarAngle = 0.18;
    three.orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    three.camera.near = 0.05;
    three.camera.far = 80;
    three.camera.updateProjectionMatrix();
    three.orbit.update();
    three.framedKey = key;
  }

  function startLoop() {
    if (!three || three.raf) return;
    three.lastTick = performance.now();
    const tick = (now) => {
      three.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - three.lastTick) / 1000 || 0.016);
      three.lastTick = now;
      walkStep(dt);
      three.orbit.update();
      three.renderer.render(three.scene, three.camera);
    };
    tick(performance.now());
  }

  function stopLoop() {
    if (three?.raf) cancelAnimationFrame(three.raf);
    if (three) three.raf = 0;
  }

  function clearGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse?.((node) => {
        node.geometry?.dispose?.();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          material?.map?.dispose?.();
          material?.dispose?.();
        }
      });
    }
  }

  function textureFrom(img, region, horizon) {
    const crop = cropRegion(region, horizon);
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    ctx.drawImage(
      img,
      crop.x * img.width,
      crop.y * img.height,
      Math.max(1, crop.w * img.width),
      Math.max(1, crop.h * img.height),
      0,
      0,
      c.width,
      c.height,
    );
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function surfaceMaterial(surface, surfaces, imgs, horizon, fallbackColor) {
    const pick = surfaces[surface];
    const img = pick ? imgs[pick.photo] : null;
    if (img) {
      return new THREE.MeshStandardMaterial({ map: textureFrom(img, pick.region, horizon), roughness: 0.9 });
    }
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(fallbackColor), roughness: 0.94 });
  }

  function furnitureMesh(item) {
    const g = new THREE.Group();
    if (item.positions instanceof Float32Array && item.positions.length >= 9) {
      // The scanned visual hull is already metres, centred on its own origin.
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(item.color || "#d8c7a1"),
        roughness: 0.62,
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(item.positions.slice(), 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.y = item.h / 2;
      g.add(mesh);
    } else if (item.shape === "slab" || item.h <= 0.12) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(item.color || "#ecdfc6"),
        roughness: 0.5,
      });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(item.w, Math.max(0.03, item.h), item.d), mat);
      slab.position.y = Math.max(0.03, item.h) / 2;
      g.add(slab);
    } else if (/post|dowel|leg/i.test(`${item.shape || ""} ${item.name || ""}`)) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(item.color || "#d8c7a1"),
        roughness: 0.62,
      });
      const post = new THREE.Mesh(
        item.shape === "dowel"
          ? new THREE.CylinderGeometry(Math.max(0.008, item.w / 2), Math.max(0.008, item.w / 2), item.h, 16)
          : new THREE.BoxGeometry(item.w, item.h, item.d),
        mat,
      );
      post.position.y = item.h / 2;
      g.add(post);
    } else {
      g.add(
        makeGenericSideTable(THREE, {
          w: item.w || GENERIC_SIDE_TABLE_M.w,
          d: item.d || GENERIC_SIDE_TABLE_M.d,
          h: item.h || GENERIC_SIDE_TABLE_M.h,
          color: item.color || "#ecdfc6",
        }),
      );
    }
    g.position.set(item.x, 0, item.z);
    g.userData.sceneItem = item;
    return g;
  }

  function modelComponentMesh(piece) {
    const item = {
      ...piece,
      w: piece.scaled?.w,
      d: piece.scaled?.d,
      h: piece.scaled?.h,
      x: 0,
      z: 0,
    };
    const component = furnitureMesh(item);
    component.position.set(piece.modelX, piece.modelY - (piece.scaled?.h || 0) / 2, piece.modelZ);
    component.rotation.set(Number(piece.rx) || 0, Number(piece.ry) || 0, Number(piece.rz) || 0);
    component.scale.set(1, 1, 1);
    component.userData.modelComponent = true;
    return component;
  }

  function renderDesignIssues(issues = currentIssues) {
    if (!issuesOut) return;
    if (!issues.length) {
      issuesOut.innerHTML = `<p class="hint">Add or place a modeled table to generate room-aware checks.</p>`;
      return;
    }
    issuesOut.innerHTML = issues
      .map(
        (issue) =>
          `<div class="design-issue ${escapeHtml(issue.level)}"><strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.message)}</span></div>`,
      )
      .join("");
  }

  function updateRefit(previous, current) {
    if (!three?.room || !current) return null;
    const obstacleKey = three.obstacles
      .map((item) => `${item.id}:${item.x}:${item.z}:${item.w}:${item.d}`)
      .sort()
      .join("|");
    const occupancyKey =
      `${three.room.widthM}:${three.room.depthM}:${captureRevision}:` +
      `${videoFrames.length}:${obstacleKey}`;
    const resetOccupancy = !three.occupancy || three.occupancyKey !== occupancyKey;
    if (resetOccupancy) {
      const base = createOccupancyGrid(three.room, { cellSize: 0.1, boundary: true });
      const merged = mergeFrameOccupancy(base, occupancyEvidence(videoFrames));
      for (const obstacle of three.obstacles) stampFootprint(merged.grid, obstacle, obstacle, 1);
      three.occupancy = merged.grid;
      three.remainingOccupancy = null;
      three.occupancyKey = occupancyKey;
    }
    const result = reconcileFurniturePlacement(
      three.occupancy,
      resetOccupancy ? null : previous,
      current,
      { clearance: 0.45, carveCurrentOnFirstFit: true },
    );
    three.occupancy = result.grid;
    three.remainingOccupancy = result.remaining;
    three.model = result.model;
    modelPlacement = { x: result.model.x, z: result.model.z };
    if (three.modelRoot) {
      three.modelRoot.position.set(result.model.x, 0, result.model.z);
      three.modelRoot.userData.sceneItem = result.model;
    }
    lastRefit = result;
    if (refitOut) {
      refitOut.textContent =
        `Binary removal cut ${result.removedCells} old cells · auto-fit ` +
        `${result.ok ? `placed at ${result.model.x.toFixed(2)} × ${result.model.z.toFixed(2)} m` : "kept the prior fit"} · ` +
        `${result.occupiedCells} occupied cells.`;
    }
    const table = tableModelFromComponents(getPieces?.() || []);
    currentIssues = detectDesignIssues({
      room: three.room,
      target: result.model,
      grid: result.remaining,
      model: table,
      door: three.room.door,
    }).map((issue) => ({
      type: issue.id,
      level: issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "info",
      title: issue.title,
      message: issue.detail,
    }));
    renderDesignIssues();
    onRefit?.({ model: { ...result.model }, room: { ...three.room }, issues: currentIssues, occupancy: result });
    return result;
  }

  function commitModelRefit() {
    if (!three?.modelRoot || !three.model || !three.room) return null;
    const proposed = {
      ...three.model,
      x: three.modelRoot.position.x,
      z: three.modelRoot.position.z,
    };
    const previous = three.dragFootprint || three.model;
    three.dragFootprint = null;
    const result = updateRefit(previous, proposed);
    const fitted = result.model;
    hud(
      `Moved the current table to ${fitted.x.toFixed(2)} × ${fitted.z.toFixed(2)} m. ` +
        `Old binary footprint removed and auto-fit; ${currentIssues.filter((issue) => issue.level !== "info").length} checks need review.`,
    );
    return result;
  }

  function buildModelRoot(envelope, room) {
    const start = fitModelToRoom(
      {
        ...envelope,
        x: modelPlacement?.x ?? room.widthM / 2,
        z: modelPlacement?.z ?? room.depthM / 2,
      },
      room,
    );
    const root = new THREE.Group();
    root.name = "current-table-model";
    root.userData.sceneItem = start;
    for (const piece of envelope.pieces || []) root.add(modelComponentMesh(piece));
    root.position.set(start.x, 0, start.z);
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.02, start.w), Math.max(0.02, start.d)),
      new THREE.MeshBasicMaterial({
        color: 0x56c8b5,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.003;
    marker.name = "binary-current-footprint";
    root.add(marker);
    return { root, model: start };
  }

  /** Rebuild the whole house as a 3D scene from the loaded photos. */
  function rebuildHouse3d() {
    const ctx3 = ensureThree();
    if (!ctx3) return null;
    const imgs = allPhotos();
    const primary = imgs[0] || null;
    const horizon = primary ? horizonOf(primary) : 0.55;
    const aspect = primary ? primary.width / Math.max(1, primary.height) : 4 / 3;
    const kind = $("room-scale-kind")?.value || "measure";
    const frame = primary
      ? { width: primary.width || primary.videoWidth || 800, height: primary.height || primary.videoHeight || 600, horizon }
      : { width: 800, height: 600, horizon };
    const tapPx = roomTaps.map((point) => ({ x: point.nx * frame.width, y: point.ny * frame.height }));
    const room = resolveRoomScale({
      kind,
      aspect,
      horizon,
      widthM:
        kind === "vanishing"
          ? 0
          : describedRoom?.widthM || lastPlan?.room?.widthM || readNumber("room-w", 0),
      depthM:
        kind === "vanishing"
          ? 0
          : describedRoom?.depthM || lastPlan?.room?.depthM || readNumber("room-d", 0),
      taps: tapPx,
      frame,
      knownId: $("room-known-object")?.value,
    });
    if (room.metric && (kind === "taps" || kind === "known" || kind === "known-object")) {
      if ($("room-w")) $("room-w").value = String(room.widthM);
      if ($("room-d")) $("room-d").value = String(room.depthM);
    }
    if (Number(describedRoom?.heightM) > 0) room.heightM = Number(describedRoom.heightM);
    if (describedRoom?.kind) room.kind = describedRoom.kind;

    const previousModel = ctx3.model ? { ...ctx3.model } : null;
    ctx3.transform.detach();
    clearGroup(ctx3.roomGroup);
    clearGroup(ctx3.furnitureGroup);
    const surfaces = assignSurfaces(imgs.length);

    const floorMat = surfaceMaterial(
      "floor",
      surfaces,
      imgs,
      horizon,
      describedRoom?.floorColor || "#c5b7a0",
    );
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.widthM, room.depthM), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.widthM / 2, 0, room.depthM / 2);
    ctx3.roomGroup.add(floor);

    for (const box of wallBoxes(room)) {
      if (box.side === "front") continue;
      const mat = surfaceMaterial(
        box.side,
        surfaces,
        imgs,
        horizon,
        describedRoom?.wallColor || "#9aa8b6",
      );
      mat.side = THREE.DoubleSide;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d), mat);
      wall.position.set(box.x, box.h / 2, box.z);
      ctx3.roomGroup.add(wall);
    }

    ctx3.room = room;
    const pieces = getPieces?.() || [];
    const placed = placeFurniture({ plan: lastPlan, pieces, room });
    const envelope = modelEnvelope(pieces);
    ctx3.obstacles = [];
    ctx3.modelRoot = null;
    ctx3.model = null;

    if (envelope) {
      const built = buildModelRoot(envelope, room);
      ctx3.modelRoot = built.root;
      ctx3.model = built.model;
      ctx3.furnitureGroup.add(built.root);
      for (const item of placed.filter((candidate) => candidate.source === "plan" || candidate.source === "scan")) {
        ctx3.obstacles.push(item);
        ctx3.furnitureGroup.add(furnitureMesh(item));
      }
    } else {
      const [primary, ...rest] = placed;
      if (primary) {
        const fitted = fitModelToRoom(
          {
            ...primary,
            x: modelPlacement?.x ?? primary.x,
            z: modelPlacement?.z ?? primary.z,
          },
          room,
        );
        const root = furnitureMesh({ ...fitted, x: 0, z: 0 });
        root.position.set(fitted.x, 0, fitted.z);
        root.name = "current-table-model";
        ctx3.modelRoot = root;
        ctx3.model = fitted;
        ctx3.furnitureGroup.add(root);
      }
      for (const item of rest) {
        ctx3.obstacles.push(item);
        ctx3.furnitureGroup.add(furnitureMesh(item));
      }
    }

    if (ctx3.modelRoot) {
      modelPlacement = { x: ctx3.model.x, z: ctx3.model.z };
      ctx3.transform.attach(ctx3.modelRoot);
      updateRefit(previousModel, ctx3.model);
    } else {
      currentIssues = [];
      renderDesignIssues();
      if (refitOut) refitOut.textContent = "Place a table to create a binary room footprint.";
    }
    applyFrame(room);
    ctx3.built = true;
    return room;
  }

  function showScene() {
    if (!three?.built) rebuildHouse3d();
    if (!three?.built) return null;
    view3d = true;
    syncViews();
    onScene?.(three.room);
    return three.room;
  }

  function syncViews() {
    const showScene = active && view3d && Boolean(three?.built);
    sceneCanvas?.classList.toggle("hidden", !showScene);
    canvas.classList.toggle("hidden", !active || showScene);
    if (viewBtn) {
      viewBtn.classList.toggle("hidden", !(three?.built || allPhotos().length));
      viewBtn.textContent = view3d && three?.built ? "Back to the photo" : "View the 3D house";
    }
    if (showScene) {
      sizeScene();
      startLoop();
    } else {
      stopLoop();
      if (active) {
        draw(lastPlan);
      }
    }
  }

  function writeNotes(plan) {
    if (out) out.textContent = notesFor(plan);
  }

  function applyPlan(plan) {
    if (!plan?.pick) return;
    lastPlan = plan;
    writeNotes(plan);
    draw(plan);
    // The table has been popped into the photo — regenerate the house in 3D.
    if (allPhotos().length) {
      const room = rebuildHouse3d();
      if (room) {
        view3d = true;
        syncViews();
        hud(
          `Rebuilt the house in 3D — ${room.widthM} × ${room.depthM} m${
            room.metric ? " (your measurements)" : " (from the photo)"
          }, walls ${room.heightM} m.`,
        );
      }
    } else if (three?.built) {
      rebuildHouse3d();
      syncViews();
    }
  }

  function createRoom(description = {}) {
    const numberOr = (value, fallback) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : fallback;
    };
    describedRoom = {
      kind: String(description.kind || "room"),
      widthM: numberOr(description.widthM, readNumber("room-w", 4.2)),
      depthM: numberOr(description.depthM, readNumber("room-d", 3.8)),
      heightM: numberOr(description.heightM, 2.7),
      wallColor: description.wallColor || "#d6d2c8",
      floorColor: description.floorColor || "#b89c78",
    };
    if ($("room-w")) $("room-w").value = String(describedRoom.widthM);
    if ($("room-d")) $("room-d").value = String(describedRoom.depthM);
    lastPlan = null;
    currentSpace = "house";
    active = true;
    const room = rebuildHouse3d();
    if (room) applyFrame(room, true);
    view3d = Boolean(room);
    syncViews();
    return room;
  }

  const ROOM_VIDEO_MAX_SECONDS = 30;
  let phonePoll = 0;
  let lastRoomVideoId = "";
  let phoneWatchBusy = false;

  function paintPhoneLink(lan) {
    const link = $("scan-phone-url");
    const note = $("scan-phone-status");
    const qr = $("scan-phone-qr");
    const url = lan?.url || lan?.urls?.[0] || "";
    if (link) {
      if (url) {
        link.textContent = url;
        link.href = url;
      } else {
        link.textContent = "Connect this computer to Wi-Fi, then tap Send from phone.";
        link.removeAttribute("href");
      }
    }
    if (qr) qr.innerHTML = url ? qrSvg(url) : "";
    if (note && !lastRoomVideoId) {
      note.textContent = url
        ? "Same Wi‑Fi. Scan the QR or open the link, record ~30s of the room, then send."
        : "No LAN address yet — join the same Wi-Fi as this computer.";
    }
  }

  async function applyRoomFrames(files) {
    const imgs = [];
    for (const file of files || []) {
      const img = await loadImage(file);
      if (img) imgs.push(img);
    }
    if (!imgs.length) return null;
    videoFrames = imgs.slice(0, 24);
    captureRevision += 1;
    if (!photo) photo = videoFrames[0];
    markPhoto();
    onPhoto?.(videoFrames[0]);
    const room = rebuildHouse3d();
    if (room) {
      view3d = true;
      syncViews();
      onScene?.(room);
      hud(
        `Pulled ${videoFrames.length} frames from the 30s phone video — rebuilt ${room.widthM} × ${room.depthM} m.`,
      );
    } else {
      draw(lastPlan);
      syncViews();
      hud(`Loaded ${videoFrames.length} frames from the phone video.`);
    }
    const note = $("scan-phone-status");
    if (note) note.textContent = `${videoFrames.length} frames from the phone clip — room rebuilt locally.`;
    return room;
  }

  async function tickPhoneUpload() {
    if (!api?.lan || phoneWatchBusy) return;
    phoneWatchBusy = true;
    try {
      const lan = await api.lan();
      paintPhoneLink(lan);
      const meta = await api.roomVideoMeta();
      if (!meta?.ready || meta.kind !== "video" || !meta.id || meta.id === lastRoomVideoId) return;
      lastRoomVideoId = meta.id;
      const blob = await api.roomVideoFile();
      const url = URL.createObjectURL(blob);
      try {
        const grabbed = await grabVideoFrames(url, {
          count: 24,
          maxSide: 720,
          maxDurationSec: ROOM_VIDEO_MAX_SECONDS,
        });
        await applyRoomFrames(grabbed.files);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      // Poll is best-effort; a missing clip is not an error.
    } finally {
      phoneWatchBusy = false;
    }
  }

  function stopPhoneWatch() {
    if (phonePoll) clearInterval(phonePoll);
    phonePoll = 0;
  }

  function startPhoneWatch() {
    if (phonePoll) return;
    tickPhoneUpload();
    phonePoll = setInterval(tickPhoneUpload, 2000);
  }

  $("scan-phone-link")?.addEventListener("click", () => {
    $("scan-phone-card")?.classList.remove("hidden");
    startPhoneWatch();
    hud("Send from phone — same Wi‑Fi, record ~30s walking the room.");
  });

  function setSpace(space) {
    currentSpace = space;
    active = space === "house";
    markPhoto();
    if (space === "house") {
      if (!three?.built && allPhotos().length) rebuildHouse3d();
      view3d = Boolean(three?.built);
      startPhoneWatch();
    } else {
      stopPhoneWatch();
    }
    syncViews();
  }

  function setActive(on) {
    setSpace(on ? "house" : "desk");
  }

  async function adaptRoom() {
    const widthM = readNumber("room-w", 3.2);
    const depthM = readNumber("room-d", 3.8);
    const budget = readNumber("room-budget", 40);
    const photoName = photoInput?.files?.[0]?.name || (photo ? "room.jpg" : "room.jpg");
    if (out) out.textContent = "Measuring the room…";
    hud("Measuring the room…");
    try {
      const plan = await api.adapt({
        widthM,
        depthM,
        budget,
        want: "table",
        photoName,
      });
      applyPlan(plan);
      onPlan?.(plan);
      if (!allPhotos().length) hud(`Placed ${plan.pick?.name || "a table"} in the room.`);
    } catch (err) {
      const message = err?.message || "Could not place a piece in this room.";
      if (out) out.textContent = message;
      hud(message);
    }
  }

  adaptBtn.addEventListener("click", () => {
    adaptRoom();
  });

  function readScanBody() {
    const budget = readNumber("room-budget", 40);
    const part = getSelectedPart?.();
    if (part?.dimsMm && (Number(part.dimsMm.x) > 0 || Number(part.dimsMm.y) > 0)) {
      return {
        source: "piece",
        partId: part.id,
        name: part.name,
        dimsMm: { x: part.dimsMm.x, y: part.dimsMm.y, z: part.dimsMm.z },
        budget,
        want: "table",
      };
    }
    return {
      source: "room",
      widthM: readNumber("room-w", 3.2),
      depthM: readNumber("room-d", 3.8),
      budget,
      want: "table",
    };
  }

  function renderScan(result) {
    if (!scanOut) return;
    const suggestions = result?.suggestions || [];
    const scanned = result?.scanned || {};
    const headline = escapeHtml(result?.headline || "you could end up with this");
    const where =
      scanned.source === "piece"
        ? `Scan of the selected piece · ${escapeHtml(scanned.mm || fmtMm(scanned.dimsMm))}`
        : `Scan of the room · ${escapeHtml(scanned.mm || fmtMm(scanned.dimsMm))}`;
    const items = suggestions
      .map((item) => {
        const mm = escapeHtml(item.mm || fmtMm(item.dimsMm));
        const price = money(item.cost ?? item.price);
        return `<div class="item scan-item">
          <div class="scan-meta">
            <span>${escapeHtml(item.name)}</span>
            <small>${mm}${price ? ` · ${price}` : ""}</small>
          </div>
          <button type="button" data-add="${escapeHtml(item.id)}">Add to bench</button>
        </div>`;
      })
      .join("");
    scanOut.innerHTML = `<p class="scan-kicker">${headline}</p><p class="hint">${where}</p>${
      items || `<p class="hint">Nothing in the catalog fits these dimensions and budget.</p>`
    }`;
  }

  async function scanFits() {
    if (!api.scan) {
      hud("Scan is not wired.");
      return;
    }
    if (scanOut) scanOut.textContent = "Scanning the catalog…";
    hud("Scanning the catalog…");
    try {
      const result = await api.scan(readScanBody());
      renderScan(result);
      const first = result.suggestions?.[0];
      hud(first ? `You could end up with ${first.name}.` : "Nothing in the catalog fits.");
    } catch (err) {
      const message = err?.message || "Could not scan the catalog.";
      if (scanOut) scanOut.textContent = message;
      hud(message);
    }
  }

  scanBtn?.addEventListener("click", () => {
    $("lab-room") && ($("lab-room").open = true);
    scanFits();
  });

  scanOut?.addEventListener("click", async (ev) => {
    const id = ev.target.closest("[data-add]")?.dataset.add;
    if (!id) return;
    try {
      if (onAdd) await onAdd(id);
      else await api.add(id, { x: 0.25, y: 0.28, z: 0.1 });
      if (three?.built) rebuildHouse3d();
      hud(`Added to the bench.`);
    } catch (err) {
      hud(err?.message || "Could not add that piece.");
    }
  });

  viewBtn?.addEventListener("click", () => {
    if (!three?.built) {
      const room = rebuildHouse3d();
      if (!room) return hud("Add a room photo first.");
    }
    view3d = !view3d;
    syncViews();
    if (view3d) {
      onScene?.(three.room);
      syncViews();
      hud("The house in 3D — drag to orbit, scroll to zoom, WASD to walk, Space to frame.");
    } else {
      hud("Back to the photo overlay.");
    }
  });

  photoInput?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const img = await loadImage(file);
    if (!img) return;
    photo = img;
    markPhoto();
    onPhoto?.(img);
    draw(lastPlan);
    if (three?.built) {
      rebuildHouse3d();
    }
    syncViews();
  });

  photosInput?.addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 6);
    if (!files.length) return;
    const imgs = (await Promise.all(files.map(loadImage))).filter(Boolean);
    if (!imgs.length) return;
    extraPhotos = imgs;
    if (!photo) photo = imgs[0];
    markPhoto();
    if (three?.built || lastPlan) rebuildHouse3d();
    onPhoto?.(imgs);
    syncViews();
    hud(`${allPhotos().length} room photo${allPhotos().length === 1 ? "" : "s"} ready for the 3D rebuild.`);
  });

  $("room-scale-kind")?.addEventListener("change", () => {
    const kind = $("room-scale-kind")?.value;
    const hint = $("room-scale-hint");
    if (hint) {
      if (kind === "taps") hint.textContent = "Click two points on the room photo that are 1 m apart.";
      else if (kind === "known") hint.textContent = "Click both ends of the known object on the photo.";
      else if (kind === "vanishing") hint.textContent = "Width and depth follow the vanishing line and photo aspect. Typed metres are ignored.";
      else hint.textContent = "Width and depth set metres. Otherwise the vanishing line, a known object, or two taps = 1 m on the photo.";
    }
    if (kind === "taps" || kind === "known") roomTaps = [];
    draw(lastPlan);
    if (three?.built) rebuildHouse3d();
  });

  canvas.addEventListener("click", (ev) => {
    const kind = $("room-scale-kind")?.value;
    if (kind !== "taps" && kind !== "known") return;
    if (view3d) return;
    const rect = canvas.getBoundingClientRect();
    const { width, height } = sizeCanvas(canvas);
    const x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * width;
    const y = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * height;
    const box = lastPhotoRect || { x: 0, y: 0, w: width, h: height };
    const nx = (x - box.x) / Math.max(1, box.w);
    const ny = (y - box.y) / Math.max(1, box.h);
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    roomTaps = [...roomTaps, { nx, ny }].slice(-2);
    draw(lastPlan);
    if (roomTaps.length === 2 && photo) {
      const room = rebuildHouse3d();
      const spec = kind === "known" ? knownObject($("room-known-object")?.value) : null;
      hud(
        room
          ? `Room scale ${room.widthM} × ${room.depthM} m${spec ? ` from a ${spec.name}` : " from two taps = 1 m"}.`
          : "Add a room photo, then tap 1 m.",
      );
    }
  });

  window.addEventListener("resize", () => {
    const app = $("app");
    if (app?.dataset.mode !== "lab") return;
    if (app.dataset.lab !== "ar" && app.dataset.lab !== "house") return;
    if (view3d && three?.built) sizeScene();
    else draw(lastPlan);
  });

  function snapshot() {
    const occupiedCells = three?.occupancy?.cells?.reduce((sum, value) => sum + value, 0) || 0;
    return {
      room: three?.room ? { ...three.room } : null,
      model: three?.model
        ? {
            id: three.model.id,
            name: three.model.name,
            source: three.model.source,
            w: three.model.w,
            d: three.model.d,
            h: three.model.h,
            x: three.model.x,
            z: three.model.z,
            partCount: three.model.pieces?.length || 1,
          }
        : null,
      issues: currentIssues.map((issue) => ({ ...issue })),
      occupancy: {
        width: three?.occupancy?.width || 0,
        depth: three?.occupancy?.depth || 0,
        cellSizeM: three?.occupancy?.cellSize || 0,
        occupiedCells,
        removedCells: lastRefit?.removedCells || 0,
        removedAreaM2: lastRefit?.removedAreaM2 || 0,
      },
      capture: {
        source: videoFrames.length ? "30-second LAN room video" : allPhotos().length ? "room photos" : "room dimensions",
        frameCount: videoFrames.length || allPhotos().length,
        maxSeconds: ROOM_VIDEO_MAX_SECONDS,
      },
    };
  }

  return {
    applyPlan,
    createRoom,
    draw,
    setActive,
    setSpace,
    showScene,
    hasPhoto: () => allPhotos().length > 0,
    hasScene: () => Boolean(three?.built),
    rebuildHouse3d,
    applyRoomFrames,
    startPhoneWatch,
    snapshot,
    planSource: () => scenePlanSource(snapshot()),
  };
}

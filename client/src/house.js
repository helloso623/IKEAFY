/**
 * Lab → House: a room photo, measurements and a budget become a placement
 * plan. Photo + measurements sit in the Lab rails with the bench. AR owns
 * #ar-photo as the room-camera overlay.
 *
 * After a table is popped into the photo, the house regenerates as a real 3D
 * scene on #room-scene: the floor plane is textured from the photo, the walls
 * are boxes sized by the vanishing-line/aspect heuristic in photogram.js, and
 * the reconstructed/scanned furniture lands inside. Known width/depth scales
 * the room mesh to metres.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  assignSurfaces,
  cropRegion,
  estimateHorizon,
  frameRoomCamera,
  lumaRows,
  overlayFloorFromHorizon,
  overlayFootprintPx,
  placeFurniture,
  roomFromPhotos,
  wallBoxes,
} from "./photogram.js";
import { GENERIC_SIDE_TABLE_M, makeGenericSideTable } from "./generic-table.js";

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

export function initHouse({ api, hud = () => {}, onPhoto, onPlan, onScene, getSelectedPart, getPieces, onAdd } = {}) {
  if (!api?.adapt) throw new Error("initHouse requires api.adapt");

  const photoInput = $("room-photo");
  const photosInput = $("room-photos");
  const adaptBtn = $("adapt-btn");
  const out = $("adapt-out");
  const scanBtn = $("scan-btn");
  const scanOut = $("scan-out");
  const viewBtn = $("house-view-btn");
  const cameraVideo = $("ar-camera");
  const cameraBtn = $("ar-toggle");
  const cameraStatus = $("ar-status");
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
    };
  }

  let photo = null;
  let extraPhotos = [];
  let lastPlan = null;
  let describedRoom = null;
  let currentSpace = "desk";
  let active = false;
  let view3d = false;
  let three = null;
  let cameraStream = null;
  let cameraStart = null;
  let cameraOverlayRaf = 0;
  let burstRun = 0;
  let cameraRequestRun = 0;
  let cameraDenied = false;
  let capturedFrames = [];

  function allPhotos() {
    const list = [...capturedFrames, photo, ...extraPhotos].filter(Boolean);
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
    const live =
      cameraStream &&
      cameraVideo?.readyState >= (globalThis.HTMLMediaElement?.HAVE_CURRENT_DATA ?? 2);
    const backdrop = live ? cameraVideo : photo || capturedFrames.at(-1);
    const photoRect = backdrop ? drawPhoto(ctx, backdrop, width, height) : drawEmptyRoom(ctx, width, height, room);
    const horizon = backdrop ? horizonOf(backdrop) : 0.55;
    const floor = backdrop ? overlayFloorFromHorizon(photoRect, horizon) : photoRect;
    if (plan?.ordered?.[0]) drawPiece(ctx, plan, floor);
    applyAtmosphere(ctx, width, height);
    if (!view3d) canvas.classList.remove("hidden");
  }

  function setCameraStatus(message) {
    if (cameraStatus) cameraStatus.textContent = message;
    if (cameraBtn) {
      cameraBtn.textContent = cameraStream ? "AR off" : "AR on";
      cameraBtn.setAttribute("aria-pressed", String(Boolean(cameraStream)));
    }
  }

  function stopCameraOverlay() {
    if (cameraOverlayRaf) cancelAnimationFrame(cameraOverlayRaf);
    cameraOverlayRaf = 0;
  }

  function startCameraOverlay() {
    if (cameraOverlayRaf || !cameraStream || !active || view3d) return;
    const tick = () => {
      cameraOverlayRaf = 0;
      if (!cameraStream || !active || view3d) return;
      draw(lastPlan);
      cameraOverlayRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function frameFromCamera() {
    const sourceWidth = cameraVideo?.videoWidth || 0;
    const sourceHeight = cameraVideo?.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return null;
    const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
    const frame = document.createElement("canvas");
    frame.width = Math.max(16, Math.round(sourceWidth * scale));
    frame.height = Math.max(16, Math.round(sourceHeight * scale));
    frame.getContext("2d").drawImage(cameraVideo, 0, 0, frame.width, frame.height);
    return frame;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function captureBurst(count = 6) {
    const run = ++burstRun;
    capturedFrames = [];
    let room = null;
    for (let index = 0; index < count; index += 1) {
      if (run !== burstRun || !cameraStream) return;
      const frame = frameFromCamera();
      if (frame) {
        capturedFrames.push(frame);
        capturedFrames = capturedFrames.slice(-6);
        room = rebuildHouse3d();
        markPhoto();
        syncViews();
        setCameraStatus(`Capturing room ${capturedFrames.length}/${count}`);
      }
      if (index < count - 1) await wait(320);
    }
    if (!room || run !== burstRun) return;
    view3d = true;
    syncViews();
    onScene?.(room);
    setCameraStatus(`${capturedFrames.length} frames · 3D room ready`);
    hud(`Captured ${capturedFrames.length} room angles and rebuilt the 3D house with furniture.`);
  }

  function stopCamera({ quiet = false } = {}) {
    burstRun += 1;
    cameraRequestRun += 1;
    stopCameraOverlay();
    for (const track of cameraStream?.getTracks?.() || []) track.stop();
    cameraStream = null;
    cameraStart = null;
    if (cameraVideo) cameraVideo.srcObject = null;
    setCameraStatus(quiet ? "Camera off" : `${capturedFrames.length || 0} frames kept · camera off`);
  }

  async function startCamera({ explicit = false } = {}) {
    if (cameraStream) return cameraStream;
    if (cameraStart) return cameraStart;
    if (cameraDenied && !explicit) return null;
    if (!navigator.mediaDevices?.getUserMedia || !cameraVideo) {
      cameraDenied = true;
      setCameraStatus("Camera unavailable · use photo upload");
      return null;
    }
    cameraDenied = false;
    setCameraStatus("Opening camera…");
    const requestRun = ++cameraRequestRun;
    cameraStart = navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then(async (stream) => {
        if (requestRun !== cameraRequestRun || !active) {
          for (const track of stream.getTracks()) track.stop();
          return null;
        }
        cameraStream = stream;
        cameraVideo.srcObject = stream;
        await cameraVideo.play();
        view3d = false;
        syncViews();
        startCameraOverlay();
        setCameraStatus("Camera live · capturing room");
        void captureBurst();
        return stream;
      })
      .catch((err) => {
        if (requestRun !== cameraRequestRun) return null;
        cameraDenied = true;
        cameraStream = null;
        setCameraStatus("Camera blocked · use photo upload");
        hud(err?.message ? `Camera unavailable: ${err.message}` : "Camera unavailable — use room photos.");
        return null;
      })
      .finally(() => {
        if (requestRun === cameraRequestRun) cameraStart = null;
      });
    return cameraStart;
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
    orbit.minAzimuthAngle = -Math.PI * 0.72;
    orbit.maxAzimuthAngle = Math.PI * 0.72;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2c2c34, 1.05));
    const sun = new THREE.DirectionalLight(0xfff2df, 1.1);
    sun.position.set(3, 6, 2);
    scene.add(sun);
    const roomGroup = new THREE.Group();
    const furnitureGroup = new THREE.Group();
    scene.add(roomGroup, furnitureGroup);
    three = {
      scene,
      camera,
      renderer,
      orbit,
      roomGroup,
      furnitureGroup,
      raf: 0,
      built: false,
      room: null,
      framedKey: "",
      keys: { w: 0, a: 0, s: 0, d: 0, q: 0, e: 0 },
      lastTick: 0,
    };
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
    next.x = Math.min(room.widthM - 0.12, Math.max(0.12, next.x));
    next.y = Math.min(room.heightM - 0.2, Math.max(0.35, next.y));
    next.z = Math.min(room.depthM - 0.12, Math.max(0.12, next.z));
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
    return g;
  }

  /** Rebuild the whole house as a 3D scene from the loaded photos. */
  function rebuildHouse3d() {
    const ctx3 = ensureThree();
    if (!ctx3) return null;
    const imgs = allPhotos();
    const primary = imgs[0] || null;
    const horizon = primary ? horizonOf(primary) : 0.55;
    const aspect = primary ? primary.width / Math.max(1, primary.height) : 4 / 3;
    const room = roomFromPhotos({
      aspect,
      horizon,
      widthM: describedRoom?.widthM || lastPlan?.room?.widthM || readNumber("room-w", 0),
      depthM: describedRoom?.depthM || lastPlan?.room?.depthM || readNumber("room-d", 0),
    });
    if (Number(describedRoom?.heightM) > 0) room.heightM = Number(describedRoom.heightM);
    if (describedRoom?.kind) room.kind = describedRoom.kind;

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

    for (const item of placeFurniture({ plan: lastPlan, pieces: getPieces?.() || [], room })) {
      ctx3.furnitureGroup.add(furnitureMesh(item));
    }

    applyFrame(room);
    ctx3.built = true;
    ctx3.room = room;
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
      stopCameraOverlay();
      sizeScene();
      startLoop();
    } else {
      stopLoop();
      if (active) {
        draw(lastPlan);
        startCameraOverlay();
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

  function setSpace(space) {
    currentSpace = space;
    active = space === "ar" || space === "house";
    markPhoto();
    if (space === "house") {
      stopCamera({ quiet: true });
      if (!three?.built && allPhotos().length) rebuildHouse3d();
      view3d = Boolean(three?.built);
    }
    syncViews();
    if (space === "ar") void startCamera();
    else if (space !== "house") stopCamera({ quiet: true });
  }

  function setActive(on) {
    setSpace(on ? "ar" : "desk");
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

  cameraBtn?.addEventListener("click", () => {
    if (currentSpace !== "ar") {
      document.querySelector('#lab-spaces [data-lab="ar"]')?.click();
      return;
    }
    if (cameraStream) stopCamera();
    else void startCamera({ explicit: true });
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

  window.addEventListener("resize", () => {
    const app = $("app");
    if (app?.dataset.mode !== "lab") return;
    if (app.dataset.lab !== "ar" && app.dataset.lab !== "house") return;
    if (view3d && three?.built) sizeScene();
    else draw(lastPlan);
  });

  return {
    applyPlan,
    createRoom,
    draw,
    setActive,
    setSpace,
    showScene,
    hasPhoto: () => allPhotos().length > 0,
    hasScene: () => Boolean(three?.built),
    cameraFrameCount: () => capturedFrames.length,
    rebuildHouse3d,
  };
}

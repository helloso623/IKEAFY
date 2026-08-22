/**
 * House — the room photos rebuilt as a real walkable 3D scene.
 *
 * room-builder.js decides the model (sizes, colours, which photo dresses
 * which wall); this file only turns that model into meshes. Walls are
 * single-sided and face into the room, so orbiting around the outside
 * gives the classic dollhouse cutaway: the near walls drop away and you
 * look straight in. Wall photo bands (above the horizon) become the wall
 * textures; the floor band tiles the floor.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { wallPlacements } from "./room-builder.js";

function stdMat(opts) {
  return new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.03, ...opts });
}

function plankTexture(hex, planks = 9) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  const plankH = 256 / planks;
  for (let i = 0; i < planks; i += 1) {
    const y = i * plankH;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.04 + (i % 3) * 0.02})`;
    ctx.fillRect(0, y, 256, 1.6);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(((i * 83) % 256), y + 2, 40, plankH - 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function canvasTexture(source, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(source);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function labelSprite(text, heightM = 0.14) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = '500 44px "IBM Plex Mono", monospace';
  ctx.font = font;
  const pad = 18;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 44 + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = "rgba(17, 17, 17, 0.82)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h * 0.3);
  ctx.fill();
  ctx.fillStyle = "#ffda1a";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(heightM * (w / h), heightM, 1);
  sprite.renderOrder = 4;
  return sprite;
}

function shade(hex, factor) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(factor);
}

function makeHouseTable(place) {
  const { widthM: w, depthM: d, heightM: h, color } = place;
  const g = new THREE.Group();
  const topH = Math.min(0.04, h * 0.12);
  const mat = stdMat({ color: new THREE.Color(color), roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, topH, d), mat);
  top.position.y = h - topH / 2;
  g.add(top);
  const legMat = stdMat({ color: shade(color, 0.82), roughness: 0.55 });
  const legW = Math.min(0.05, w * 0.1);
  const inset = Math.min(0.06, w * 0.1);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, h - topH, legW), legMat);
    leg.position.set(sx * (w / 2 - inset), (h - topH) / 2, sz * (d / 2 - inset));
    g.add(leg);
  }
  return g;
}

function makeHouseSlab(place) {
  const { widthM: w, depthM: d, heightM: h, color } = place;
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat({ color: new THREE.Color(color) }));
  slab.position.y = h / 2;
  g.add(slab);
  return g;
}

function furnitureMesh(place) {
  const body = place.shape === "table" ? makeHouseTable(place) : makeHouseSlab(place);
  body.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  const tag = labelSprite(place.name || "piece");
  tag.position.y = place.heightM + 0.22;
  body.add(tag);
  body.position.set(place.x, 0, place.z);
  body.rotation.y = place.yaw || 0;
  return body;
}

export function createHouseScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171a20);
  scene.fog = new THREE.Fog(0x171a20, 12, 34);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  camera.position.set(4.4, 3.2, 5.2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI * 0.52;
  orbit.minDistance = 0.8;
  orbit.maxDistance = 24;

  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x2c2c30, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const roomGroup = new THREE.Group();
  scene.add(roomGroup);
  const furnitureGroup = new THREE.Group();
  scene.add(furnitureGroup);

  let active = false;
  let rafId = 0;

  function disposeGroup(target) {
    target.traverse((child) => {
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.map?.dispose?.();
        mat.dispose?.();
      }
    });
    target.clear();
  }

  function buildRoom(model, textures) {
    const { widthM: w, depthM: d } = model.room;

    const floorMat = stdMat({ color: 0xffffff, roughness: 0.82 });
    if (textures?.floor) {
      floorMat.map = canvasTexture(textures.floor, Math.max(1, Math.round(w / 1.4)), Math.max(1, Math.round(d / 1.4)));
    } else {
      floorMat.map = plankTexture(model.floor.color);
      floorMat.map.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2)));
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0, d / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Ground apron so the room does not float in the void.
    const apron = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(w, d) * 1.9, 48),
      stdMat({ color: 0x20242c, roughness: 0.95 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(w / 2, -0.012, d / 2);
    roomGroup.add(apron);

    const skirtMat = stdMat({ color: 0xf2efe8, roughness: 0.5 });
    for (const spot of wallPlacements(model)) {
      const wall = model.walls.find((entry) => entry.id === spot.id);
      const mat = stdMat({ color: new THREE.Color(wall.color), roughness: 0.9 });
      const photoCanvas = wall.photoIndex >= 0 ? textures?.walls?.[wall.photoIndex] : null;
      if (photoCanvas) {
        mat.map = canvasTexture(photoCanvas);
        mat.color = new THREE.Color(0xffffff);
      }
      // Single-sided, facing the room: near walls vanish when you orbit past.
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spot.lengthM, spot.heightM), mat);
      mesh.position.set(spot.x, spot.heightM / 2, spot.z);
      mesh.rotation.y = spot.ry;
      mesh.receiveShadow = true;
      roomGroup.add(mesh);

      const skirting = new THREE.Mesh(new THREE.BoxGeometry(spot.lengthM, 0.09, 0.018), skirtMat.clone());
      skirting.position.set(spot.x, 0.045, spot.z);
      skirting.rotation.y = spot.ry;
      skirting.translateZ(0.012);
      roomGroup.add(skirting);
    }

    const dims = labelSprite(`${w.toFixed(1)} m × ${d.toFixed(1)} m`, 0.18);
    dims.position.set(w / 2, 0.12, d + 0.28);
    roomGroup.add(dims);
  }

  function frameRoom(model) {
    const { widthM: w, depthM: d, heightM: h } = model.room;
    const span = Math.max(w, d);
    orbit.target.set(w / 2, h * 0.32, d / 2);
    camera.position.set(w * 1.18, h * 1.5, d * 1.28 + span * 0.25);
    orbit.update();
  }

  function rebuild({ model, placements = [], textures = {} }) {
    disposeGroup(roomGroup);
    disposeGroup(furnitureGroup);
    buildRoom(model, textures);
    for (const place of placements) furnitureGroup.add(furnitureMesh(place));
    const { widthM: w, depthM: d, heightM: h } = model.room;
    sun.intensity = model.light.intensity;
    sun.position.set(w * 1.4, h * 2.4, -d * 0.6);
    sun.target.position.set(w / 2, 0, d / 2);
    scene.add(sun.target);
    frameRoom(model);
    return { walls: model.walls.length, placements: placements.length };
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 420;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function tick() {
    if (!active) return;
    orbit.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function setActive(on) {
    const next = Boolean(on);
    if (next === active) return;
    active = next;
    if (active) {
      resize();
      tick();
    } else {
      cancelAnimationFrame(rafId);
    }
  }

  window.addEventListener("resize", () => {
    if (active) resize();
  });

  return { rebuild, setActive, resize, isActive: () => active };
}

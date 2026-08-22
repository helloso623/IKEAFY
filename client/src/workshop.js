import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const MM = 0.001;
const PALE = "#eeeeee";

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
  let rain = [];
  let onSelect = () => {};

  function meshFor(piece, part) {
    const { x, y, z } = part.dimsMm;
    let geo;
    if (part.category === "cable") geo = new THREE.CylinderGeometry(0.002, 0.002, Math.max(x, y, z) * MM, 8);
    else if (part.id.includes("leg") || part.id.includes("dowel"))
      geo = new THREE.BoxGeometry(x * MM, z * MM, y * MM);
    else if (part.firmwareRole === "led") geo = new THREE.SphereGeometry(Math.max(x, y) * MM * 0.6, 12, 12);
    else geo = new THREE.BoxGeometry(x * MM, z * MM, y * MM);
    const color = new THREE.Color(part.color || piece.color || PALE);
    const birch = part.texture === "birch-foil";
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: part.texture === "metal" ? 0.25 : birch ? 0.55 : 0.7,
      metalness: part.material === "steel" ? 0.6 : birch ? 0.02 : 0.04,
      emissive: part.firmwareRole === "led" ? new THREE.Color(0x223344) : 0x000000,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { piece, part, ports: part.ports || [] };
    return mesh;
  }

  function poseMesh(mesh, piece, part) {
    mesh.position.set(piece.x, piece.y || (part.dimsMm.z * MM) / 2, piece.z);
    mesh.rotation.set(piece.rx || 0, piece.ry || 0, piece.rz || 0);
    mesh.scale.set(piece.sx || 1, piece.sy || 1, piece.sz || 1);
    if (piece.color) mesh.material.color.set(piece.color);
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
    cableGroup.clear();
    for (const cable of project.cables) {
      const a = meshes.get(cable.fromPiece);
      const b = meshes.get(cable.toPiece);
      if (!a || !b) continue;
      const curve = new THREE.CatmullRomCurve3([
        a.position.clone(),
        a.position.clone().lerp(b.position, 0.5).add(new THREE.Vector3(0, 0.06, 0)),
        b.position.clone(),
      ]);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, 0.002, 6, false),
        new THREE.MeshStandardMaterial({
          color: cable.locked ? 0x2f6f3a : 0xb6402a,
          roughness: 0.4,
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
      strip.position.copy(first.position).add(new THREE.Vector3(0, 0.03, 0));
      group.add(strip);
    }
  }

  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(group.children, false);
    if (!hits.length) return;
    const mesh = hits[0].object;
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
    fx.clear();
    rain = [];
    if (!on) return;
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
      const glow = new THREE.PointLight(0xff5522, 1.4, 2);
      glow.position.set(0.1, 0.4, 0.1);
      fx.add(glow);
    }
    if (opts.force) {
      const dir = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0.7, 0), 0.4, 0xffda1a);
      fx.add(dir);
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
    meshes.forEach((mesh) => {
      if (mesh.userData.part?.firmwareRole === "led") {
        mesh.material.emissive = new THREE.Color(on ? 0xffffaa : 0x223344);
        mesh.material.emissiveIntensity = on ? 2 : 0.2;
      }
    });
  }

  function tick() {
    orbit.update();
    if (simOn) {
      for (const drop of rain) {
        drop.position.y -= 0.04;
        if (drop.position.y < 0) drop.position.y = 1.2;
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
    explode,
    setLed,
    resize,
    onSelect: (fn) => {
      onSelect = fn;
    },
    getSelected: () => selected?.userData || null,
    getSelectedPose: () => {
      if (!selected) return null;
      return {
        id: selected.userData.piece.id,
        x: selected.position.x,
        y: selected.position.y,
        z: selected.position.z,
        ry: selected.rotation.y,
      };
    },
    setMode: (mode) => {
      transform.setMode(mode);
    },
  };
}

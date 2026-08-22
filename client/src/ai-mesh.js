import * as THREE from "three";

const MM = 0.001;
const DEFAULT_COLOR = "#c99a62";
const MAX_COMPONENTS = 128;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tuple(value, fallback) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => number(source[index], fallback[index]));
}

function sizeOf(component) {
  return tuple(component?.sizeMm, [300, 300, 300]).map((value) => Math.max(1, Math.abs(value)) * MM);
}

function segmentsOf(component, min = 3) {
  return Math.round(THREE.MathUtils.clamp(number(component?.segments, 32), min, 64));
}

function explicitGeometry(component) {
  const vertices = Array.isArray(component.verticesMm) ? component.verticesMm : [];
  const faces = Array.isArray(component.faces) ? component.faces : [];
  if (vertices.length < 3 || !faces.length) return null;
  const positions = [];
  for (const face of faces) {
    if (!Array.isArray(face) || face.length < 3) continue;
    const indices = face.slice(0, 3).map((entry) => Math.trunc(number(entry, -1)));
    if (indices.some((index) => index < 0 || index >= vertices.length)) continue;
    for (const index of indices) {
      const point = tuple(vertices[index], [0, 0, 0]);
      positions.push(point[0] * MM, point[1] * MM, point[2] * MM);
    }
  }
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function latheGeometry(component) {
  const profile = (Array.isArray(component.profileMm) ? component.profileMm : [])
    .slice(0, 96)
    .map((point) => new THREE.Vector2(Math.abs(number(point?.[0])) * MM, number(point?.[1]) * MM));
  if (profile.length < 2) return null;
  return new THREE.LatheGeometry(profile, segmentsOf(component));
}

function extrudeGeometry(component) {
  const outline = Array.isArray(component.outlineMm) ? component.outlineMm : [];
  if (outline.length < 3) return null;
  const shape = new THREE.Shape();
  outline.slice(0, 128).forEach((point, index) => {
    const x = number(point?.[0]) * MM;
    const z = number(point?.[1]) * MM;
    if (index) shape.lineTo(x, z);
    else shape.moveTo(x, z);
  });
  shape.closePath();
  for (const rawHole of (Array.isArray(component.holesMm) ? component.holesMm : []).slice(0, 12)) {
    if (!Array.isArray(rawHole) || rawHole.length < 3) continue;
    const hole = new THREE.Path();
    rawHole.slice(0, 64).forEach((point, index) => {
      const x = number(point?.[0]) * MM;
      const z = number(point?.[1]) * MM;
      if (index) hole.lineTo(x, z);
      else hole.moveTo(x, z);
    });
    hole.closePath();
    shape.holes.push(hole);
  }
  const [, height] = sizeOf(component);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: segmentsOf(component),
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function geometryFor(component) {
  const [width, height, depth] = sizeOf(component);
  const radial = segmentsOf(component);
  let geometry = null;
  if (component.shape === "box") {
    geometry = new THREE.BoxGeometry(width, height, depth);
  } else if (component.shape === "cylinder") {
    geometry = new THREE.CylinderGeometry(width / 2, width / 2, height, radial, 1, false);
    geometry.scale(1, 1, depth / Math.max(width, MM));
  } else if (component.shape === "cone") {
    geometry = new THREE.CylinderGeometry(0, width / 2, height, radial, 1, false);
    geometry.scale(1, 1, depth / Math.max(width, MM));
  } else if (component.shape === "sphere") {
    geometry = new THREE.SphereGeometry(0.5, radial, Math.max(6, Math.round(radial / 2)));
    geometry.scale(width, height, depth);
  } else if (component.shape === "torus") {
    const major = Math.max(MM, number(component.majorRadiusMm, width * 350) * MM);
    const tube = Math.max(MM / 2, number(component.tubeRadiusMm, height * 120) * MM);
    const arc = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(number(component.arcDeg, 360), 1, 360));
    geometry = new THREE.TorusGeometry(major, tube, Math.max(4, Math.round(radial / 3)), radial, arc);
    geometry.rotateX(Math.PI / 2);
  } else if (component.shape === "capsule") {
    const radius = Math.max(MM / 2, number(component.radiusMm, Math.min(width, depth) * 500) * MM);
    const length = Math.max(MM, number(component.lengthMm, Math.max(MM, height - radius * 2) / MM) * MM);
    geometry = new THREE.CapsuleGeometry(radius, length, Math.max(4, Math.round(radial / 4)), radial);
  } else if (component.shape === "lathe") {
    geometry = latheGeometry(component);
  } else if (component.shape === "extrude") {
    geometry = extrudeGeometry(component);
  } else if (component.shape === "mesh") {
    geometry = explicitGeometry(component);
  }
  if (!geometry) return null;
  geometry.center();
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

function transformFor(component) {
  const position = tuple(component.positionMm, [0, 0, 0]).map((value) => value * MM);
  const rotation = tuple(component.rotationDeg, [0, 0, 0]).map(THREE.MathUtils.degToRad);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, "XYZ")),
    new THREE.Vector3(1, 1, 1),
  );
}

function componentTriangles(component) {
  const geometry = geometryFor(component);
  if (!geometry) return null;
  geometry.applyMatrix4(transformFor(component));
  const attribute = geometry.getAttribute("position");
  if (!attribute || attribute.count < 3) {
    geometry.dispose();
    return null;
  }
  const positions = new Float32Array(attribute.array);
  const tint = new THREE.Color(/^#[\da-f]{6}$/i.test(String(component.color || "")) ? component.color : DEFAULT_COLOR);
  const colors = new Float32Array(attribute.count * 3);
  for (let index = 0; index < attribute.count; index += 1) {
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }
  geometry.dispose();
  return { positions, colors };
}

function combine(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Turn an AI mesh action into triangle soup for the existing editable bench.
 * Components can be compound primitives, turned/extruded profiles, or
 * explicit indexed triangles, so the wire contract is not tied to a catalog.
 */
export function buildAiMeshGeometry(spec = {}) {
  const bodies = (Array.isArray(spec.components) ? spec.components : [])
    .slice(0, MAX_COMPONENTS)
    .map(componentTriangles)
    .filter(Boolean);
  if (!bodies.length) throw new Error("The AI mesh did not contain any supported bodies.");
  const positions = combine(bodies.map((body) => body.positions));
  const colors = combine(bodies.map((body) => body.colors));
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.length; index += 3) {
    point.set(positions[index], positions[index + 1], positions[index + 2]);
    bounds.expandByPoint(point);
  }
  if (bounds.isEmpty()) throw new Error("The AI mesh has no finite bounds.");
  const center = bounds.getCenter(new THREE.Vector3());
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] -= center.x;
    positions[index + 1] -= center.y;
    positions[index + 2] -= center.z;
  }
  const size = bounds.getSize(new THREE.Vector3());
  return {
    positions,
    colors,
    triangleCount: positions.length / 9,
    dimensionsMm: {
      x: Math.max(1, Math.round(size.x / MM)),
      y: Math.max(1, Math.round(size.z / MM)),
      z: Math.max(1, Math.round(size.y / MM)),
    },
  };
}

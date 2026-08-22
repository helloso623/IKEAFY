const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

/**
 * Read a lightweight silhouette profile from the actual triangle positions.
 * Nothing is uploaded: only the resulting shape labels and dimensions are sent.
 */
export function analyzeMeshGeometry(positions = [], fallbackDims = {}) {
  const values = ArrayBuffer.isView(positions) ? positions : Array.isArray(positions) ? positions : [];
  let geometryHash = 2166136261;
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (let index = 0; index + 2 < values.length; index += 3) {
    const x = Number(values[index]);
    const y = Number(values[index + 1]);
    const z = Number(values[index + 2]);
    if (![x, y, z].every(Number.isFinite)) continue;
    for (const coordinate of [x, y, z]) {
      geometryHash ^= Math.round(coordinate * 1_000_000);
      geometryHash = Math.imul(geometryHash, 16777619);
    }
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  const hasBounds = Number.isFinite(bounds.minX);
  const width = hasBounds ? Math.max(1e-6, bounds.maxX - bounds.minX) : Math.max(1, finite(fallbackDims.x)) / 1000;
  const height = hasBounds ? Math.max(1e-6, bounds.maxY - bounds.minY) : Math.max(1, finite(fallbackDims.z)) / 1000;
  const depth = hasBounds ? Math.max(1e-6, bounds.maxZ - bounds.minZ) : Math.max(1, finite(fallbackDims.y)) / 1000;
  const centerX = hasBounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const centerZ = hasBounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const topRadii = [];
  const middleRadii = [];
  for (let index = 0; index + 2 < values.length; index += 3) {
    const x = Number(values[index]);
    const y = Number(values[index + 1]);
    const z = Number(values[index + 2]);
    if (![x, y, z].every(Number.isFinite)) continue;
    const vertical = (y - bounds.minY) / height;
    const radius = Math.hypot((2 * (x - centerX)) / width, (2 * (z - centerZ)) / depth);
    if (vertical >= 0.78) topRadii.push(radius);
    else if (vertical >= 0.22 && vertical <= 0.72) middleRadii.push(radius);
  }
  const topRadius90 = percentile(topRadii, 0.9);
  const middleRadius85 = percentile(middleRadii, 0.85);
  const roundTop = topRadii.length >= 6 && topRadius90 > 0.72 && topRadius90 < 1.18;
  const centralSupport = middleRadii.length >= 6 && middleRadius85 < 0.48;
  const topRoundness = roundTop ? clamp(1 - Math.abs(topRadius90 - 1) / 0.25) : 0;
  return {
    source: "local-triangle-analysis",
    geometryFingerprint: `mesh-${(geometryHash >>> 0).toString(16).padStart(8, "0")}-${Math.floor(values.length / 3)}`,
    vertexCount: Math.floor(values.length / 3),
    topShape: roundTop ? "round" : "rectangular",
    supportStyle: centralSupport ? "central" : "distributed",
    silhouette: roundTop && centralSupport ? "round-pedestal" : roundTop ? "round-multi-support" : "rectilinear",
    topRoundness: Number(topRoundness.toFixed(3)),
    aspectRatio: Number((width / depth).toFixed(3)),
  };
}

export function finishModelSnapshot(records = [], getMaterial = () => null) {
  return records
    .filter((record) => record?.piece && record?.part?.dimsMm)
    .map((record) => {
      const material = getMaterial(record.piece.id) || {};
      const analysis = analyzeMeshGeometry(record.positions, record.part.dimsMm);
      return {
        id: record.piece.id,
        name: record.part.name || (record.piece.generated ? "AI mesh" : "Scanned object"),
        partId: record.piece.partId,
        dimsMm: {
          x: finite(record.part.dimsMm.x),
          y: finite(record.part.dimsMm.y),
          z: finite(record.part.dimsMm.z),
        },
        poseM: {
          x: finite(record.piece.x),
          y: finite(record.piece.y),
          z: finite(record.piece.z),
        },
        shape:
          analysis.silhouette === "round-pedestal"
            ? "round-pedestal-table"
            : record.piece.generated
              ? "generated-mesh"
              : "scanned-mesh",
        material: {
          color: material.color || record.piece.color || record.part.color || null,
          texture: material.texture || null,
          roughness: finite(material.roughness, 0.6),
          metalness: clamp(finite(material.metalness, material.texture === "metal" ? 1 : 0)),
        },
        geometryAnalysis: analysis,
      };
    });
}

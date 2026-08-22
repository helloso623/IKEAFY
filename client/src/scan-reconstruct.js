/**
 * Three-view silhouette visual hull reconstruction.
 *
 * This dependency-free implementation is offered under the MIT License. It
 * uses no hosted service, paid API, model weights, or uploaded image storage.
 * Photos are segmented and meshed locally in the browser.
 */

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function largestComponent(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  let best = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let read = 0;
    let write = 1;
    queue[0] = start;
    seen[start] = 1;
    const found = [];
    while (read < write) {
      const index = queue[read++];
      found.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !seen[next]) {
          seen[next] = 1;
          queue[write++] = next;
        }
      }
    }
    if (found.length > best.length) best = found;
  }
  const out = new Uint8Array(mask.length);
  for (const index of best) out[index] = 1;
  return out;
}

function fillHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let read = 0;
  let write = 0;
  const add = (index) => {
    if (index < 0 || index >= mask.length || mask[index] || outside[index]) return;
    outside[index] = 1;
    queue[write++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (read < write) {
    const index = queue[read++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i += 1) out[i] = mask[i] || !outside[i] ? 1 : 0;
  return out;
}

function cropFor(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, count };
}

/**
 * Extract a foreground silhouette by comparing each pixel with the median
 * border colour, then retaining the largest connected component.
 */
export function silhouetteFromImageData(imageData, maxSide = 160) {
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(8, Math.round(sourceWidth * scale));
  const height = Math.max(8, Math.round(sourceHeight * scale));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sourceHeight - 1, Math.floor((y / height) * sourceHeight));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor((x / width) * sourceWidth));
      const source = (sy * sourceWidth + sx) * 4;
      const target = (y * width + x) * 4;
      rgba[target] = imageData.data[source];
      rgba[target + 1] = imageData.data[source + 1];
      rgba[target + 2] = imageData.data[source + 2];
      rgba[target + 3] = imageData.data[source + 3];
    }
  }

  const border = [];
  for (let x = 0; x < width; x += 1) {
    border.push((x * 4), ((height - 1) * width + x) * 4);
  }
  for (let y = 1; y + 1 < height; y += 1) {
    border.push((y * width) * 4, (y * width + width - 1) * 4);
  }
  const bg = [0, 1, 2, 3].map((channel) => median(border.map((index) => rgba[index + channel])));
  const distanceAt = (index) => {
    const alphaDistance = Math.abs(rgba[index + 3] - bg[3]) * 0.8;
    return (
      Math.hypot(rgba[index] - bg[0], rgba[index + 1] - bg[1], rgba[index + 2] - bg[2]) + alphaDistance
    );
  };
  const borderDistances = border.map(distanceAt).sort((a, b) => a - b);
  const threshold = clamp(borderDistances[Math.floor(borderDistances.length * 0.92)] + 24, 30, 105);
  const rough = new Uint8Array(width * height);
  for (let i = 0; i < rough.length; i += 1) {
    if (distanceAt(i * 4) > threshold) rough[i] = 1;
  }
  const mask = fillHoles(largestComponent(rough, width, height), width, height);
  const crop = cropFor(mask, width, height);
  if (!crop || crop.count < width * height * 0.005) {
    throw new Error("Could not separate the object from its background. Use a plain, contrasting backdrop.");
  }
  return { data: mask, width, height, crop, threshold };
}

function sampleMask(mask, u, v) {
  const { crop } = mask;
  const x = clamp(Math.round(crop.minX + u * (crop.width - 1)), crop.minX, crop.maxX);
  const y = clamp(Math.round(crop.minY + v * (crop.height - 1)), crop.minY, crop.maxY);
  return mask.data[y * mask.width + x] === 1;
}

function dimensionRatios(front, side, top) {
  const frontRatio = front.crop.width / Math.max(front.crop.height, 1);
  const sideRatio = side.crop.width / Math.max(side.crop.height, 1);
  const topRatio = top.crop.width / Math.max(top.crop.height, 1);
  const x = Math.sqrt(frontRatio * topRatio * sideRatio);
  const y = 1;
  const z = Math.sqrt((sideRatio * frontRatio) / Math.max(topRatio, 1e-6));
  return { x: clamp(x, 0.12, 8), y, z: clamp(z, 0.12, 8) };
}

function ellipsePerimeter(width, depth) {
  const a = width / 2;
  const b = depth / 2;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function scaledDimensions(ratios, scaleMm, scaleKind) {
  const reference =
    scaleKind === "length" ? Math.max(ratios.x, ratios.y, ratios.z) : ellipsePerimeter(ratios.x, ratios.z);
  const factor = scaleMm / Math.max(reference, 1e-6);
  return {
    x: Math.max(1, ratios.x * factor),
    y: Math.max(1, ratios.z * factor),
    z: Math.max(1, ratios.y * factor),
  };
}

/**
 * Intersect front, side and top silhouettes into a binary visual hull.
 * Coordinate convention: x=width, y=height, z=depth.
 */
export function carveVisualHull({ front, side, top }, { resolution = 28, scaleMm, scaleKind = "circumference" }) {
  const n = clamp(Math.round(resolution), 12, 48);
  const value = Number(scaleMm);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a scale greater than 0 mm.");
  const occupancy = new Uint8Array(n * n * n);
  let voxelCount = 0;
  for (let z = 0; z < n; z += 1) {
    const nz = (z + 0.5) / n;
    for (let y = 0; y < n; y += 1) {
      const ny = (y + 0.5) / n;
      for (let x = 0; x < n; x += 1) {
        const nx = (x + 0.5) / n;
        const occupied =
          sampleMask(front, nx, 1 - ny) && sampleMask(side, nz, 1 - ny) && sampleMask(top, nx, nz);
        if (!occupied) continue;
        occupancy[x + n * (y + n * z)] = 1;
        voxelCount += 1;
      }
    }
  }
  if (voxelCount < 8) {
    throw new Error("The three silhouettes do not overlap enough. Retake aligned front, side and top photos.");
  }
  const dimensionsMm = scaledDimensions(dimensionRatios(front, side, top), value, scaleKind);
  return { occupancy, resolution: n, voxelCount, dimensionsMm };
}

const CUBE_CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const TETRAHEDRA = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

function average(points) {
  const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0]);
  return total.map((value) => value / points.length);
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function pushTriangle(target, a, b, c, outward) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const flip = normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0;
  const vertices = flip ? [a, c, b] : [a, b, c];
  for (const point of vertices) target.push(point[0], point[1], point[2]);
}

/**
 * Polygonize the binary field with a six-tetrahedra marching-cubes variant.
 * The returned triangle positions are in metres for direct BufferGeometry use.
 */
export function meshVisualHull({ occupancy, resolution: n, dimensionsMm }) {
  const grid = n + 2;
  const scalar = new Uint8Array(grid * grid * grid);
  const at = (x, y, z) => x + grid * (y + grid * z);
  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        scalar[at(x + 1, y + 1, z + 1)] = occupancy[x + n * (y + n * z)];
      }
    }
  }
  const scale = [dimensionsMm.x / 1000, dimensionsMm.z / 1000, dimensionsMm.y / 1000];
  const point = (x, y, z) => [
    (((x - 1 + 0.5) / n) - 0.5) * scale[0],
    (((y - 1 + 0.5) / n) - 0.5) * scale[1],
    (((z - 1 + 0.5) / n) - 0.5) * scale[2],
  ];
  const positions = [];
  for (let z = 0; z + 1 < grid; z += 1) {
    for (let y = 0; y + 1 < grid; y += 1) {
      for (let x = 0; x + 1 < grid; x += 1) {
        const cubeValues = CUBE_CORNERS.map(([dx, dy, dz]) => scalar[at(x + dx, y + dy, z + dz)]);
        const count = cubeValues.reduce((sum, value) => sum + value, 0);
        if (count === 0 || count === 8) continue;
        const cubePoints = CUBE_CORNERS.map(([dx, dy, dz]) => point(x + dx, y + dy, z + dz));
        for (const tetra of TETRAHEDRA) {
          const inside = tetra.filter((index) => cubeValues[index]);
          if (inside.length === 0 || inside.length === 4) continue;
          const outside = tetra.filter((index) => !cubeValues[index]);
          const outward = average(outside.map((index) => cubePoints[index])).map(
            (value, axis) => value - average(inside.map((index) => cubePoints[index]))[axis],
          );
          if (inside.length === 1 || inside.length === 3) {
            const lone = inside.length === 1 ? inside[0] : outside[0];
            const others = inside.length === 1 ? outside : inside;
            const crossings = others.map((index) => midpoint(cubePoints[lone], cubePoints[index]));
            pushTriangle(positions, crossings[0], crossings[1], crossings[2], outward);
          } else {
            const [i0, i1] = inside;
            const [o0, o1] = outside;
            const a = midpoint(cubePoints[i0], cubePoints[o0]);
            const b = midpoint(cubePoints[i0], cubePoints[o1]);
            const c = midpoint(cubePoints[i1], cubePoints[o0]);
            const d = midpoint(cubePoints[i1], cubePoints[o1]);
            pushTriangle(positions, a, b, d, outward);
            pushTriangle(positions, a, d, c, outward);
          }
        }
      }
    }
  }
  if (!positions.length) throw new Error("The voxel hull did not produce a surface.");
  return { positions: new Float32Array(positions), triangleCount: positions.length / 9 };
}

async function imageDataFromFile(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(bitmap.width * scale));
  canvas.height = Math.max(8, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function drawSilhouettePreview(canvas, mask) {
  if (!canvas) return;
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i += 1) {
    const value = mask.data[i] ? 242 : 25;
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

export async function reconstructFromFiles(files, options) {
  const entries = await Promise.all(
    ["front", "side", "top"].map(async (view) => [view, silhouetteFromImageData(await imageDataFromFile(files[view]))]),
  );
  const masks = Object.fromEntries(entries);
  const hull = carveVisualHull(masks, options);
  return { ...hull, ...meshVisualHull(hull), masks };
}

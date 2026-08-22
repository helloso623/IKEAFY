export const COMPONENT_MODES = Object.freeze(["vertex", "edge", "face"]);

export function componentMode(value) {
  return COMPONENT_MODES.includes(value) ? value : null;
}

export function updateComponentSelection(selection, key, { shiftKey = false, empty = false } = {}) {
  const current = new Set(selection || []);
  if (empty || !key) return new Set();
  if (!shiftKey) return new Set([key]);
  if (current.has(key)) current.delete(key);
  else current.add(key);
  return current;
}

function positionKey(x, y, z, tolerance) {
  return `${Math.round(x / tolerance)}|${Math.round(y / tolerance)}|${Math.round(z / tolerance)}`;
}

export function buildWeldedTopology(positions, tolerance = 1e-5) {
  if (!positions || positions.length % 9 !== 0) {
    throw new Error("Component topology needs non-indexed triangle positions.");
  }
  const weldByKey = new Map();
  const occurrenceVertex = new Array(positions.length / 3);
  const vertices = [];
  for (let index = 0; index < occurrenceVertex.length; index += 1) {
    const offset = index * 3;
    const point = [positions[offset], positions[offset + 1], positions[offset + 2]];
    const key = positionKey(point[0], point[1], point[2], tolerance);
    let vertex = weldByKey.get(key);
    if (!vertex) {
      vertex = { id: `v:${vertices.length}`, index: vertices.length, indices: [], position: point };
      weldByKey.set(key, vertex);
      vertices.push(vertex);
    }
    vertex.indices.push(index);
    occurrenceVertex[index] = vertex.index;
  }

  const edgeByPair = new Map();
  const edges = [];
  const faces = [];
  const addEdge = (a, b, faceIndex) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const pair = `${lo}:${hi}`;
    let edge = edgeByPair.get(pair);
    if (!edge) {
      edge = { id: `e:${pair}`, index: edges.length, vertices: [lo, hi], faces: [] };
      edgeByPair.set(pair, edge);
      edges.push(edge);
    }
    edge.faces.push(faceIndex);
    return edge.id;
  };

  for (let corner = 0; corner < occurrenceVertex.length; corner += 3) {
    const faceIndex = corner / 3;
    const faceVertices = [
      occurrenceVertex[corner],
      occurrenceVertex[corner + 1],
      occurrenceVertex[corner + 2],
    ];
    const face = {
      id: `f:${faceIndex}`,
      index: faceIndex,
      corners: [corner, corner + 1, corner + 2],
      vertices: faceVertices,
      edges: [
        addEdge(faceVertices[0], faceVertices[1], faceIndex),
        addEdge(faceVertices[1], faceVertices[2], faceIndex),
        addEdge(faceVertices[2], faceVertices[0], faceIndex),
      ],
    };
    faces.push(face);
  }

  return {
    vertices,
    edges,
    faces,
    vertexById: new Map(vertices.map((vertex) => [vertex.id, vertex])),
    edgeById: new Map(edges.map((edge) => [edge.id, edge])),
    faceById: new Map(faces.map((face) => [face.id, face])),
  };
}

export function selectedWeldVertices(topology, mode, selection) {
  const selected = new Set(selection || []);
  const vertexIds = new Set();
  if (mode === "vertex") {
    for (const id of selected) {
      const vertex = topology.vertexById.get(id);
      if (vertex) vertexIds.add(vertex.index);
    }
  } else if (mode === "edge") {
    for (const id of selected) {
      const edge = topology.edgeById.get(id);
      if (edge) edge.vertices.forEach((index) => vertexIds.add(index));
    }
  } else if (mode === "face") {
    for (const id of selected) {
      const face = topology.faceById.get(id);
      if (face) face.vertices.forEach((index) => vertexIds.add(index));
    }
  }
  return vertexIds;
}

function cloneNumbers(values) {
  return ArrayBuffer.isView(values) ? new values.constructor(values) : [...values];
}

export function scaleComponentVertices(positions, topology, mode, selection, factor) {
  const scaled = cloneNumbers(positions);
  const vertices = selectedWeldVertices(topology, mode, selection);
  const amount = Number(factor);
  if (!vertices.size) return { scope: "object", changed: false, positions: scaled, vertexCount: 0 };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { scope: "components", changed: false, positions: scaled, vertexCount: vertices.size };
  }
  const center = [0, 0, 0];
  for (const index of vertices) {
    const point = topology.vertices[index].position;
    center[0] += point[0];
    center[1] += point[1];
    center[2] += point[2];
  }
  center[0] /= vertices.size;
  center[1] /= vertices.size;
  center[2] /= vertices.size;
  for (const index of vertices) {
    const vertex = topology.vertices[index];
    const point = vertex.position.map((value, axis) => center[axis] + (value - center[axis]) * amount);
    for (const occurrence of vertex.indices) {
      const offset = occurrence * 3;
      scaled[offset] = point[0];
      scaled[offset + 1] = point[1];
      scaled[offset + 2] = point[2];
    }
  }
  return {
    scope: "components",
    changed: Math.abs(amount - 1) > 1e-9,
    positions: scaled,
    vertexCount: vertices.size,
    center,
  };
}

function descriptor(value) {
  if (value?.array && Number.isInteger(value.itemSize)) return value;
  throw new Error("Triangle attributes need { array, itemSize } descriptors.");
}

function faceMaterialAt(faceIndex, groups) {
  const offset = faceIndex * 3;
  const group = (groups || []).find((entry) => offset >= entry.start && offset < entry.start + entry.count);
  return group?.materialIndex ?? 0;
}

function selectedSplitEdges(topology, mode, selection) {
  const selected = new Set(selection || []);
  const split = new Set();
  let matched = 0;
  if (mode === "edge") {
    for (const id of selected) {
      if (!topology.edgeById.has(id)) continue;
      split.add(id);
      matched += 1;
    }
  } else if (mode === "face") {
    for (const id of selected) {
      const face = topology.faceById.get(id);
      if (!face) continue;
      face.edges.forEach((edgeId) => split.add(edgeId));
      matched += 1;
    }
  }
  return { split, matched };
}

export function subdivideTriangleAttributes(attributeInput, {
  mode = null,
  selection = [],
  groups = [],
  tolerance = 1e-5,
} = {}) {
  const attributes = Object.fromEntries(
    Object.entries(attributeInput || {}).map(([name, value]) => [name, descriptor(value)]),
  );
  const position = attributes.position;
  if (!position || position.itemSize !== 3) throw new Error("Subdivision needs a position attribute.");
  const topology = buildWeldedTopology(position.array, tolerance);
  const chosen = selectedSplitEdges(topology, mode, selection);
  const scope = chosen.matched > 0 ? "selection" : "all";
  const splitEdges = chosen.split;
  if (scope === "all") topology.edges.forEach((edge) => splitEdges.add(edge.id));

  const output = Object.fromEntries(Object.keys(attributes).map((name) => [name, []]));
  const faceMaterials = [];
  const readCorner = (occurrence, weldedIndex) => {
    const values = {};
    for (const [name, attr] of Object.entries(attributes)) {
      const start = occurrence * attr.itemSize;
      values[name] = Array.from(attr.array.slice(start, start + attr.itemSize));
    }
    values.position = [...topology.vertices[weldedIndex].position];
    return values;
  };
  const midpoint = (a, b, edgeId) => {
    const values = {};
    for (const [name, attr] of Object.entries(attributes)) {
      values[name] = Array.from(
        { length: attr.itemSize },
        (_, axis) => (a[name][axis] + b[name][axis]) / 2,
      );
    }
    const edge = topology.edgeById.get(edgeId);
    if (edge) {
      const [va, vb] = edge.vertices.map((index) => topology.vertices[index].position);
      values.position = va.map((value, axis) => (value + vb[axis]) / 2);
    }
    return values;
  };
  const emit = (triangle, materialIndex) => {
    for (const corner of triangle) {
      for (const name of Object.keys(attributes)) output[name].push(...corner[name]);
    }
    faceMaterials.push(materialIndex);
  };

  for (const face of topology.faces) {
    const [a, b, c] = face.corners.map((corner, index) => readCorner(corner, face.vertices[index]));
    const [abId, bcId, caId] = face.edges;
    const splitAb = splitEdges.has(abId);
    const splitBc = splitEdges.has(bcId);
    const splitCa = splitEdges.has(caId);
    const ab = splitAb ? midpoint(a, b, abId) : null;
    const bc = splitBc ? midpoint(b, c, bcId) : null;
    const ca = splitCa ? midpoint(c, a, caId) : null;
    const materialIndex = faceMaterialAt(face.index, groups);
    const count = Number(splitAb) + Number(splitBc) + Number(splitCa);
    if (count === 0) {
      emit([a, b, c], materialIndex);
    } else if (count === 1 && splitAb) {
      emit([a, ab, c], materialIndex);
      emit([ab, b, c], materialIndex);
    } else if (count === 1 && splitBc) {
      emit([a, b, bc], materialIndex);
      emit([a, bc, c], materialIndex);
    } else if (count === 1) {
      emit([a, b, ca], materialIndex);
      emit([b, c, ca], materialIndex);
    } else if (count === 2 && !splitCa) {
      emit([a, ab, c], materialIndex);
      emit([ab, bc, c], materialIndex);
      emit([ab, b, bc], materialIndex);
    } else if (count === 2 && !splitAb) {
      emit([a, b, bc], materialIndex);
      emit([a, bc, ca], materialIndex);
      emit([bc, c, ca], materialIndex);
    } else if (count === 2) {
      emit([a, ab, ca], materialIndex);
      emit([ab, b, c], materialIndex);
      emit([ab, c, ca], materialIndex);
    } else {
      emit([a, ab, ca], materialIndex);
      emit([ab, b, bc], materialIndex);
      emit([ca, bc, c], materialIndex);
      emit([ab, bc, ca], materialIndex);
    }
  }

  const nextAttributes = {};
  for (const [name, attr] of Object.entries(attributes)) {
    const Constructor = ArrayBuffer.isView(attr.array) ? attr.array.constructor : Array;
    nextAttributes[name] = {
      array: Constructor === Array ? output[name] : new Constructor(output[name]),
      itemSize: attr.itemSize,
      normalized: Boolean(attr.normalized),
    };
  }
  return {
    attributes: nextAttributes,
    faceMaterials,
    scope,
    selectedCount: chosen.matched,
    beforeFaces: topology.faces.length,
    afterFaces: faceMaterials.length,
  };
}

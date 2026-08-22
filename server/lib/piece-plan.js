import { getPart, listParts } from "./catalog.js";
import { hasTavily, searchDiyOffers } from "./tavily.js";

function mm(value) {
  const n = Math.round(Math.abs(Number(value) || 0));
  return Number.isFinite(n) ? n : 0;
}

function dimsText(dims = {}) {
  return `${mm(dims.x)} × ${mm(dims.y)} × ${mm(dims.z)} mm`;
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pieceDims(piece, part) {
  return {
    x: mm(part?.dimsMm?.x * Math.abs(Number(piece?.sx) || 1)),
    y: mm(part?.dimsMm?.y * Math.abs(Number(piece?.sz) || 1)),
    z: mm(part?.dimsMm?.z * Math.abs(Number(piece?.sy) || 1)),
  };
}

export function modelComponents(project = {}) {
  return (project.pieces || [])
    .map((piece) => {
      const part = getPart(piece.partId);
      if (!part || part.category !== "furniture") return null;
      return {
        pieceId: piece.id,
        partId: part.id,
        name: part.name,
        category: part.category,
        shape: part.shape || "",
        material: part.material || "",
        ikeaArticle: part.ikeaArticle || null,
        geometry: part.specs?.geometry || null,
        cost: Number(part.cost) || 0,
        dimsMm: pieceDims(piece, part),
        poseM: {
          x: Number(piece.x) || 0,
          y: Number(piece.y) || 0,
          z: Number(piece.z) || 0,
        },
      };
    })
    .filter(Boolean);
}

export function modelDimensionsMm(components = []) {
  if (!components.length) return { x: 0, y: 0, z: 0 };
  const bounds = components.reduce(
    (box, component) => {
      const { dimsMm: dims, poseM: pose } = component;
      box.minX = Math.min(box.minX, pose.x * 1000 - dims.x / 2);
      box.maxX = Math.max(box.maxX, pose.x * 1000 + dims.x / 2);
      box.minY = Math.min(box.minY, pose.z * 1000 - dims.y / 2);
      box.maxY = Math.max(box.maxY, pose.z * 1000 + dims.y / 2);
      box.minZ = Math.min(box.minZ, pose.y * 1000 - dims.z / 2);
      box.maxZ = Math.max(box.maxZ, pose.y * 1000 + dims.z / 2);
      return box;
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  return {
    x: mm(bounds.maxX - bounds.minX),
    y: mm(bounds.maxY - bounds.minY),
    z: mm(bounds.maxZ - bounds.minZ),
  };
}

export function modelSignature(components = []) {
  const source = [...components]
    .sort((a, b) => String(a.pieceId).localeCompare(String(b.pieceId)))
    .map(
      (component) =>
        `${component.partId}:${dimsText(component.dimsMm)}@` +
        `${component.poseM.x.toFixed(3)},${component.poseM.y.toFixed(3)},${component.poseM.z.toFixed(3)}`,
    )
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `model-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function profileFor(components) {
  const wholeTable = components.find((item) => /table/i.test(item.shape)) || null;
  const slabs = components.filter((item) => item.shape === "slab");
  const posts = components.filter((item) => ["post", "dowel"].includes(item.shape));
  const top = wholeTable || [...slabs].sort((a, b) => b.dimsMm.x * b.dimsMm.y - a.dimsMm.x * a.dimsMm.y)[0] || null;
  const topDims = top?.dimsMm || { x: 0, y: 0, z: 0 };
  const postHeight = Math.max(0, ...posts.map((item) => item.dimsMm.z));
  return {
    wholeTable,
    slabs,
    posts,
    top,
    topDims,
    postHeight,
    roundPedestal: wholeTable?.shape === "round-pedestal-table",
    tableLike: Boolean(wholeTable || (top && posts.length >= 3)),
    shelfLike: Boolean(!wholeTable && top && posts.length < 3),
  };
}

function near(actual, wanted, tolerance = 16) {
  return actual > 0 && Math.abs(actual - wanted) <= tolerance;
}

function sameFootprint(dims, x, y) {
  return (near(dims.x, x) && near(dims.y, y)) || (near(dims.x, y) && near(dims.y, x));
}

export function matchIkeaArticle(components = []) {
  const profile = profileFor(components);
  const height = profile.wholeTable?.dimsMm.z || profile.postHeight + profile.topDims.z;
  if (sameFootprint(profile.topDims, 550, 550) && near(height, 450, 22)) {
    return {
      article: "304.499.08",
      name: "LACK side table",
      dimensionsMm: { x: 550, y: 550, z: 450 },
      url: "https://www.ikea.com/search/?q=304.499.08",
      confidence: "dimension-exact",
      note: "The modeled 550 × 550 × 450 mm envelope matches this article; compare the top and leg silhouettes.",
    };
  }
  if (
    sameFootprint(profile.topDims, 1000, 600) &&
    (!profile.posts.length || near(profile.postHeight, 700, 22))
  ) {
    return {
      article: "299.321.81",
      name: "LINNMON / ADILS table",
      dimensionsMm: { x: 1000, y: 600, z: 740 },
      url: "https://www.ikea.com/search/?q=299.321.81",
      confidence: "dimension-exact",
      note: "The top and leg dimensions match the LINNMON / ADILS piece family.",
    };
  }
  return null;
}

function sourceLinks(query, ikeaArticle = null) {
  const encoded = encodeURIComponent(query);
  return [
    ...(ikeaArticle
      ? [{ store: "IKEA", url: `https://www.ikea.com/search/?q=${encodeURIComponent(ikeaArticle)}` }]
      : []),
    { store: "Home Depot", url: `https://www.homedepot.com/s/${encoded}` },
    { store: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${encoded}` },
    { store: "Local lumber", url: `https://www.google.com/search?q=${encoded}+local+lumber` },
  ];
}

function hardwareSourceLinks(query) {
  const encoded = encodeURIComponent(query);
  return [
    { store: "Home Depot", url: `https://www.homedepot.com/s/${encoded}` },
    { store: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${encoded}` },
    { store: "Amazon", url: `https://www.amazon.com/s?k=${encoded}` },
  ];
}

function catalogMatches(role, dims) {
  const shape = role === "top" || role === "board" ? "slab" : role === "leg" ? "post" : "";
  return listParts()
    .filter((part) => part.category === "furniture" && (!shape || part.shape === shape))
    .map((part) => ({
      id: part.id,
      name: part.name,
      dimensions: dimsText(part.dimsMm),
      ikeaArticle: part.ikeaArticle || null,
      url: part.storeUrl || null,
      errorMm:
        Math.abs(mm(part.dimsMm?.x) - dims.x) +
        Math.abs(mm(part.dimsMm?.y) - dims.y) +
        Math.abs(mm(part.dimsMm?.z) - dims.z),
    }))
    .sort((a, b) => a.errorMm - b.errorMm)
    .slice(0, 3);
}

function pieceLine({ id, role, name, qty = 1, dimsMm, shape, material, why, ikeaArticle = null, cost = 0 }) {
  const dimensions = dimsText(dimsMm);
  const searchQuery = `${dimensions} ${material} ${name}`.replace(/\s+/g, " ").trim();
  const estimatedUnitCost = Number(cost) || (role === "top" ? 18 : role === "leg" ? 6 : 4);
  return {
    id,
    role,
    name,
    qty,
    dimensions,
    dimsMm: { ...dimsMm },
    shape,
    material,
    category: "furniture-piece",
    why,
    ikeaArticle,
    estimatedUnitCost,
    estimatedCost: Number((estimatedUnitCost * qty).toFixed(2)),
    catalogMatches: catalogMatches(role, dimsMm),
    sources: sourceLinks(searchQuery, ikeaArticle),
    searchQuery,
  };
}

function hardwareLine({ id, name, qty, dimensions, shape, material = "zinc-plated steel", why, unitCost = 1 }) {
  const searchQuery = `${name} ${dimensions}`.replace(/\s+/g, " ").trim();
  return {
    id,
    role: "hardware",
    name,
    qty,
    dimensions,
    shape,
    material,
    category: "connection-hardware",
    why,
    ikeaArticle: null,
    estimatedUnitCost: Number(unitCost) || 0,
    estimatedCost: Number(((Number(unitCost) || 0) * qty).toFixed(2)),
    catalogMatches: [],
    sources: hardwareSourceLinks(searchQuery),
    searchQuery,
  };
}

function hardwareLines(profile) {
  const supportCount = Math.max(1, profile.posts.length || (profile.tableLike ? 4 : 2));
  const topThickness = Math.max(18, mm(profile.topDims.z) || 30);
  if (profile.roundPedestal) {
    const pedestalDiameter = Math.max(
      80,
      mm(profile.wholeTable?.geometry?.pedestal?.radiusBottomMm) * 2 ||
        Math.round(Math.min(profile.topDims.x, profile.topDims.y) * 0.19),
    );
    return [
      hardwareLine({
        id: "pedestal-mounting-plate",
        name: "pedestal mounting plate",
        qty: 1,
        dimensions: `${pedestalDiameter} mm pattern`,
        shape: "round fixing plate",
        why: "Connects the modeled central pedestal to the tabletop while preserving its centered footprint.",
        unitCost: 12,
      }),
      hardwareLine({
        id: "pedestal-connector-bolts",
        name: "connector bolts with washers",
        qty: 8,
        dimensions: "M8 × 60 mm",
        shape: "machine bolt and washer",
        why: "Clamps the pedestal plate and base connection; verify length against the real stock.",
        unitCost: 0.8,
      }),
    ];
  }
  if (profile.tableLike) {
    const legFace = Math.max(
      35,
      Math.min(100, mm(profile.posts[0]?.dimsMm?.x) || Math.round(Math.min(profile.topDims.x, profile.topDims.y) * 0.09)),
    );
    const screwLength = Math.max(16, Math.min(30, topThickness - 6));
    return [
      hardwareLine({
        id: "leg-mounting-plates",
        name: "table-leg mounting plate",
        qty: supportCount,
        dimensions: `${Math.max(60, legFace + 20)} × ${Math.max(60, legFace + 20)} mm`,
        shape: "square fixing plate",
        why: "Provides one removable connection for each modeled leg.",
        unitCost: 4.5,
      }),
      hardwareLine({
        id: "top-fixing-screws",
        name: "countersunk wood screws",
        qty: supportCount * 4,
        dimensions: `4 × ${screwLength} mm`,
        shape: "countersunk screw",
        why: "Fixes the leg plates below the top without exceeding the modeled tabletop thickness.",
        unitCost: 0.12,
      }),
      hardwareLine({
        id: "apron-corner-brackets",
        name: "apron corner brackets",
        qty: 4,
        dimensions: "40 × 40 mm",
        shape: "right-angle bracket",
        why: "Supports the optional apron-frame construction route at its four leg corners.",
        unitCost: 2.25,
      }),
    ];
  }
  if (profile.shelfLike) {
    return [
      hardwareLine({
        id: "shelf-brackets",
        name: "concealed shelf brackets",
        qty: 2,
        dimensions: `${Math.max(100, Math.round(profile.topDims.y * 0.65))} mm pin`,
        shape: "wall bracket",
        why: "Supports the modeled board depth while keeping the visible shelf shape.",
        unitCost: 8,
      }),
      hardwareLine({
        id: "shelf-wall-fixings",
        name: "wall screws and anchors",
        qty: 4,
        dimensions: "6 × 50 mm",
        shape: "screw and wall anchor",
        why: "Fixes both brackets; select anchors for the actual wall construction.",
        unitCost: 0.75,
      }),
    ];
  }
  return [];
}

function exactPieceLines(ikeaMatch) {
  if (ikeaMatch?.article === "304.499.08") {
    return [
      pieceLine({
        id: "lack-size-top",
        role: "top",
        name: "LACK-size tabletop panel",
        dimsMm: { x: 550, y: 550, z: 36 },
        shape: "square slab",
        material: "laminated panel or furniture plywood",
        why: "Matches the modeled top.",
        ikeaArticle: "304.499.08",
        cost: 15,
      }),
      pieceLine({
        id: "lack-size-leg",
        role: "leg",
        name: "LACK-size square table leg",
        qty: 4,
        dimsMm: { x: 50, y: 50, z: 414 },
        shape: "square post",
        material: "sold furniture leg or straight timber post",
        why: "Four equal posts reproduce the modeled finished height.",
        ikeaArticle: "304.499.08",
        cost: 4,
      }),
    ];
  }
  if (ikeaMatch?.article === "299.321.81") {
    return [
      pieceLine({
        id: "linmon-top",
        role: "top",
        name: "LINNMON tabletop",
        dimsMm: { x: 1000, y: 600, z: 34 },
        shape: "rectangular slab",
        material: "laminated fibreboard",
        why: "Exact top dimensions match the model.",
        ikeaArticle: "002.511.35",
        cost: 25,
      }),
      pieceLine({
        id: "adils-leg",
        role: "leg",
        name: "ADILS table leg",
        qty: 4,
        dimsMm: { x: 40, y: 40, z: 700 },
        shape: "round post",
        material: "powder-coated steel",
        why: "Exact leg dimensions match the model.",
        ikeaArticle: "902.179.72",
        cost: 7,
      }),
    ];
  }
  return [];
}

function decomposeWholeTable(table) {
  const { x, y, z } = table.dimsMm;
  if (table.shape === "round-pedestal-table") {
    const geometry = table.geometry || {};
    const topHeight = mm(geometry.tabletop?.heightMm) || Math.max(18, Math.round(z * 0.05));
    const baseHeight = mm(geometry.base?.heightMm) || Math.max(30, Math.round(z * 0.07));
    const pedestalHeight = Math.max(100, z - topHeight - baseHeight);
    const pedestalDiameter = (mm(geometry.pedestal?.radiusBottomMm) || Math.round(Math.min(x, y) * 0.095)) * 2;
    const baseDiameter = Math.min(x, y, (mm(geometry.base?.radiusMm) || Math.round(Math.min(x, y) * 0.28)) * 2);
    return [
      pieceLine({
        id: "modeled-round-top",
        role: "top",
        name: "round tabletop disc",
        dimsMm: { x, y, z: topHeight },
        shape: "circular slab",
        material: table.material || "furniture plywood or edge-glued board",
        why: "Recreates the circular modeled tabletop at its finished diameter.",
        cost: table.cost * 0.55,
      }),
      pieceLine({
        id: "modeled-tapered-pedestal",
        role: "pedestal",
        name: "tapered central pedestal",
        dimsMm: { x: pedestalDiameter, y: pedestalDiameter, z: pedestalHeight },
        shape: "tapered cylinder",
        material: table.material || "laminated hardwood or furniture plywood",
        why: "Recreates the single central support and modeled finished height.",
        cost: table.cost * 0.3,
      }),
      pieceLine({
        id: "modeled-disc-base",
        role: "base",
        name: "round pedestal base disc",
        dimsMm: { x: baseDiameter, y: baseDiameter, z: baseHeight },
        shape: "circular slab",
        material: table.material || "furniture plywood or edge-glued board",
        why: "Recreates the modeled floor base and pedestal stance.",
        cost: table.cost * 0.15,
      }),
    ];
  }
  const topThickness = Math.max(18, Math.min(50, Math.round(z * 0.09)));
  const legWidth = Math.max(35, Math.min(70, Math.round(Math.min(x, y) * 0.09)));
  const legHeight = Math.max(120, z - topThickness);
  return [
    pieceLine({
      id: "modeled-top",
      role: "top",
      name: "cut-to-size tabletop panel",
      dimsMm: { x, y, z: topThickness },
      shape: "rectangular slab",
      material: table.material || "furniture plywood or edge-glued board",
      why: "Recreates the modeled footprint.",
      cost: table.cost * 0.65,
    }),
    pieceLine({
      id: "modeled-legs",
      role: "leg",
      name: "square furniture leg blank",
      qty: 4,
      dimsMm: { x: legWidth, y: legWidth, z: legHeight },
      shape: "square post",
      material: "straight timber or sold furniture leg",
      why: "Four equal posts recreate the modeled height.",
      cost: (table.cost * 0.35) / 4,
    }),
  ];
}

function visiblePieceLines(components, profile, ikeaMatch) {
  const exact = exactPieceLines(ikeaMatch);
  if (exact.length) return exact;
  if (profile.wholeTable) return decomposeWholeTable(profile.wholeTable);
  const grouped = new Map();
  for (const component of components) {
    const role =
      component.pieceId === profile.top?.pieceId
        ? profile.shelfLike
          ? "board"
          : "top"
        : ["post", "dowel"].includes(component.shape)
          ? "leg"
          : "board";
    const key = `${role}:${dimsText(component.dimsMm)}:${component.material}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.qty += 1;
      existing.estimatedCost = Number((existing.estimatedUnitCost * existing.qty).toFixed(2));
      continue;
    }
    grouped.set(
      key,
      pieceLine({
        id: `${role}-${slug(component.partId)}-${slug(dimsText(component.dimsMm))}`,
        role,
        name: role === "top" ? "tabletop panel" : role === "leg" ? "table leg" : "furniture board",
        dimsMm: component.dimsMm,
        shape: component.shape || role,
        material: component.material || "match modeled stock",
        why: `Matches the ${component.name} in the current model.`,
        ikeaArticle: component.ikeaArticle,
        cost: component.cost,
      }),
    );
  }
  return [...grouped.values()];
}

function apronCuts(profile) {
  const top = profile.topDims;
  const legWidth = profile.posts[0]?.dimsMm.x || Math.max(40, Math.round(Math.min(top.x, top.y) * 0.09));
  const height = Math.max(60, Math.min(100, Math.round((profile.postHeight || 450) * 0.16)));
  return [
    pieceLine({
      id: "long-apron",
      role: "apron",
      name: "long apron / stretcher",
      qty: 2,
      dimsMm: { x: Math.max(100, top.x - legWidth * 2), y: 18, z: height },
      shape: "long rail",
      material: "straight furniture timber",
      why: "Optional long rails for an apron-frame version of this table.",
    }),
    pieceLine({
      id: "short-apron",
      role: "apron",
      name: "short apron / stretcher",
      qty: 2,
      dimsMm: { x: Math.max(100, top.y - legWidth * 2), y: 18, z: height },
      shape: "short rail",
      material: "straight furniture timber",
      why: "Optional end rails for an apron-frame version of this table.",
    }),
  ];
}

function constructionWays(profile, ikeaMatch, lines) {
  const ways = [];
  if (profile.roundPedestal) {
    ways.push({
      id: "turned-pedestal",
      title: "Round top + turned pedestal + disc base",
      recommended: true,
      summary: "Cut the two circular slabs to the modeled diameters and turn or order one tapered pedestal to the modeled profile.",
      joinery: "Dry-fit the three centered bodies, then use joinery appropriate to the real stock and expected load.",
      uses: lines.map((line) => line.id),
      additionalCuts: [],
    });
    ways.push({
      id: "laminated-pedestal",
      title: "Laminated and shaped pedestal",
      recommended: false,
      summary: "Glue up square pedestal stock, then turn or template-route it to the modeled taper before joining the circular top and base.",
      joinery: "Keep the glue-up centered and preserve the modeled top, pedestal, and base diameters while shaping.",
      uses: lines.map((line) => line.id),
      additionalCuts: [],
    });
  } else if (profile.tableLike) {
    ways.push({
      id: "top-and-ready-legs",
      title: "Cut-to-size top + ready-made legs",
      recommended: true,
      summary: "Order or cut the top to the modeled footprint, then choose four legs with the modeled cross-section and height.",
      joinery: "Use the attachment system supplied with the selected legs; this research covers the construction route and visible table bodies.",
      uses: lines.map((line) => line.id),
      additionalCuts: [],
    });
    ways.push({
      id: "apron-frame",
      title: "All-wood top + legs + apron frame",
      recommended: false,
      summary: "Cut the visible top and legs, then add recessed apron rails for a traditional timber table base.",
      joinery: "Mortise-and-tenon or dowelled apron joints keep this route focused on shaped wood pieces and glue.",
      uses: lines.map((line) => line.id),
      additionalCuts: apronCuts(profile),
    });
  }
  if (profile.shelfLike) {
    ways.push({
      id: "board-for-board",
      title: "Cut the modeled boards",
      recommended: true,
      summary: "Cut or order each slab to the current model dimensions.",
      joinery: "Use dados, dowels, or glued housed joints selected for the modeled material thickness.",
      uses: lines.map((line) => line.id),
      additionalCuts: [],
    });
  }
  if (ikeaMatch) {
    ways.push({
      id: `ikea-${ikeaMatch.article}`,
      title: `IKEA dimension match: ${ikeaMatch.name}`,
      recommended: false,
      summary: `Compare complete article ${ikeaMatch.article} with the current silhouette as a ready-made table route.`,
      joinery: "Use the complete product as supplied after confirming silhouette, height, and load needs.",
      uses: [],
      additionalCuts: [],
      sources: [{ store: "IKEA", url: ikeaMatch.url }],
    });
  }
  if (!ways.length) {
    ways.push({
      id: "piece-for-piece",
      title: "Piece-for-piece build",
      recommended: true,
      summary: "Source every modeled furniture body at its listed shape and size.",
      joinery: "Choose a woodworking joint appropriate to each contact face after a dry fit.",
      uses: lines.map((line) => line.id),
      additionalCuts: [],
    });
  }
  return ways;
}

export function buildWaysForProject(project = {}) {
  const components = modelComponents(project);
  if (!components.length) return { ok: false, reason: "Add or model a table before finding ways to make it." };
  const profile = profileFor(components);
  const ikeaMatch = matchIkeaArticle(components);
  const cutList = visiblePieceLines(components, profile, ikeaMatch);
  const hardware = hardwareLines(profile);
  const ways = constructionWays(profile, ikeaMatch, cutList);
  const lines = [...cutList, ...hardware];
  return {
    ok: true,
    name: String(project.name || "Custom table").trim() || "Custom table",
    scope: "Construction ways, boards, shaped stock, and connection hardware for this exact modeled shape",
    components,
    modelDimensionsMm: modelDimensionsMm(components),
    modelSignature: modelSignature(components),
    profile: {
      tableLike: profile.tableLike,
      shelfLike: profile.shelfLike,
      supportCount: profile.posts.length || (profile.tableLike ? 4 : 0),
      topDimsMm: profile.topDims,
    },
    ikeaMatch,
    ways,
    lines,
    cutList,
    hardwareLines: hardware,
    estimatedTotal: Number(lines.reduce((sum, line) => sum + line.estimatedCost, 0).toFixed(2)),
    currency: "USD",
    disclaimer:
      "Piece and cut-size match, not engineering approval. Verify grain, loads, joinery allowances, finished thickness, and retailer dimensions before buying or cutting.",
  };
}

function numberedSteps(build) {
  const pieces = build.cutList.map((line) => `${line.qty} × ${line.name}, ${line.dimensions}`).join("; ");
  const hardware = build.hardwareLines.map((line) => `${line.qty} × ${line.name}, ${line.dimensions}`).join("; ");
  return [
    `1. Freeze this model revision at ${dimsText(build.modelDimensionsMm)} and verify its piece list: ${pieces}.`,
    "2. Choose the recommended top-and-leg route or the apron-frame route, then buy or cut every shaped piece to the listed finished millimetres.",
    `3. Match the current-model connection hardware before drilling: ${hardware || "select fasteners for the real material and loads"}.`,
    "4. Label the tabletop, legs, and any apron or stretcher pairs, then lay out and dry-fit the complete table in the modeled positions.",
    "5. Assemble the selected pieces with joinery appropriate to their real material and thickness, preserving the modeled overhang and offsets.",
    "6. Turn the table upright, compare its footprint and height with this saved revision, and check level and wobble before loading it.",
  ];
}

export function buildPlanSource(build) {
  const match = build.ikeaMatch
    ? `IKEA dimension match: ${build.ikeaMatch.name}, article ${build.ikeaMatch.article}. ${build.ikeaMatch.note}`
    : "No IKEA article matched the current modeled dimensions closely enough.";
  const alternatives = build.ways
    .map((way) => {
      const additions = way.additionalCuts?.length
        ? ` Additional cuts: ${way.additionalCuts.map((line) => `${line.qty} × ${line.name}, ${line.dimensions}`).join("; ")}.`
        : "";
      return `${way.title}: ${way.summary} Construction: ${way.joinery}${additions}`;
    })
    .join("\n");
  return [
    `${build.name} — ways to make the final model`,
    `Current modeled envelope: ${dimsText(build.modelDimensionsMm)}.`,
    `Build scope: ${build.scope}.`,
    match,
    `Cut list: ${build.cutList.map((line) => `${line.qty} × ${line.name}, ${line.dimensions}, ${line.material}`).join("; ")}`,
    `Connection hardware: ${build.hardwareLines.map((line) => `${line.qty} × ${line.name}, ${line.dimensions}`).join("; ") || "none"}`,
    "Construction ways:",
    alternatives,
    "",
    ...numberedSteps(build),
    "",
    `Safety: ${build.disclaimer}`,
  ].join("\n");
}

export async function finishFurnitureBuild(project = {}, deps = {}) {
  const build = buildWaysForProject(project);
  if (!build.ok) return build;
  let liveSources = [];
  if (hasTavily()) {
    try {
      liveSources = await searchDiyOffers(build, deps);
    } catch {
      liveSources = [];
    }
  }
  return {
    ok: true,
    bom: {
      ...build,
      partner: hasTavily() ? "tavily" : "catalog-standin",
      live: liveSources.length > 0,
      liveSources,
    },
    planSource: buildPlanSource(build),
    pdf: {
      method: "client-print",
      filename: `${slug(build.name) || "table"}-ways-to-make.pdf`,
      note: "The browser creates the PDF locally; no model geometry is uploaded to a PDF service.",
    },
  };
}

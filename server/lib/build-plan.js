import { getPart } from "./catalog.js";
import { hasTavily, searchHardwareOffers } from "./tavily.js";

const WOOD_LIKE = /\b(wood|particleboard|fibreboard|fiberboard|plywood|pine|beech|oak|mdf|bamboo)\b/i;

const SOURCES = {
  "m6-machine-screw": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/socket-head-screws/" },
    { store: "IKEA", url: "https://www.ikea.com/us/en/customer-service/spare-parts/" },
  ],
  "table-leg-plate": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/mounting-plates/" },
    { store: "Hardware search", url: "https://www.google.com/search?q=surface+mount+table+leg+plate+M8" },
  ],
  "hanger-bolt": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/hanger-bolts/" },
    { store: "Hardware search", url: "https://www.google.com/search?q=M8+hanger+bolt+furniture+leg" },
  ],
  "wood-screw": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/wood-screws/" },
    { store: "Hardware search", url: "https://www.google.com/search?q=%238+pan+head+wood+screws" },
  ],
  "shelf-bracket": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/shelf-brackets/" },
    { store: "Hardware search", url: "https://www.google.com/search?q=steel+shelf+bracket+200mm" },
  ],
  "wall-anchor": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/drywall-anchors/" },
    { store: "Hardware search", url: "https://www.google.com/search?q=wall+anchor+and+screw+load+rated" },
  ],
  "felt-pad": [
    { store: "Hardware search", url: "https://www.google.com/search?q=self+adhesive+furniture+felt+pads+25mm" },
  ],
  "corner-brace": [
    { store: "McMaster-Carr", url: "https://www.mcmaster.com/products/brackets/corner-brackets~/" },
    { store: "Hardware search", url: "https://www.google.com/search?q=steel+corner+brace+40mm" },
  ],
};

function mm(value) {
  const n = Math.round(Math.abs(Number(value) || 0));
  return Number.isFinite(n) ? n : 0;
}

function pieceDims(piece, part) {
  return {
    x: mm(part?.dimsMm?.x * Math.abs(Number(piece?.sx) || 1)),
    y: mm(part?.dimsMm?.y * Math.abs(Number(piece?.sy) || 1)),
    z: mm(part?.dimsMm?.z * Math.abs(Number(piece?.sz) || 1)),
  };
}

function near(actual, wanted, tolerance = 16) {
  return actual > 0 && Math.abs(actual - wanted) <= tolerance;
}

function sameFootprint(dims, x, y, tolerance = 16) {
  return (
    (near(dims.x, x, tolerance) && near(dims.y, y, tolerance)) ||
    (near(dims.x, y, tolerance) && near(dims.y, x, tolerance))
  );
}

export function modelComponents(project = {}) {
  return (project.pieces || [])
    .map((piece) => {
      const part = getPart(piece.partId);
      if (!part) return null;
      return {
        pieceId: piece.id,
        partId: part.id,
        name: part.name,
        category: part.category,
        shape: part.shape || "",
        material: part.material || "",
        ikeaArticle: part.ikeaArticle || null,
        dimsMm: pieceDims(piece, part),
      };
    })
    .filter(Boolean);
}

function furnitureProfile(components) {
  const furniture = components.filter((item) => item.category === "furniture");
  const wholeTable = furniture.find((item) => item.shape === "table");
  const slabs = furniture.filter((item) => item.shape === "slab");
  const posts = furniture.filter((item) => ["post", "dowel"].includes(item.shape));
  const top = wholeTable || slabs.sort((a, b) => b.dimsMm.x * b.dimsMm.y - a.dimsMm.x * a.dimsMm.y)[0] || null;
  const topDims = top?.dimsMm || { x: 0, y: 0, z: 0 };
  const postHeight = Math.max(0, ...posts.map((item) => item.dimsMm.z));
  const tableLike = Boolean(wholeTable || (top && posts.length >= 3));
  const shelfLike = !tableLike && slabs.length > 0;
  return { furniture, wholeTable, slabs, posts, top, topDims, postHeight, tableLike, shelfLike };
}

export function matchIkeaArticle(components = []) {
  const profile = furnitureProfile(components);
  const { topDims, postHeight, wholeTable, posts } = profile;
  const lackHeight = wholeTable?.dimsMm.z || postHeight + topDims.z;
  if (sameFootprint(topDims, 550, 550) && near(lackHeight, 450, 22)) {
    return {
      article: "304.499.08",
      name: "LACK side table",
      dimensionsMm: { x: 550, y: 550, z: 450 },
      url: "https://www.ikea.com/search/?q=304.499.08",
      confidence: "dimension-exact",
      note: "Envelope matches within 22 mm. Confirm hole pattern before ordering fittings.",
    };
  }
  if (sameFootprint(topDims, 1000, 600) && (posts.length === 0 || near(postHeight, 700, 22))) {
    return {
      article: "299.321.81",
      name: "LINNMON / ADILS table",
      dimensionsMm: { x: 1000, y: 600, z: 740 },
      url: "https://www.ikea.com/search/?q=299.321.81",
      confidence: "dimension-exact",
      note: "1000 × 600 mm top matches; confirm the 700 mm leg and pre-drilled hole pattern.",
    };
  }
  return null;
}

function hardwareLine(id, name, qty, dimensions, shape, why, unitCost, extra = {}) {
  return {
    id,
    name,
    qty: Math.max(1, Math.ceil(Number(qty) || 1)),
    dimensions,
    shape,
    material: extra.material || "steel",
    category: "hardware",
    estimatedUnitCost: unitCost,
    estimatedCost: Number((unitCost * Math.max(1, Math.ceil(Number(qty) || 1))).toFixed(2)),
    why,
    catalogMatch: extra.catalogMatch || null,
    ikeaArticle: extra.ikeaArticle || null,
    sources: (SOURCES[id] || []).map((source) => ({ ...source })),
  };
}

function directHardware(components) {
  const byPart = new Map();
  for (const component of components) {
    if (WOOD_LIKE.test(component.material)) continue;
    if (component.category === "furniture" && component.material && !/metal|steel|aluminium|aluminum/i.test(component.material)) {
      continue;
    }
    if (!["fastener", "furniture"].includes(component.category)) continue;
    const prior = byPart.get(component.partId);
    if (prior) {
      prior.qty += 1;
      prior.estimatedCost = Number((prior.estimatedUnitCost * prior.qty).toFixed(2));
      continue;
    }
    const part = getPart(component.partId);
    byPart.set(
      component.partId,
      hardwareLine(
        `model-${component.partId}`,
        component.name,
        1,
        `${component.dimsMm.x} × ${component.dimsMm.y} × ${component.dimsMm.z} mm`,
        component.shape || "component",
        "This non-wood component is present in the finished model.",
        Number(part?.cost) || 0,
        { material: component.material || "hardware", ikeaArticle: component.ikeaArticle },
      ),
    );
    const line = byPart.get(component.partId);
    const query = encodeURIComponent(component.ikeaArticle || component.name);
    line.sources = [
      ...(component.ikeaArticle ? [{ store: "IKEA", url: `https://www.ikea.com/search/?q=${query}` }] : []),
      { store: "Catalog search", url: `https://www.google.com/search?q=${query}+buy` },
    ];
  }
  return [...byPart.values()];
}

export function hardwareBomForProject(project = {}) {
  const components = modelComponents(project);
  if (!components.length) {
    return { ok: false, reason: "Add furniture parts to the 3D bench before finishing the model." };
  }
  const profile = furnitureProfile(components);
  const ikeaMatch = matchIkeaArticle(components);
  const lines = directHardware(components);
  const add = (line) => {
    if (!lines.some((existing) => existing.id === line.id)) lines.push(line);
  };

  if (profile.tableLike) {
    const supports = Math.max(4, profile.posts.length || 4);
    const topThickness = profile.wholeTable ? 36 : profile.topDims.z || 18;
    const screwLength = Math.max(12, Math.min(25, Math.floor(topThickness * 0.65)));
    if (ikeaMatch?.article === "304.499.08") {
      add(
        hardwareLine(
          "m6-machine-screw",
          "M6 × 12 mm socket-head furniture screw",
          supports,
          "M6 × 12 mm",
          "socket-head machine screw",
          "Matches the modeled threaded leg connection; IKEA fitting 100224 is the first spare to check.",
          0.2,
          { catalogMatch: "m6-screw", ikeaArticle: "100224" },
        ),
      );
    } else if (ikeaMatch?.article === "299.321.81") {
      add(
        hardwareLine(
          "model-adils-leg",
          "ADILS steel table leg with mounting plate",
          supports,
          "700 mm long",
          "round post with square mounting plate",
          "The modeled 1000 × 600 mm top matches the LINNMON / ADILS system; screws are normally included.",
          7,
          { material: "powder-coated steel", ikeaArticle: "902.179.72" },
        ),
      );
      lines.at(-1).sources = [{ store: "IKEA", url: "https://www.ikea.com/search/?q=902.179.72" }];
    } else {
      add(
        hardwareLine(
          "table-leg-plate",
          "Surface-mount furniture leg plate, M8 center thread",
          supports,
          "about 80 × 80 mm",
          "square plate with four corner holes",
          "Spreads each support load into the underside of the top.",
          3.5,
        ),
      );
      add(
        hardwareLine(
          "hanger-bolt",
          "M8 furniture hanger bolt",
          supports,
          "M8 × 60 mm",
          "machine thread / wood thread stud",
          "Joins each modeled wooden support to its mounting plate.",
          0.8,
        ),
      );
      add(
        hardwareLine(
          "wood-screw",
          `#8 pan-head wood screw, ${screwLength} mm`,
          supports * 4,
          `#8 × ${screwLength} mm`,
          "pan-head wood screw",
          `Four screws per plate; ${screwLength} mm stays below the modeled ${topThickness} mm top thickness.`,
          0.1,
        ),
      );
    }
    add(
      hardwareLine(
        "felt-pad",
        "Self-adhesive furniture felt pad",
        supports,
        "25 mm diameter",
        "round pad",
        "Protects the floor and gives a small amount of wobble correction.",
        0.25,
        { material: "felt" },
      ),
    );
  } else if (profile.shelfLike) {
    const span = Math.max(profile.topDims.x, profile.topDims.y);
    const brackets = Math.max(2, Math.ceil(span / 600));
    add(
      hardwareLine(
        "shelf-bracket",
        "Load-rated steel shelf bracket",
        brackets,
        `200 × 200 mm (for ${span} mm span)`,
        "L bracket",
        "Supports the modeled slab without sourcing the wood itself.",
        4,
        { catalogMatch: "generic-shelf-bracket" },
      ),
    );
    add(
      hardwareLine(
        "wall-anchor",
        "Wall-specific anchor and screw",
        brackets * 2,
        "6–8 mm anchor; select for wall type",
        "anchor with pan-head screw",
        "Two rated wall fixings per bracket. Final type depends on stud, masonry, or hollow wall.",
        0.6,
      ),
    );
  } else {
    add(
      hardwareLine(
        "corner-brace",
        "Steel corner brace",
        Math.max(4, Number(project.joints?.length) || 4),
        "40 × 40 mm",
        "L bracket",
        "A conservative connector for a furniture body whose joint pattern is not yet explicit.",
        1.25,
      ),
    );
    add(
      hardwareLine(
        "wood-screw",
        "#8 pan-head wood screw, 16 mm",
        Math.max(16, (Number(project.joints?.length) || 4) * 4),
        "#8 × 16 mm",
        "pan-head wood screw",
        "Four screws per corner brace; verify stock thickness before drilling.",
        0.1,
      ),
    );
  }

  const total = Number(lines.reduce((sum, line) => sum + line.estimatedCost, 0).toFixed(2));
  return {
    ok: true,
    name: String(project.name || "Custom furniture").trim() || "Custom furniture",
    scope: "Hardware and non-wood components only",
    components,
    profile: {
      tableLike: profile.tableLike,
      shelfLike: profile.shelfLike,
      supportCount: profile.posts.length || (profile.tableLike ? 4 : 0),
      topDimsMm: profile.topDims,
    },
    ikeaMatch,
    lines,
    estimatedTotal: total,
    currency: "USD",
    disclaimer: "Dimension match, not engineering approval. Verify loads, hole pattern, stock thickness, and wall type before buying or drilling.",
  };
}

function numberedBuildSteps(bom) {
  const table = bom.profile.tableLike;
  const shelf = bom.profile.shelfLike;
  const names = bom.lines.map((line) => `${line.qty} × ${line.name} (${line.dimensions})`).join("; ");
  if (table) {
    return [
      `1. Print or save this hardware BOM, then verify every modeled dimension and dry-fit: ${names}.`,
      "2. Turn the top face-down on a padded surface and mark the support centers from the finished 3D model.",
      "3. Place each mounting plate or modeled fitting at its mark; check edge clearances and pre-drill pilot holes shorter than the top thickness.",
      "4. Fasten the plates with the listed pan-head screws, stopping when snug so the top is not stripped or pierced.",
      "5. Install each support into its matching plate or threaded fitting, keeping the same orientation as the 3D model.",
      "6. Apply the floor pads, turn the furniture upright with help, then check level, wobble, and fastener seating before loading it.",
    ];
  }
  if (shelf) {
    return [
      `1. Print or save this hardware BOM, then verify every modeled dimension and dry-fit: ${names}.`,
      "2. Transfer bracket positions from the 3D model and locate studs or identify the actual wall construction.",
      "3. Level the bracket marks, drill for the chosen wall fixings, and install each bracket without exceeding its rated spacing.",
      "4. Place the modeled shelf on the brackets, center it, pre-drill shallow pilot holes, and fasten it from below.",
      "5. Check level and stability, then proof-load gradually below the lowest bracket or wall-anchor rating.",
    ];
  }
  return [
    `1. Print or save this hardware BOM, then verify every modeled dimension and dry-fit: ${names}.`,
    "2. Transfer every joint location from the finished 3D model onto the physical parts.",
    "3. Clamp each joint square, mark the fitting holes, and drill pilot holes shorter than the stock thickness.",
    "4. Fasten each matching bracket or connector, working from the center outward.",
    "5. Stand the furniture in its use position and inspect every joint before applying load.",
  ];
}

export function buildPlanSource(bom) {
  const match = bom.ikeaMatch
    ? `Dimension-matched IKEA reference: ${bom.ikeaMatch.name}, article ${bom.ikeaMatch.article}. ${bom.ikeaMatch.note}`
    : "No IKEA article matched the modeled dimensions closely enough.";
  return [
    `${bom.name} — custom hardware build`,
    `BOM scope: ${bom.scope}. Wood is intentionally excluded.`,
    match,
    `Hardware: ${bom.lines.map((line) => `${line.qty} × ${line.name}, ${line.dimensions}`).join("; ")}`,
    "",
    ...numberedBuildSteps(bom),
    "",
    `Safety: ${bom.disclaimer}`,
  ].join("\n");
}

export async function finishFurnitureBuild(project = {}, deps = {}) {
  const bom = hardwareBomForProject(project);
  if (!bom.ok) return bom;
  let liveSources = [];
  if (hasTavily()) {
    try {
      liveSources = await searchHardwareOffers(bom.lines, deps);
    } catch {
      liveSources = [];
    }
  }
  return {
    ok: true,
    bom: {
      ...bom,
      partner: hasTavily() ? "tavily" : "catalog-standin",
      live: liveSources.length > 0,
      liveSources,
    },
    planSource: buildPlanSource(bom),
    pdf: {
      method: "client-print",
      filename: `${bom.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "furniture"}-hardware-bom.pdf`,
      note: "The browser print dialog creates the PDF without sending model geometry to a third-party PDF service.",
    },
  };
}

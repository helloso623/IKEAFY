/**
 * IKEA-vibe test table used in the Lab seed, AR/house scene and tests.
 * 550 × 550 mm top, ~450 mm high. Specs needed for an exact IKEA article.
 */

export const GENERIC_SIDE_TABLE = Object.freeze({
  id: "generic-side-table",
  widthMm: 550,
  depthMm: 550,
  heightMm: 450,
  topMm: 36,
  legMm: 50,
  color: "#ecdfc6",
  note: "Generic 550 × 550 mm top, ~450 mm high. Specs needed for an exact IKEA article.",
});

export const GENERIC_SIDE_TABLE_M = Object.freeze({
  w: GENERIC_SIDE_TABLE.widthMm / 1000,
  d: GENERIC_SIDE_TABLE.depthMm / 1000,
  h: GENERIC_SIDE_TABLE.heightMm / 1000,
});

export const ROUND_PEDESTAL_TABLE_GEOMETRY = Object.freeze({
  type: "round-pedestal-table",
  tabletop: Object.freeze({
    type: "cylinder",
    radiusMm: 450,
    heightMm: 36,
    radialSegments: 64,
  }),
  pedestal: Object.freeze({
    type: "cylinder",
    radiusTopMm: 55,
    radiusBottomMm: 85,
    heightMm: 654,
    radialSegments: 48,
    count: 1,
  }),
  base: Object.freeze({
    type: "cylinder",
    radiusMm: 250,
    heightMm: 50,
    radialSegments: 64,
  }),
});

export const ROUND_PEDESTAL_TABLE = Object.freeze({
  id: "generic-round-pedestal-table",
  diameterMm: ROUND_PEDESTAL_TABLE_GEOMETRY.tabletop.radiusMm * 2,
  heightMm:
    ROUND_PEDESTAL_TABLE_GEOMETRY.tabletop.heightMm +
    ROUND_PEDESTAL_TABLE_GEOMETRY.pedestal.heightMm +
    ROUND_PEDESTAL_TABLE_GEOMETRY.base.heightMm,
  color: "#d5aa72",
  geometry: ROUND_PEDESTAL_TABLE_GEOMETRY,
});

function colorOf(THREE, hex, mul = 1) {
  const color = new THREE.Color(hex || GENERIC_SIDE_TABLE.color);
  if (mul !== 1) color.multiplyScalar(mul);
  return color;
}

/** Build one selectable table from a circular top, central pedestal and disc base. */
export function makeRoundPedestalTable(
  THREE,
  {
    geometry = ROUND_PEDESTAL_TABLE_GEOMETRY,
    color = ROUND_PEDESTAL_TABLE.color,
  } = {},
) {
  const tabletopSpec = geometry.tabletop || ROUND_PEDESTAL_TABLE_GEOMETRY.tabletop;
  const pedestalSpec = geometry.pedestal || ROUND_PEDESTAL_TABLE_GEOMETRY.pedestal;
  const baseSpec = geometry.base || ROUND_PEDESTAL_TABLE_GEOMETRY.base;
  const mm = 0.001;
  const topH = tabletopSpec.heightMm * mm;
  const pedestalH = pedestalSpec.heightMm * mm;
  const baseH = baseSpec.heightMm * mm;
  const totalH = topH + pedestalH + baseH;
  const group = new THREE.Group();
  const topMaterial = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, color),
    roughness: 0.48,
    metalness: 0.02,
  });
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, color, 0.72),
    roughness: 0.55,
    metalness: 0.08,
  });
  const baseMaterial = pedestalMaterial.clone();
  baseMaterial.color = colorOf(THREE, color, 0.62);

  const tabletop = new THREE.Mesh(
    new THREE.CylinderGeometry(
      tabletopSpec.radiusMm * mm,
      tabletopSpec.radiusMm * mm,
      topH,
      tabletopSpec.radialSegments,
    ),
    topMaterial,
  );
  tabletop.position.y = totalH / 2 - topH / 2;
  tabletop.userData.roundTableRole = "tabletop";
  group.add(tabletop);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(
      pedestalSpec.radiusTopMm * mm,
      pedestalSpec.radiusBottomMm * mm,
      pedestalH,
      pedestalSpec.radialSegments,
    ),
    pedestalMaterial,
  );
  pedestal.position.y = -totalH / 2 + baseH + pedestalH / 2;
  pedestal.userData.roundTableRole = "pedestal";
  group.add(pedestal);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(
      baseSpec.radiusMm * mm,
      baseSpec.radiusMm * mm,
      baseH,
      baseSpec.radialSegments,
    ),
    baseMaterial,
  );
  base.position.y = -totalH / 2 + baseH / 2;
  base.userData.roundTableRole = "base";
  group.add(base);

  group.userData.geometryType = geometry.type;
  group.userData.editable = true;
  return group;
}

/** Build an editable top and four legs in room-scale metres. */
export function makeGenericSideTable(
  THREE,
  {
    w = GENERIC_SIDE_TABLE_M.w,
    d = GENERIC_SIDE_TABLE_M.d,
    h = GENERIC_SIDE_TABLE_M.h,
    color = GENERIC_SIDE_TABLE.color,
  } = {},
) {
  const group = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, color),
    roughness: 0.46,
    metalness: 0.03,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, color, 0.88),
    roughness: 0.58,
    metalness: 0.02,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, color, 0.78),
    roughness: 0.62,
    metalness: 0.02,
  });
  const topT = Math.min(0.05, Math.max(0.032, h * 0.08));
  const legT = Math.min(0.05, Math.min(w, d) * 0.091);
  const inset = legT / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, topT, d), topMat);
  top.position.y = h - topT / 2;
  group.add(top);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.002, topT * 0.92, d + 0.002), bandMat);
  band.position.y = h - topT / 2;
  group.add(band);
  const legH = Math.max(0.05, h - topT);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legT, legH, legT), legMat);
    leg.position.set(sx * (w / 2 - inset), legH / 2, sz * (d / 2 - inset));
    group.add(leg);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.min(w, d) * 0.42, 24),
    new THREE.MeshBasicMaterial({
      color: 0x0e1115,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);
  group.userData.genericPlaceholder = true;
  return group;
}

/**
 * Neutral side-table placeholder shared by the Lab and House scenes.
 * Its editable 550 × 550 × 450 mm envelope comes from the catalog; it is not
 * branded CAD or a claim of product equivalence.
 */

export const GENERIC_SIDE_TABLE = Object.freeze({
  id: "generic-side-table",
  widthMm: 550,
  depthMm: 550,
  heightMm: 450,
  topMm: 36,
  legMm: 50,
  color: "#d8c6a3",
});

export const GENERIC_SIDE_TABLE_M = Object.freeze({
  w: GENERIC_SIDE_TABLE.widthMm / 1000,
  d: GENERIC_SIDE_TABLE.depthMm / 1000,
  h: GENERIC_SIDE_TABLE.heightMm / 1000,
});

function colorOf(THREE, hex, mul = 1) {
  const color = new THREE.Color(hex || GENERIC_SIDE_TABLE.color);
  if (mul !== 1) color.multiplyScalar(mul);
  return color;
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

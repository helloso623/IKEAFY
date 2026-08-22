/**
 * Generic IKEA-vibe test table used in the Lab seed, AR/house scene and tests.
 * Proportions match a 550 × 550 mm top standing ~450 mm high. This is a
 * stand-in — specs are needed for an exact IKEA article.
 */

export const TEST_TABLE = Object.freeze({
  id: "generic-side-table",
  widthMm: 550,
  depthMm: 550,
  heightMm: 450,
  topMm: 36,
  legMm: 50,
  color: "#ecdfc6",
  note: "Generic 550 × 550 mm top, ~450 mm high. Specs needed for an exact IKEA article.",
});

export const TEST_TABLE_M = Object.freeze({
  w: TEST_TABLE.widthMm / 1000,
  d: TEST_TABLE.depthMm / 1000,
  h: TEST_TABLE.heightMm / 1000,
});

function colorOf(THREE, hex, mul = 1) {
  const c = new THREE.Color(hex || TEST_TABLE.color);
  if (mul !== 1) c.multiplyScalar(mul);
  return c;
}

/**
 * Birch-foil top with square legs dead flush to the edge band — not a gray box.
 * Units are metres so the mesh sits at room scale in the AR/house scene.
 */
export function makeIkeaTestTable(THREE, { w = TEST_TABLE_M.w, d = TEST_TABLE_M.d, h = TEST_TABLE_M.h, color = TEST_TABLE.color } = {}) {
  const g = new THREE.Group();
  const birch = colorOf(THREE, color);
  const topMat = new THREE.MeshStandardMaterial({ color: birch, roughness: 0.46, metalness: 0.03 });
  const bandMat = new THREE.MeshStandardMaterial({ color: colorOf(THREE, color, 0.88), roughness: 0.58, metalness: 0.02 });
  const legMat = new THREE.MeshStandardMaterial({ color: colorOf(THREE, color, 0.78), roughness: 0.62, metalness: 0.02 });
  const topT = Math.min(0.05, Math.max(0.032, h * 0.08));
  const legT = Math.min(0.05, Math.min(w, d) * 0.091);
  const inset = legT / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, topT, d), topMat);
  top.position.y = h - topT / 2;
  g.add(top);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.002, topT * 0.92, d + 0.002), bandMat);
  band.position.y = h - topT / 2;
  g.add(band);
  const legH = Math.max(0.05, h - topT);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legT, legH, legT), legMat);
    leg.position.set(sx * (w / 2 - inset), legH / 2, sz * (d / 2 - inset));
    g.add(leg);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.min(w, d) * 0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0x0e1115, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  g.add(shadow);
  g.userData.testTable = true;
  return g;
}

export function generatedMeshSpec(action) {
  if (!action || (action.type !== "mesh" && action.type !== "generate")) return null;
  const spec = action.mesh || action.spec || action.geometry || action.object;
  return spec && typeof spec === "object" ? spec : null;
}

export function applyGeneratedAction(action, shop) {
  const spec = generatedMeshSpec(action);
  if (!spec || typeof shop?.addGeneratedMesh !== "function") return null;
  return shop.addGeneratedMesh(spec);
}

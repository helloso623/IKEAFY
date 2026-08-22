/** What the shop can see: mode, watch step, selected piece, bench, room. */

export function sceneContext({
  mode = "ikeafy",
  interfaceName = "upload",
  lab = "desk",
  product = "",
  step = null,
  partId = "",
  partName = "",
  pieceCount = 0,
  pieces = [],
  room = null,
  costBarrier = "",
} = {}) {
  const stepNumber = Number(step);
  const budget = Number(costBarrier);
  return {
    mode: mode === "lab" ? "lab" : "ikeafy",
    interface: interfaceName === "watch" ? "watch" : "upload",
    lab: mode === "lab" ? lab || "desk" : "",
    product: String(product || "").trim(),
    step: Number.isFinite(stepNumber) && stepNumber > 0 ? stepNumber : null,
    partId: String(partId || "").trim(),
    partName: String(partName || "").trim(),
    pieceCount: Number(pieceCount) || 0,
    pieces: (pieces || []).slice(0, 12).map((piece) => ({
      id: piece.id,
      partId: piece.partId,
      name: piece.name || piece.partId,
    })),
    room:
      room && Number.isFinite(Number(room.widthM))
        ? {
            widthM: Number(room.widthM),
            depthM: Number(room.depthM),
            budget: Number.isFinite(Number(room.budget)) ? Number(room.budget) : "",
          }
        : null,
    costBarrier: Number.isFinite(budget) && budget > 0 ? budget : "",
  };
}

export function sceneSummary(scene = {}) {
  const bits = [];
  if (scene.mode === "lab") {
    const space = scene.lab === "house" ? "House" : "Bench";
    bits.push(`Lab · ${space}`);
  } else if (scene.interface === "watch") {
    bits.push(scene.step ? `Watch · step ${scene.step}` : "Watch");
  } else {
    bits.push("Upload");
  }
  if (scene.product) bits.push(scene.product);
  if (scene.partName || scene.partId) bits.push(`Selected ${scene.partName || scene.partId}`);
  else if (scene.mode === "lab") bits.push("Nothing selected");
  if (scene.pieceCount) bits.push(`${scene.pieceCount} on the bench`);
  if (scene.room) bits.push(`Room ${scene.room.widthM} × ${scene.room.depthM} m`);
  if (scene.costBarrier) bits.push(`Under $${scene.costBarrier}`);
  return bits.join(" · ");
}

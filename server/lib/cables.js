const COMPAT = {
  "header-2.54": ["header-2.54", "lead"],
  lead: ["header-2.54", "lead"],
  "usb-mini": ["usb-mini"],
  "usb-c": ["usb-c"],
  "usb-a": ["usb-a"],
  "jst-3": ["jst-3"],
  "barrel-5.5": ["barrel-5.5"],
  "m6-screw": ["m6-insert", "m6-screw"],
  "m6-insert": ["m6-screw"],
};

const LOCK_STRENGTH = {
  header: 6,
  friction: 8,
  jst: 18,
  barrel: 14,
  screw: 80,
};

export function portsCompatible(a, b) {
  if (!a || !b) return false;
  const left = COMPAT[a.kind] || [];
  return left.includes(b.kind);
}

export function canLock(a, b) {
  return portsCompatible(a, b) && a.lock && b.lock && a.lock === b.lock;
}

export function routeCable(fromPort, toPort, { slackMm = 40, managed = "loose" } = {}) {
  if (!portsCompatible(fromPort, toPort)) {
    return {
      ok: false,
      locked: false,
      reason: `Port ${fromPort?.kind} does not mate with ${toPort?.kind}.`,
    };
  }
  const locked = canLock(fromPort, toPort);
  const pullN = LOCK_STRENGTH[fromPort.lock] || 4;
  const bendRadiusMm = managed === "channeled" ? 18 : managed === "bundled" ? 24 : 36;
  const disposition = {
    slackMm,
    bendRadiusMm,
    managed,
    strainRelief: managed !== "loose",
    serviceLoop: slackMm >= 30,
    tangleRisk: managed === "loose" ? "high" : "low",
  };
  return {
    ok: true,
    locked,
    lockKind: fromPort.lock,
    pulloutN: locked ? pullN : pullN * 0.35,
    disposition,
    note: locked
      ? `Clicks in (${fromPort.lock}). Pull-out ${pullN} N.`
      : `Fits but does not lock. Add a zip-tie strain relief.`,
  };
}

export function manageBundle(cables, { style = "bundled" } = {}) {
  const lengthMm = cables.reduce((sum, c) => sum + (c.lengthMm || 150), 0);
  return {
    count: cables.length,
    style,
    zipTies: style === "loose" ? 0 : Math.max(1, Math.ceil(cables.length / 3)),
    channelMm: style === "channeled" ? 12 : 0,
    slackBudgetMm: style === "loose" ? lengthMm * 0.25 : lengthMm * 0.08,
    note:
      style === "channeled"
        ? "Cables sit in a 12 mm raceway under the top."
        : style === "bundled"
          ? "Bundle with zip ties every 120 mm."
          : "Loose loom — expect snags when you flip the table.",
  };
}

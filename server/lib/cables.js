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

const POWER_LABELS = { "5v": "+5V", "3v3": "+3V3", vin: "VIN", vcc: "VCC" };

export function isGroundPort(portId) {
  return /^(gnd|ground|0v)$/i.test(String(portId || ""));
}

export function isPowerPort(portId) {
  return Boolean(POWER_LABELS[String(portId || "").toLowerCase()]);
}

/**
 * Group the project's cables into named nets, the way a schematic tool would:
 * anything touching a ground pin is GND, rails become +5V/+3V3, a net driven
 * by an MCU pin borrows that pin's name (D13, D2), and the leftovers get
 * numbered N$1, N$2… in the order they were wired.
 */
export function buildNetlist(project = {}, lookupPart = () => null) {
  const pieces = project.pieces || [];
  const cables = (project.cables || []).filter((c) => c.ok !== false);
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const key = (pieceId, portId) => `${pieceId}::${portId}`;

  const parent = new Map();
  const ensure = (k) => {
    if (!parent.has(k)) parent.set(k, k);
  };
  const find = (k) => {
    let cur = k;
    while (parent.get(cur) !== cur) cur = parent.get(cur);
    parent.set(k, cur);
    return cur;
  };

  for (const c of cables) {
    const ka = key(c.fromPiece, c.fromPort);
    const kb = key(c.toPiece, c.toPort);
    ensure(ka);
    ensure(kb);
    parent.set(find(ka), find(kb));
  }

  const groups = new Map();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(k);
  }

  let anon = 0;
  const nets = [];
  const netByRoot = new Map();
  for (const [root, keys] of groups) {
    const members = keys.map((k) => {
      const [pieceId, portId] = k.split("::");
      const piece = pieceById.get(pieceId);
      const part = piece ? lookupPart(piece.partId) : null;
      const port = part?.ports?.find((p) => p.id === portId);
      return {
        pieceId,
        portId,
        ref: piece?.ref || null,
        partId: piece?.partId || null,
        partName: part?.name || piece?.partId || pieceId,
        kind: port?.kind || null,
        firmwareRole: part?.firmwareRole || null,
        functionLabel: piece?.functionLabel || null,
      };
    });
    let name = null;
    let klass = "signal";
    if (members.some((m) => isGroundPort(m.portId))) {
      name = "GND";
      klass = "ground";
    } else {
      const rail = members.find((m) => isPowerPort(m.portId));
      if (rail) {
        name = POWER_LABELS[rail.portId.toLowerCase()];
        klass = "power";
      } else {
        const mcuPin = members.find((m) => m.firmwareRole === "mcu");
        if (mcuPin) name = mcuPin.portId.toUpperCase();
      }
    }
    if (!name) {
      anon += 1;
      name = `N$${anon}`;
    }
    if (klass === "signal" && members.some((m) => /usb/.test(m.kind || "") || /^(din|usb)$/i.test(m.portId))) {
      klass = "data";
    }
    const net = { name, class: klass, members, cableIds: [], locked: true };
    nets.push(net);
    netByRoot.set(root, net);
  }

  const cableNets = {};
  for (const c of cables) {
    const net = netByRoot.get(find(key(c.fromPiece, c.fromPort)));
    if (!net) continue;
    net.cableIds.push(c.id);
    if (!c.locked) net.locked = false;
    if (c.id) cableNets[c.id] = net.name;
  }

  const ports = {};
  for (const net of nets) {
    for (const m of net.members) ports[key(m.pieceId, m.portId)] = net.name;
  }

  const rank = { ground: 0, power: 1, data: 2, signal: 3 };
  nets.sort((a, b) => (rank[a.class] ?? 9) - (rank[b.class] ?? 9) || a.name.localeCompare(b.name));

  return { nets, cableNets, ports };
}

/**
 * Electrical rule check over the netlist. Errors are the wires the bench
 * refuses outright (a rail shorted to ground); warnings are the ones it lets
 * you keep while telling you why they will bite.
 */
export function ercReport(project = {}, lookupPart = () => null) {
  const netlist = buildNetlist(project, lookupPart);
  const findings = [];

  for (const net of netlist.nets) {
    const rail = net.members.find((m) => isPowerPort(m.portId));
    if (rail && net.members.some((m) => isGroundPort(m.portId))) {
      findings.push({
        level: "error",
        code: "power-short",
        net: net.name,
        text: `${POWER_LABELS[rail.portId.toLowerCase()]} is wired straight to GND — dead short on ${net.name}.`,
      });
    }
    const mcuPin = net.members.find((m) => m.firmwareRole === "mcu" && /^d\d+$/i.test(m.portId));
    const anode = net.members.find((m) => m.portId === "anode");
    const hasResistor = net.members.some((m) => /resistor/.test(m.partId || ""));
    if (mcuPin && anode && !hasResistor) {
      findings.push({
        level: "warning",
        code: "no-series-resistor",
        net: net.name,
        text: `${anode.ref || anode.partName} hangs straight off ${net.name} — put a series resistor in line.`,
      });
    }
  }

  for (const piece of project.pieces || []) {
    const part = lookupPart(piece.partId);
    if (!part) continue;
    const wiredPort = (id) => netlist.ports[`${piece.id}::${id}`] || null;
    const anyWired = (part.ports || []).some((p) => wiredPort(p.id));
    if (part.firmwareRole === "led" && wiredPort("anode") && !wiredPort("cathode")) {
      findings.push({
        level: "warning",
        code: "floating-cathode",
        text: `${piece.ref || part.name}: anode sits on ${wiredPort("anode")} but the cathode floats — return it to GND.`,
      });
    }
    if (part.firmwareRole === "mcu" && anyWired && !wiredPort("gnd")) {
      findings.push({
        level: "warning",
        code: "mcu-no-ground",
        text: `${piece.ref || part.name}: signals leave the board but GND is not wired.`,
      });
    }
    if (piece.functionLabel && part.category === "electronics" && !anyWired) {
      findings.push({
        level: "warning",
        code: "labeled-unwired",
        text: `${piece.ref || part.name} is labeled “${piece.functionLabel}” but nothing is wired to it.`,
      });
    }
  }

  const errors = findings.filter((f) => f.level === "error");
  const warnings = findings.filter((f) => f.level === "warning");
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    findings,
    counts: { nets: netlist.nets.length, errors: errors.length, warnings: warnings.length },
    note: errors.length
      ? `ERC: ${errors.length} error${errors.length === 1 ? "" : "s"} — fix the short before power.`
      : warnings.length
        ? `ERC: no errors, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
        : "ERC clean — every net checks out.",
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

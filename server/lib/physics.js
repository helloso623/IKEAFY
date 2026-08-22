const AIR_DENSITY = 1.225;
const WATER_DENSITY = 997;

function partAreaM2(part) {
  const { x, y } = part.dimsMm;
  return (x * y) / 1e6;
}

function massKg(part) {
  return (part.massG || 1) / 1000;
}

export function strengthTest(part, { forceN = 200, tapeShearN = 0 } = {}) {
  const area = Math.max(partAreaM2(part), 1e-6);
  const stressMpa = forceN / area / 1e6;
  const allowable = part.strengthMpa || 10;
  const tapedAllowable = allowable + tapeShearN / area / 1e6;
  const safety = tapedAllowable / Math.max(stressMpa, 1e-6);
  const cracked = safety < 1;
  return {
    kind: "strength",
    forceN,
    stressMpa: Number(stressMpa.toFixed(3)),
    allowableMpa: allowable,
    tapedAllowableMpa: Number(tapedAllowable.toFixed(3)),
    safetyFactor: Number(safety.toFixed(2)),
    cracked,
    breakingPointN: Number((allowable * area * 1e6).toFixed(1)),
    note: cracked
      ? `${part.name} yields. Back off load or add gaffer at the joint.`
      : `${part.name} holds with safety ${safety.toFixed(2)}.`,
  };
}

export function pressureTest(part, { pressureKpa = 20 } = {}) {
  const area = Math.max(partAreaM2(part), 1e-6);
  const forceN = pressureKpa * 1000 * area;
  const nested = strengthTest(part, { forceN });
  return {
    kind: "pressure",
    pressureKpa,
    equivalentForceN: Number(forceN.toFixed(1)),
    ...nested,
    kind: "pressure",
  };
}

export function waveTest(part, { frequencyHz = 12, amplitudeMm = 4 } = {}) {
  const mass = massKg(part);
  const stiffness = (part.strengthMpa || 10) * 1e5;
  const natural = Math.sqrt(stiffness / Math.max(mass, 0.01)) / (2 * Math.PI);
  const detune = Math.abs(frequencyHz - natural);
  const resonance = detune < natural * 0.12;
  return {
    kind: "wave",
    frequencyHz,
    amplitudeMm,
    naturalHz: Number(natural.toFixed(2)),
    resonance,
    note: resonance
      ? `${part.name} rings near ${natural.toFixed(1)} Hz — add damping tape.`
      : `${part.name} stays quiet. Natural freq ${natural.toFixed(1)} Hz.`,
  };
}

export function flowTest(part, { velocityMs = 2, fluid = "air" } = {}) {
  const density = fluid === "water" ? WATER_DENSITY : AIR_DENSITY;
  const area = Math.max(partAreaM2(part), 1e-6);
  const q = velocityMs * area;
  const dynamicP = 0.5 * density * velocityMs ** 2;
  return {
    kind: "flow",
    fluid,
    velocityMs,
    volumeFlowM3s: Number(q.toFixed(5)),
    dynamicPressurePa: Number(dynamicP.toFixed(1)),
    note: `${fluid} over ${part.name}: Q=${q.toFixed(4)} m³/s, q=${dynamicP.toFixed(0)} Pa.`,
  };
}

export function aeroTest(part, { velocityMs = 8, cd = 1.05 } = {}) {
  const area = Math.max(partAreaM2(part), 1e-6);
  const dragN = 0.5 * AIR_DENSITY * velocityMs ** 2 * cd * area;
  const tip = strengthTest(part, { forceN: dragN });
  return {
    kind: "aero",
    velocityMs,
    cd,
    dragN: Number(dragN.toFixed(2)),
    safetyFactor: tip.safetyFactor,
    cracked: tip.cracked,
    note: `Drag ${dragN.toFixed(1)} N at ${velocityMs} m/s. ${tip.note}`,
  };
}

export function speedForceTest(part, { forceN = 12, seconds = 1.5 } = {}) {
  const mass = Math.max(massKg(part), 0.001);
  const accel = forceN / mass;
  const speed = accel * seconds;
  const distance = 0.5 * accel * seconds ** 2;
  return {
    kind: "speed",
    forceN,
    seconds,
    accelMs2: Number(accel.toFixed(3)),
    speedMs: Number(speed.toFixed(3)),
    distanceM: Number(distance.toFixed(3)),
    note: `${part.name} reaches ${speed.toFixed(2)} m/s after ${seconds}s under ${forceN} N.`,
  };
}

export function weatherTest(part, { tempC = 22, rain = false, tapeSeal = 0 } = {}) {
  const alpha = part.thermalAlpha || 0.00002;
  const dT = tempC - 22;
  const growthMm = alpha * (part.dimsMm?.x || 100) * dT;
  const coldBrittle = tempC < 0 && (part.material === "PLA" || part.material === "ABS");
  const hotSag = tempC > 55 && (part.material === "PLA" || part.material === "particleboard");
  const electronics = part.category === "electronics";
  const bareIp = electronics ? 20 : 40;
  const ip = Math.min(67, bareIp + Math.round(tapeSeal * 20));
  const shortRisk = rain && electronics && ip < 44;
  const swell = rain && (part.material === "particleboard" || part.material === "pine");
  const issues = [];
  if (coldBrittle) issues.push("cold embrittlement");
  if (hotSag) issues.push("heat sag");
  if (shortRisk) issues.push("rain short risk");
  if (swell) issues.push("moisture swell");
  return {
    kind: "weather",
    tempC,
    rain,
    growthMm: Number(growthMm.toFixed(3)),
    ip,
    issues,
    failed: shortRisk || (hotSag && dT > 40) || (swell && !tapeSeal),
    note: issues.length
      ? `${part.name}: ${issues.join(", ")}. Tape or shade it.`
      : `${part.name} is fine at ${tempC}°C${rain ? " in rain" : ""}.`,
  };
}

export function tapeHold(tapePart, { areaMm2 = 400, loadN = 20 } = {}) {
  const shearKpa = tapePart.specs?.shearKpa || 80;
  const peelN = tapePart.specs?.peelN || 3;
  const capacityN = (shearKpa * 1000 * areaMm2) / 1e6;
  const holds = capacityN >= loadN && peelN * (areaMm2 / 200) >= loadN * 0.25;
  return {
    kind: "tape",
    tape: tapePart.name,
    areaMm2,
    loadN,
    capacityN: Number(capacityN.toFixed(1)),
    holds,
    weatherSeal: tapePart.specs?.weatherSeal || 0,
    ipBoost: tapePart.specs?.ipBoost || 0,
    note: holds
      ? `${tapePart.name} holds ${loadN} N on ${areaMm2} mm².`
      : `${tapePart.name} peels. Use gaffer or more wrap.`,
  };
}

export function runSuite(part, tapePart, options = {}) {
  const tape = tapePart
    ? tapeHold(tapePart, { areaMm2: options.tapeAreaMm2 || 400, loadN: options.forceN || 20 })
    : null;
  const tapeShearN = tape?.holds ? tape.capacityN : 0;
  const tapeSeal = tape?.weatherSeal || 0;
  const tests = {
    strength: strengthTest(part, { forceN: options.forceN || 200, tapeShearN }),
    pressure: pressureTest(part, { pressureKpa: options.pressureKpa || 20 }),
    wave: waveTest(part, { frequencyHz: options.frequencyHz || 12 }),
    flow: flowTest(part, { velocityMs: options.flowMs || 2, fluid: options.fluid || "air" }),
    aero: aeroTest(part, { velocityMs: options.aeroMs || 8 }),
    speed: speedForceTest(part, { forceN: options.speedForceN || 12 }),
    weather: weatherTest(part, {
      tempC: options.tempC ?? 22,
      rain: Boolean(options.rain),
      tapeSeal,
    }),
  };
  if (tape) tests.tape = tape;
  const failed = Object.values(tests).filter((t) => t.cracked || t.failed || t.holds === false);
  return {
    partId: part.id,
    tapeId: tapePart?.id || null,
    tests,
    failed: failed.map((t) => t.kind),
    ok: failed.length === 0,
  };
}

export function engineeringReport(parts, options = {}) {
  const rows = parts.map((part) => runSuite(part, options.tapePart, options));
  const issues = rows.flatMap((row) =>
    row.failed.map((kind) => ({
      partId: row.partId,
      kind,
      detail: row.tests[kind]?.note,
    })),
  );
  return {
    title: "Overall system stresses",
    rows,
    issues,
    breakingPoints: rows.map((row) => ({
      partId: row.partId,
      breakingPointN: row.tests.strength.breakingPointN,
      safetyFactor: row.tests.strength.safetyFactor,
    })),
  };
}

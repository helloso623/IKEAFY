function boxStl(name, { x, y, z }) {
  const hx = x / 2;
  const hy = y / 2;
  const hz = z / 2;
  const v = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 6, 5],
    [4, 7, 6],
    [0, 4, 5],
    [0, 5, 1],
    [3, 2, 6],
    [3, 6, 7],
    [0, 3, 7],
    [0, 7, 4],
    [1, 5, 6],
    [1, 6, 2],
  ];
  const lines = [`solid ${name}`];
  for (const [a, b, c] of faces) {
    lines.push("  facet normal 0 0 0");
    lines.push("    outer loop");
    for (const i of [a, b, c]) {
      lines.push(`      vertex ${v[i][0]} ${v[i][1]} ${v[i][2]}`);
    }
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n");
}

export function exportPrintJob(parts) {
  const printable = parts.filter((p) => p.printable);
  const jobs = printable.map((part) => ({
    id: part.id,
    name: part.name,
    material: part.material === "PLA" || part.printable ? "PLA" : part.material,
    nozzleMm: part.specs?.nozzleMm || 0.4,
    layerMm: 0.2,
    stl: boxStl(part.id, part.dimsMm),
    minutes: Math.max(8, Math.round((part.dimsMm.x * part.dimsMm.y * part.dimsMm.z) / 80000)),
  }));
  return {
    ok: jobs.length > 0,
    printer: "workshop.local",
    jobs,
    note: jobs.length
      ? `Queued ${jobs.length} body(ies) as ASCII STL.`
      : "Nothing printable on the bench. Add a PLA enclosure or a printed leg.",
  };
}

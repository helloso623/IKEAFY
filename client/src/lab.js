/**
 * Lab strip — a Blender-ish viewport bar over #view plus a stacked behavior sim.
 *
 * Viewport: Look is unlit clay (no shadows); Look at frames the selection.
 * Measure clicks two world points and labels the span in millimetres.
 * Solid / material / wire shading still sit next to those. Modifiers-lite
 * duplicates the selected piece through api.add (array 2× along X, mirror
 * across the Y axis). One Run sim stacks strength / weather / heat / rain /
 * tape / force through /api/physics/sim and animates the result via shop.setSim;
 * the sim reads the function graph, so a piece labeled "light" blinks.
 */

const SIM_CHIPS = ["strength", "weather", "heat", "rain", "tape", "force"];
const GRAPH_ORDER = ["sense", "control", "light"];

function clonePose(piece, patch = {}) {
  return {
    x: piece.x,
    y: piece.y,
    z: piece.z,
    rx: piece.rx || 0,
    ry: piece.ry || 0,
    rz: piece.rz || 0,
    sx: piece.sx || 1,
    sy: piece.sy || 1,
    sz: piece.sz || 1,
    color: piece.color,
    texture: piece.texture,
    functionLabel: piece.functionLabel || null,
    ...patch,
  };
}

function graphLine(project) {
  const seen = new Set();
  for (const piece of project?.pieces || []) {
    if (piece.functionLabel) seen.add(piece.functionLabel);
  }
  if (!seen.size) return "Graph: no function labels yet — Label function names a piece's job.";
  const chain = [...GRAPH_ORDER.filter((label) => seen.has(label)), ...[...seen].filter((l) => !GRAPH_ORDER.includes(l))];
  return `Graph: ${chain.join(" → ")}`;
}

export function initLabStrip({ api, shop, hud, getProject, partsById, refreshProject }) {
  const strip = document.getElementById("viewport-strip");
  const out = document.getElementById("vs-out");
  if (!strip) return null;

  strip.innerHTML = `
    <div class="vs-group" role="group" aria-label="Look">
      <button type="button" id="vs-look" title="Unlit clay — no shadows, MeshBasicMaterial">Look</button>
      <button type="button" id="vs-frame" title="Look at / frame selected — like Blender's numpad-.">Look at</button>
    </div>
    <div class="vs-seg" role="group" aria-label="Shading">
      <button type="button" data-shade="solid">Solid</button>
      <button type="button" data-shade="material" class="on">Material</button>
      <button type="button" data-shade="wire">Wire</button>
    </div>
    <button type="button" id="vs-measure" title="Click two points in the 3D view — distance in mm">Measure</button>
    <span class="vs-sep"></span>
    <div class="vs-group" role="group" aria-label="Modifiers">
      <button type="button" id="vs-array" title="Duplicate the selected piece once along X">Array 2×X</button>
      <button type="button" id="vs-mirror" title="Duplicate the selected piece mirrored across the Y axis">Mirror Y</button>
    </div>
    <span class="vs-sep"></span>
    <div class="vs-group" role="group" aria-label="Simulation stack">
      ${SIM_CHIPS.map(
        (kind) => `<button type="button" class="chip" data-sim="${kind}">${kind[0].toUpperCase()}${kind.slice(1)}</button>`,
      ).join("")}
      <button type="button" id="vs-run" class="primary">Run sim</button>
    </div>`;

  function say(lines) {
    if (!out) return;
    out.textContent = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines || "");
  }

  // ---- Viewport ----------------------------------------------------------
  function paintLook() {
    const on = shop.getLook?.() || false;
    for (const id of ["vs-look", "lab-look"]) {
      document.getElementById(id)?.classList.toggle("on", on);
    }
  }

  function paintMeasure() {
    const on = shop.getMeasure?.() || false;
    for (const id of ["vs-measure", "lab-measure"]) {
      document.getElementById(id)?.classList.toggle("on", on);
    }
  }

  function toggleLook() {
    const on = shop.setLook?.(!shop.getLook?.());
    paintLook();
    hud(on ? "Look — unlit clay, no shadows." : "Look off — lights and materials back.");
  }

  function lookAt() {
    const framed = shop.frameSelected();
    hud(framed ? "Looking at the selection. Orbit with the mouse, scroll to zoom." : "Nothing on the bench to look at.");
  }

  function toggleMeasure() {
    const on = shop.setMeasure?.(!shop.getMeasure?.());
    paintMeasure();
    hud(on ? "Measure — click two points. Distance reads in mm." : "Measure off.");
  }

  strip.querySelector("#vs-look").addEventListener("click", toggleLook);
  strip.querySelector("#vs-frame").addEventListener("click", lookAt);
  strip.querySelector("#vs-measure").addEventListener("click", toggleMeasure);
  document.getElementById("lab-look")?.addEventListener("click", toggleLook);
  document.getElementById("lab-look-at")?.addEventListener("click", lookAt);
  document.getElementById("lab-measure")?.addEventListener("click", toggleMeasure);

  document.getElementById("view")?.addEventListener("ikealive-viewport", () => {
    paintLook();
    paintMeasure();
  });

  strip.addEventListener("click", (ev) => {
    const shade = ev.target.closest("[data-shade]")?.dataset.shade;
    if (!shade) return;
    shop.setShading(shade);
    paintLook();
    for (const btn of strip.querySelectorAll("[data-shade]")) {
      btn.classList.toggle("on", btn.dataset.shade === shade);
    }
    hud(
      shade === "wire"
        ? "Wireframe — edges only."
        : shade === "solid"
          ? "Solid — lit clay, no materials."
          : "Material — full shading, LEDs can glow.",
    );
  });

  window.addEventListener("keydown", (ev) => {
    const tag = ev.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
    if (ev.key === ".") lookAt();
    if (ev.key.toLowerCase() === "l") toggleLook();
    if (ev.key.toLowerCase() === "m") toggleMeasure();
  });

  // ---- Modifiers-lite ----------------------------------------------------
  async function duplicate(patchFor, label) {
    const sel = shop.getSelected();
    if (!sel?.piece || !sel.part) {
      hud("Pick a piece first, then apply the modifier.");
      return;
    }
    const patch = patchFor(sel.piece, sel.part);
    if (!patch) return;
    await api.add(sel.part.id, clonePose(sel.piece, patch));
    await refreshProject();
    hud(`${label}: added a second ${sel.part.name}.`);
  }

  strip.querySelector("#vs-array").addEventListener("click", () =>
    duplicate((piece, part) => {
      const dx = (part.dimsMm.x / 1000) * (piece.sx || 1) + 0.02;
      return { x: piece.x + dx };
    }, "Array 2×X"),
  );

  strip.querySelector("#vs-mirror").addEventListener("click", () =>
    duplicate((piece) => {
      if (Math.abs(piece.x) < 0.005) {
        hud("That piece sits on the Y axis — nudge it sideways first, then Mirror.");
        return null;
      }
      return { x: -piece.x, ry: -(piece.ry || 0) };
    }, "Mirror Y"),
  );

  // ---- Stacked sim -------------------------------------------------------
  strip.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip[data-sim]");
    if (chip) chip.classList.toggle("on");
  });

  function chipOn(kind) {
    return strip.querySelector(`.chip[data-sim="${kind}"]`)?.classList.contains("on") || false;
  }

  strip.querySelector("#vs-run").addEventListener("click", async () => {
    const opts = Object.fromEntries(SIM_CHIPS.map((kind) => [kind, chipOn(kind)]));
    opts.tempC = opts.heat ? 60 : 22;
    opts.forceN = 200;
    hud("Running the stacked sim…");
    await api.simStart();
    const report = await api.simRun(opts);
    shop.setSim(true, {
      rain: opts.rain,
      heat: opts.heat,
      force: opts.strength || opts.force,
      shake: opts.strength || opts.force,
      ledHz: report.led?.blink ? report.led.hz || 2 : 0,
    });
    say([
      `Stacked: ${report.stacked.join(" + ")}${report.tapeId ? ` · ${report.tapeId}` : ""}`,
      graphLine(getProject()),
      report.led?.note,
      ...report.failures.slice(0, 4).map((f) => `✗ ${partsById[f.partId]?.name || f.partId}: ${f.note}`),
      report.ok ? "✓ All holding." : null,
    ]);
    hud(report.note);
  });

  document.getElementById("fn-btns")?.addEventListener("click", async (event) => {
    const functionLabel = event.target.closest("[data-fn]")?.dataset.fn;
    if (!functionLabel) return;
    const selected = shop.getSelected();
    if (!selected?.piece) {
      hud("Pick a piece, then assign its job.");
      return;
    }
    await api.label(selected.piece.id, functionLabel);
    await refreshProject();
    hud(`${selected.part?.name || "Piece"} is now ${functionLabel}.`);
  });

  say([graphLine(getProject()), "Stack chips, then Run sim."]);
  return { say };
}

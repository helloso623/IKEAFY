/**
 * Lab strip — a Blender-ish viewport bar over #view.
 *
 * Viewport: Look is unlit clay (no shadows); Look at frames the selection.
 * Measure clicks two world points and labels the span in millimetres.
 * Solid / material / wire shading still sit next to those. Modifiers-lite
 * duplicates the selected piece through api.add (array 2× along X, mirror
 * across the Y axis).
 */

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

export function initLabStrip({ api, shop, hud, refreshProject }) {
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
    for (const id of ["vs-measure", "lab-measure", "side-measure"]) {
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
  document.getElementById("side-measure")?.addEventListener("click", toggleMeasure);

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

  say("Select a piece to inspect or modify it.");
  return { say };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSceneContext, setAiDockOpen } from "../client/src/ai-dock.js";

test("buildSceneContext lists the selected piece and Lab mode", () => {
  const scene = buildSceneContext({
    lab: "house",
    mode: "lab",
    pieces: [
      { id: "p1", name: "LACK table top", partId: "lack-top", dimsMm: { x: 550, y: 50, z: 550 } },
      { id: "p2", name: "LACK leg", partId: "lack-leg" },
    ],
    selected: { id: "p1", name: "LACK table top", partId: "lack-top", dimsMm: { x: 550, y: 50, z: 550 } },
    hasViewportStill: true,
  });
  assert.equal(scene.lab, "house");
  assert.equal(scene.pieceCount, 2);
  assert.equal(scene.selected.name, "LACK table top");
  assert.equal(scene.selected.dimsMm.x, 550);
  assert.equal(scene.hasViewportStill, true);
});

test("setAiDockOpen toggles hidden and aria", () => {
  const dock = { hidden: true, classList: { toggle() {} }, setAttribute() {} };
  const flags = {};
  dock.classList.toggle = (name, on) => {
    flags[name] = on;
  };
  dock.setAttribute = (name, value) => {
    flags[name] = value;
  };
  const orb = { classList: { toggle() {} }, setAttribute() {} };
  orb.classList.toggle = (name, on) => {
    flags[`orb-${name}`] = on;
  };
  orb.setAttribute = (name, value) => {
    flags[`orb-${name}`] = value;
  };
  setAiDockOpen(true, { orb, dock });
  assert.equal(dock.hidden, false);
  assert.equal(flags.open, true);
  assert.equal(flags["aria-hidden"], "false");
  assert.equal(flags["orb-aria-expanded"], "true");
});

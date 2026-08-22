import { test } from "node:test";
import assert from "node:assert/strict";
import { addCable, addPiece, addTape, emptyProject, removePiece, seedLampTable } from "../server/lib/project.js";

test("removePiece drops the piece and cables/tapes that touch it", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top", { x: 0, y: 0.2, z: 0 });
  const nano = addPiece(project, "arduino-nano", { x: 0.1, y: 0.26, z: 0 });
  const led = addPiece(project, "led-5mm", { x: 0.16, y: 0.26, z: 0 });
  addCable(project, nano.id, "d13", led.id, "anode");
  addTape(project, "tape-gaffer", [top.id, nano.id]);

  const gone = removePiece(project, nano.id);
  assert.equal(gone.id, nano.id);
  assert.equal(project.pieces.some((p) => p.id === nano.id), false);
  assert.equal(project.pieces.length, 2);
  assert.equal(project.cables.length, 0);
  assert.equal(project.tapes.length, 0);
});

test("removePiece on a seeded board only strips nets that touch that id", () => {
  const project = seedLampTable();
  const led = project.pieces.find((p) => p.partId === "led-5mm");
  const beforeCables = project.cables.length;
  const beforeTapes = project.tapes.length;
  assert.ok(led);

  removePiece(project, led.id);
  assert.equal(project.pieces.some((p) => p.id === led.id), false);
  assert.ok(project.cables.length < beforeCables);
  assert.equal(
    project.cables.every((c) => c.fromPiece !== led.id && c.toPiece !== led.id),
    true,
  );
  assert.equal(project.tapes.length, beforeTapes);
});

test("removePiece is a no-op for an unknown id", () => {
  const project = emptyProject();
  addPiece(project, "lack-leg");
  assert.equal(removePiece(project, "p-missing"), null);
  assert.equal(project.pieces.length, 1);
});

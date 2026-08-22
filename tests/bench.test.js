import { test } from "node:test";
import assert from "node:assert/strict";
import { addPiece, benchChrome, emptyProject, removePiece, seedLampTable } from "../server/lib/project.js";

test("a bench with nothing electronic on it hides the electronics chrome", () => {
  const project = emptyProject();
  addPiece(project, "lack-top");
  addPiece(project, "lack-leg");

  const chrome = benchChrome(project);
  assert.equal(chrome.electronics, false);
  assert.equal(chrome.show.cablesPanel, false);
  assert.equal(chrome.show.isolateBoard, false);
  assert.equal(chrome.show.labelFunction, false);
  assert.equal(chrome.show.firmware, false);
  assert.equal(chrome.show.ports, false);
  assert.equal(chrome.show.tape, true);
  assert.match(chrome.note, /stay off the panel/);
});

test("an empty bench offers nothing at all", () => {
  const chrome = benchChrome(emptyProject());
  assert.equal(chrome.electronics, false);
  assert.equal(chrome.counts.pieces, 0);
  assert.equal(chrome.show.tape, false);
});

test("the seeded lamp table does show the electronics chrome", () => {
  const chrome = benchChrome(seedLampTable());
  assert.equal(chrome.electronics, true);
  assert.equal(chrome.show.cablesPanel, true);
  assert.equal(chrome.show.firmware, true);
  assert.ok(chrome.counts.electronics >= 3);
});

test("deleting the last electronic piece turns the chrome back off", () => {
  const project = emptyProject();
  addPiece(project, "lack-top");
  const nano = addPiece(project, "arduino-nano");
  assert.equal(benchChrome(project).electronics, true);

  removePiece(project, nano.id);
  assert.equal(benchChrome(project).electronics, false);
  assert.equal(benchChrome(project).counts.pieces, 1);
});

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
  assert.match(chrome.note, /furniture-only|stay off/i);
});

test("an empty bench offers nothing at all", () => {
  const chrome = benchChrome(emptyProject());
  assert.equal(chrome.electronics, false);
  assert.equal(chrome.counts.pieces, 0);
  assert.equal(chrome.show.tape, false);
});

test("the seeded lamp table flips the bench to EDA", () => {
  const chrome = benchChrome(seedLampTable());
  assert.equal(chrome.electronics, true);
  assert.equal(chrome.show.cablesPanel, true);
  assert.equal(chrome.show.firmware, true);
  assert.equal(chrome.show.ports, true);
  assert.equal(chrome.show.isolateBoard, true);
  assert.ok(chrome.counts.electronics >= 3);
});

test("deleting the last electronic piece turns the EDA chrome back off", () => {
  const project = emptyProject();
  addPiece(project, "lack-top");
  const nano = addPiece(project, "arduino-nano");
  assert.equal(benchChrome(project).electronics, true);
  assert.equal(benchChrome(project).counts.electronics, 1);

  removePiece(project, nano.id);
  assert.equal(benchChrome(project).electronics, false);
  assert.equal(benchChrome(project).counts.electronics, 0);
  assert.equal(benchChrome(project).counts.pieces, 1);
});

/**
 * The physics preview must tell a solid table from a build that collapses,
 * tips, or hangs on a sliver of a joint. These tests feed the pure analyzer
 * hand-built boxes (millimetres in, world metres inside) and check the
 * verdict plus the reason — no three.js, no DOM.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeStability, boxAt, describeStability } from "../client/src/stability.js";

function fourLegTable({ topShiftXMm = 0 } = {}) {
  const legs = [
    [-180, -180],
    [-180, 180],
    [180, -180],
    [180, 180],
  ].map(([x, z], i) => ({ id: `leg-${i}`, name: `Leg ${i + 1}`, box: boxAt([x, 350, z], [40, 700, 40]) }));
  return [
    ...legs,
    { id: "top", name: "Table top", box: boxAt([topShiftXMm, 710, 0], [500, 20, 500]) },
  ];
}

test("a four-leg table holds", () => {
  const report = analyzeStability(fourLegTable());
  assert.equal(report.verdict, "holds");
  assert.equal(report.holds, true);
  assert.deepEqual(report.issues, []);
  assert.equal(report.pieceCount, 5);
  assert.ok(report.baseMarginMm > 100, "the centre of mass sits well inside the legs");
  assert.match(describeStability(report), /^Holds/);
});

test("a stacked pedestal table holds", () => {
  const report = analyzeStability([
    { id: "base", name: "Base plate", box: boxAt([0, 10, 0], [500, 20, 500]) },
    { id: "column", name: "Column", box: boxAt([0, 370, 0], [200, 700, 200]) },
    { id: "top", name: "Round top", box: boxAt([0, 735, 0], [900, 30, 900]) },
  ]);
  assert.equal(report.verdict, "holds");
  assert.deepEqual(report.issues, []);
});

test("a body hanging in the air breaks — it would fall", () => {
  const report = analyzeStability([
    { id: "shelf", name: "Floating shelf", box: boxAt([0, 500, 0], [400, 20, 200]) },
  ]);
  assert.equal(report.verdict, "breaks");
  assert.equal(report.issues[0].kind, "floating");
  assert.match(report.issues[0].detail, /would drop \d+ mm/);
  assert.match(describeStability(report), /^Breaks/);
});

test("an overhung top tips the whole table", () => {
  const pieces = [
    [-130, -130],
    [-130, 130],
    [130, -130],
    [130, 130],
  ].map(([x, z], i) => ({ id: `leg-${i}`, name: `Leg ${i + 1}`, box: boxAt([x, 350, z], [40, 700, 40]) }));
  pieces.push({ id: "top", name: "Long top", box: boxAt([300, 710, 0], [800, 20, 400]) });
  const report = analyzeStability(pieces);
  assert.equal(report.verdict, "breaks");
  assert.ok(report.issues.some((issue) => issue.kind === "tip"), "the failure is a tip-over");
});

test("a top balanced on one corner leg slides off", () => {
  const report = analyzeStability([
    { id: "leg", name: "Corner leg", box: boxAt([230, 350, 230], [40, 700, 40]) },
    { id: "top", name: "Table top", box: boxAt([0, 710, 0], [500, 20, 500]) },
  ]);
  assert.equal(report.verdict, "breaks");
  const tip = report.issues.find((issue) => issue.kind === "tip" && issue.pieceId === "top");
  assert.ok(tip, "the top itself is flagged, not just the assembly");
  assert.match(tip.detail, /past its supports/);
});

test("a big top on a sliver post is a failed joint", () => {
  const report = analyzeStability([
    { id: "post", name: "Thin post", box: boxAt([0, 350, 0], [6, 700, 6]) },
    { id: "top", name: "Wide top", box: boxAt([0, 710, 0], [600, 18, 600]) },
  ]);
  assert.equal(report.verdict, "breaks");
  const joint = report.issues.find((issue) => issue.kind === "joint");
  assert.ok(joint, "the sliver contact reads as a joint failure");
  assert.match(joint.detail, /mm² of joint/);
  assert.ok(!report.issues.some((issue) => issue.kind === "floating"), "the top is supported, just badly");
});

test("a laterally fastened apron counts as held, not floating", () => {
  const report = analyzeStability([
    { id: "leg-a", name: "Leg A", box: boxAt([-200, 350, 0], [40, 700, 40]) },
    { id: "leg-b", name: "Leg B", box: boxAt([200, 350, 0], [40, 700, 40]) },
    // The apron spans exactly between the legs' inner faces and never
    // touches the floor — a side joint has to keep it grounded.
    { id: "apron", name: "Apron", box: boxAt([0, 600, 0], [360, 80, 30]) },
  ]);
  assert.ok(!report.issues.some((issue) => issue.pieceId === "apron"), "the apron is fastened, not falling");
});

test("nudging the same table from stable to unstable flips the verdict", () => {
  assert.equal(analyzeStability(fourLegTable({ topShiftXMm: 0 })).verdict, "holds");
  assert.equal(analyzeStability(fourLegTable({ topShiftXMm: 600 })).verdict, "breaks");
});

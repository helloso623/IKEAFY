import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addJoint,
  addPiece,
  benchChrome,
  emptyProject,
  persistLabTool,
  removePiece,
  resetSim,
  snapshotSim,
} from "../server/lib/project.js";

test("project core persists labels, joints and lab tool output", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top", { functionLabel: "support" });
  const leg = addPiece(project, "lack-leg");
  const joint = addJoint(project, {
    fromPiece: top.id,
    toPiece: leg.id,
    kind: "fixed",
  });

  persistLabTool(project, "fusion", { documentId: "fusion-1", bodies: 2 });

  assert.equal(top.functionLabel, "support");
  assert.deepEqual(joint.pieceIds, [top.id, leg.id]);
  assert.equal(project.labTools.fusion.documentId, "fusion-1");
  assert.equal(benchChrome(project).counts.joints, 1);
  assert.equal(benchChrome(project).show.kicad, true);
  assert.equal(benchChrome(project).labTools.blender, true);
});

test("simulation snapshots restore joints and removing a piece cleans them up", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top");
  const leg = addPiece(project, "lack-leg");
  addJoint(project, { pieceIds: [top.id, leg.id] });
  snapshotSim(project);

  project.joints = [];
  resetSim(project);
  assert.equal(project.joints.length, 1);

  removePiece(project, leg.id);
  assert.equal(project.joints.length, 0);
});

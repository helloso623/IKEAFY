import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPiece,
  discardLastEdit,
  duplicatePiece,
  editStatus,
  emptyProject,
  movePiece,
  pickPose,
  projectPayload,
  rememberEdit,
  removePiece,
  redoEdit,
  snapNumber,
  snapPose,
  undoEdit,
} from "../server/lib/project.js";

test("movePiece only writes pose fields and never overwrites id", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top", { x: 0, y: 0.2, z: 0 });
  const moved = movePiece(project, top.id, {
    id: "forged",
    x: 0.12,
    z: -0.08,
    ry: Math.PI / 2,
    junk: true,
  });
  assert.equal(moved.id, top.id);
  assert.equal(moved.x, 0.12);
  assert.equal(moved.z, -0.08);
  assert.equal(moved.ry, Math.PI / 2);
  assert.equal(moved.junk, undefined);
  assert.equal(project.selection, top.id);
});

test("pickPose strips unknown keys", () => {
  const pose = pickPose({ id: "p-1", x: 1, extra: 9, sx: 2 });
  assert.deepEqual(pose, { x: 1, sx: 2 });
});

test("snapPose locks to the 10 mm / 15° / 0.1 grid", () => {
  assert.equal(snapNumber(0.014, 0.01), 0.01);
  const snapped = snapPose({
    x: 0.014,
    y: 0.226,
    z: -0.007,
    ry: (16 * Math.PI) / 180,
    sx: 1.14,
  });
  assert.equal(snapped.x, 0.01);
  assert.equal(snapped.y, 0.23);
  assert.equal(snapped.z, -0.01);
  assert.ok(Math.abs(snapped.ry - Math.PI / 12) < 1e-9);
  assert.equal(snapped.sx, 1.1);
});

test("duplicatePiece copies pose and offsets on the bench", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top", {
    x: 0.1,
    y: 0.2,
    z: 0.05,
    ry: 0.4,
    functionLabel: "support",
  });
  const copy = duplicatePiece(project, top.id);
  assert.ok(copy);
  assert.notEqual(copy.id, top.id);
  assert.equal(copy.partId, "lack-top");
  assert.equal(copy.x, 0.18);
  assert.equal(copy.z, 0.13);
  assert.equal(copy.ry, 0.4);
  assert.equal(copy.functionLabel, "support");
  assert.equal(project.pieces.length, 2);
  assert.equal(project.selection, copy.id);
  assert.equal(duplicatePiece(project, "missing"), null);
});

test("undo and redo restore furniture edits", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top", { x: 0, y: 0.2, z: 0 });
  rememberEdit(project);
  movePiece(project, top.id, { x: 0.4, z: 0.2 });
  rememberEdit(project);
  const copy = duplicatePiece(project, top.id);
  rememberEdit(project);
  removePiece(project, copy.id);

  assert.equal(project.pieces.length, 1);
  assert.equal(editStatus(project).canUndo, true);

  assert.ok(undoEdit(project));
  assert.equal(project.pieces.length, 2);
  assert.ok(undoEdit(project));
  assert.equal(project.pieces.length, 1);
  assert.equal(project.pieces[0].x, 0.4);
  assert.ok(undoEdit(project));
  assert.equal(project.pieces[0].x, 0);
  assert.equal(undoEdit(project), null);

  assert.ok(redoEdit(project));
  assert.equal(project.pieces[0].x, 0.4);
  assert.ok(redoEdit(project));
  assert.equal(project.pieces.length, 2);
});

test("client mesh checkpoints share chronological undo with moves", () => {
  const project = emptyProject();
  const top = addPiece(project, "lack-top", { x: 0 });

  rememberEdit(project);
  movePiece(project, top.id, { x: 0.2 });
  rememberEdit(project, { clientEdit: "mesh-sculpt-1" });
  rememberEdit(project);
  movePiece(project, top.id, { x: 0.4 });

  const moveUndo = undoEdit(project);
  assert.equal(moveUndo.clientEdit, null);
  assert.equal(project.pieces[0].x, 0.2);

  const meshUndo = undoEdit(project);
  assert.equal(meshUndo.clientEdit, "mesh-sculpt-1");
  assert.equal(project.pieces[0].x, 0.2, "a client checkpoint does not alter server pose");

  const firstMoveUndo = undoEdit(project);
  assert.equal(firstMoveUndo.clientEdit, null);
  assert.equal(project.pieces[0].x, 0);

  assert.equal(redoEdit(project).clientEdit, null);
  assert.equal(project.pieces[0].x, 0.2);
  assert.equal(redoEdit(project).clientEdit, "mesh-sculpt-1");
  assert.equal(project.pieces[0].x, 0.2);
  assert.equal(redoEdit(project).clientEdit, null);
  assert.equal(project.pieces[0].x, 0.4);
});

test("discardLastEdit drops a failed remember without changing pieces", () => {
  const project = emptyProject();
  addPiece(project, "lack-leg");
  rememberEdit(project);
  discardLastEdit(project);
  assert.equal(editStatus(project).canUndo, false);
  assert.equal(project.pieces.length, 1);
});

test("projectPayload hides history and exposes edit flags", () => {
  const project = emptyProject();
  addPiece(project, "lack-top");
  rememberEdit(project);
  addPiece(project, "lack-leg");
  const payload = projectPayload(project);
  assert.equal(payload.history, undefined);
  assert.equal(payload.edit.canUndo, true);
  assert.equal(payload.edit.canRedo, false);
  assert.ok(payload.chrome);
});

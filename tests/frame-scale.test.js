/**
 * Cheap scale-from-frame heuristics. Local math only — no fal, no depth model.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  KNOWN_OBJECTS,
  assignScanViews,
  calibrateRoomFromTaps,
  knownObject,
  knownObjectPixelSpan,
  objectMmFromVanishing,
  pickFrameTimes,
  pixelDistance,
  resolveRoomScale,
  resolveScanScale,
  scaleFromKnownObject,
  scaleFromTaps,
  scaleFromVanishing,
  metresBetweenOnGround,
} from "../client/src/frame-scale.js";
import { roomFromPhotos } from "../client/src/photogram.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function fakeMask({ width = 80, height = 80, minX = 10, minY = 20, maxX = 70, maxY = 50 } = {}) {
  return {
    data: new Uint8Array(width * height),
    width,
    height,
    crop: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      count: 1,
    },
  };
}

test("two taps 100 px apart equal 1 m", () => {
  const scale = scaleFromTaps({ x: 10, y: 10 }, { x: 110, y: 10 }, 1);
  assert.equal(scale.metresPerPixel, 0.01);
  assert.equal(scale.mmPerPixel, 10);
  assert.equal(scale.method, "taps");
  assert.equal(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("a known credit card 86 px wide is about one millimetre per pixel", () => {
  const card = knownObject("credit-card");
  const scale = scaleFromKnownObject({ pixelSpan: 86, knownMm: card.wMm });
  assert.ok(Math.abs(scale.mmPerPixel - 85.6 / 86) < 1e-9);
  assert.equal(scale.method, "known-object");
  assert.equal(KNOWN_OBJECTS.a4.wMm, 210);
  assert.equal(KNOWN_OBJECTS.door.hMm, 2032);
});

test("a matching silhouette aspect uses the known width", () => {
  const card = knownObject("credit-card");
  // 86 × 54 is a credit-card aspect.
  const span = knownObjectPixelSpan(fakeMask({ minX: 0, minY: 0, maxX: 85, maxY: 53 }), card);
  assert.equal(span.used, "width");
  assert.equal(span.knownMm, card.wMm);
});

test("vanishing scale is larger near the camera than toward the horizon", () => {
  const frame = { width: 800, height: 600, horizon: 0.5 };
  const near = metresBetweenOnGround({ x: 400, y: 580 }, { x: 500, y: 580 }, frame);
  const far = metresBetweenOnGround({ x: 400, y: 340 }, { x: 500, y: 340 }, frame);
  assert.ok(near > 0 && far > 0);
  assert.ok(near < far, "the same pixel span covers more floor closer to the vanishing line");
  const scale = scaleFromVanishing(frame, { horizon: 0.5 });
  assert.equal(scale.method, "vanishing");
  assert.ok(scale.metresPerPixel > 0);
});

test("a taller silhouette under the horizon reads as a taller object", () => {
  const short = objectMmFromVanishing({
    crop: { minX: 20, minY: 40, width: 20, height: 20 },
    maskSize: { width: 80, height: 80 },
    frameSize: { width: 80, height: 80 },
    horizon: 0.4,
  });
  const tall = objectMmFromVanishing({
    crop: { minX: 20, minY: 10, width: 20, height: 50 },
    maskSize: { width: 80, height: 80 },
    frameSize: { width: 80, height: 80 },
    horizon: 0.4,
  });
  assert.ok(tall > short);
});

test("scan taps turn a 1 m span into a millimetre hull length", () => {
  const masks = { front: fakeMask({ minX: 0, minY: 0, maxX: 99, maxY: 49 }) };
  const resolved = resolveScanScale(masks, {
    scaleKind: "taps",
    taps: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    frameSize: { width: 80, height: 80 },
  });
  assert.equal(resolved.method, "taps");
  assert.equal(resolved.scaleKind, "length");
  assert.ok(resolved.scaleMm > 100);
});

test("known-object scan scale uses the catalog millimetres as the longest length", () => {
  const masks = { front: fakeMask({ minX: 0, minY: 0, maxX: 54, maxY: 54 }) };
  const resolved = resolveScanScale(masks, { scaleKind: "known", knownId: "side-table" });
  assert.equal(resolved.method, "known-object");
  assert.equal(resolved.scaleMm, 550);
});

test("circumference still needs a typed millimetre scale", () => {
  assert.throws(() => resolveScanScale({}, { scaleKind: "circumference" }), /greater than 0/);
  const resolved = resolveScanScale({}, { scaleKind: "circumference", scaleMm: 300 });
  assert.equal(resolved.scaleKind, "circumference");
  assert.equal(resolved.scaleMm, 300);
});

test("vanishing room scale ignores typed width and depth", () => {
  const measured = roomFromPhotos({ widthM: 5, depthM: 4, horizon: 0.55 });
  const vanished = resolveRoomScale({ kind: "vanishing", aspect: 4 / 3, horizon: 0.55, widthM: 5, depthM: 4 });
  assert.equal(vanished.method, "vanishing");
  assert.equal(vanished.metric, false);
  assert.notEqual(vanished.widthM, measured.widthM);
});

test("tap two points = 1 m calibrates the room to metres", () => {
  const frame = { width: 800, height: 600, horizon: 0.5 };
  const room = calibrateRoomFromTaps(
    [
      { x: 200, y: 500 },
      { x: 400, y: 500 },
    ],
    frame,
    { metres: 1, horizon: 0.5, aspect: 4 / 3 },
  );
  assert.equal(room.metric, true);
  assert.equal(room.method, "taps");
  assert.ok(room.widthM >= 1.2 && room.widthM <= 14);
  const pending = resolveRoomScale({ kind: "taps", horizon: 0.5, aspect: 4 / 3, taps: [] });
  assert.equal(pending.method, "pending-taps");
});

test("a walk-around clip yields front, side and top stills", () => {
  const times = pickFrameTimes(12, 3);
  assert.equal(times.length, 3);
  assert.ok(times[0] < times[1] && times[1] < times[2]);
  assert.ok(times[0] > 0 && times[2] < 12);
  const views = assignScanViews(["a", "b", "c"]);
  assert.deepEqual(views, { front: "a", side: "b", top: "c" });
  const one = assignScanViews(["only"]);
  assert.equal(one.front, "only");
  assert.equal(one.side, "only");
  assert.equal(one.top, "only");
});

test("scale and scan reconstruction stay local — no paid depth model", () => {
  const files = [
    "client/src/frame-scale.js",
    "client/src/video-frames.js",
    "client/src/scan-reconstruct.js",
    "server/lib/scan-video.js",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /fal\.ai|openai|tripo|depth.?anything|metric3d|sam2|midas|zoedepth/i);
    assert.doesNotMatch(source, /FAL_KEY|OPENAI_API_KEY/);
  }
});

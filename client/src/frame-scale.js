/**
 * Cheap metric scale from a photo or video frame.
 *
 * Three local heuristics, no hosted depth model, no weights:
 *   1. Known object — a credit card, A4 sheet, side table or door in the frame.
 *   2. Vanishing / horizon — wall/floor luminance step plus a 1.5 m eye-level camera.
 *   3. Tap two points — those pixels are 1 m (or the known object's length).
 *
 * Pure math so node can test it. Video frame grabbing lives in video-frames.js.
 */

import { estimateHorizon, roomFromPhotos } from "./photogram.js";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = (value) => Math.round(value * 100) / 100;
const round1 = (value) => Math.round(value * 10) / 10;

export const EYE_LEVEL_M = 1.5;
export const DEFAULT_VFOV_DEG = 60;

export const KNOWN_OBJECTS = Object.freeze({
  "credit-card": Object.freeze({ id: "credit-card", name: "Credit card", wMm: 85.6, hMm: 53.98 }),
  a4: Object.freeze({ id: "a4", name: "A4 paper", wMm: 210, hMm: 297 }),
  letter: Object.freeze({ id: "letter", name: "US letter", wMm: 215.9, hMm: 279.4 }),
  "side-table": Object.freeze({ id: "side-table", name: "Side table 55×55", wMm: 550, hMm: 450 }),
  door: Object.freeze({ id: "door", name: "Interior door", wMm: 762, hMm: 2032 }),
});

export function knownObject(id) {
  return KNOWN_OBJECTS[String(id || "").trim()] || null;
}

export function pixelDistance(a = {}, b = {}) {
  return Math.hypot(num(b.x) - num(a.x), num(b.y) - num(a.y));
}

/** Two image points spanning `metres` (default 1 m) give metres-per-pixel. */
export function scaleFromTaps(a, b, metres = 1) {
  const px = pixelDistance(a, b);
  if (px < 1) throw new Error("Tap two distinct points that are 1 m apart.");
  const spanM = num(metres) > 0 ? num(metres) : 1;
  const metresPerPixel = spanM / px;
  return {
    metresPerPixel,
    mmPerPixel: metresPerPixel * 1000,
    pixelDistance: px,
    metres: spanM,
    method: "taps",
  };
}

/** A known millimetre length covering `pixelSpan` pixels. */
export function scaleFromKnownObject({ pixelSpan, knownMm, known } = {}) {
  const mm = num(knownMm) || num(known?.wMm);
  const px = num(pixelSpan);
  if (!(mm > 0) || !(px > 0)) throw new Error("Need a known length and a pixel span.");
  const metresPerPixel = mm / 1000 / px;
  return {
    metresPerPixel,
    mmPerPixel: mm / px,
    knownMm: mm,
    pixelSpan: px,
    method: "known-object",
  };
}

export function focalPx(frameHeight, vfovDeg = DEFAULT_VFOV_DEG) {
  const height = Math.max(1, num(frameHeight));
  const fov = clamp(num(vfovDeg) || DEFAULT_VFOV_DEG, 20, 120);
  return height / 2 / Math.tan((fov * Math.PI) / 360);
}

/**
 * Ground-plane point in metres, camera at the origin looking +z, eye-level y.
 * `u,v` are normalised image coordinates (0,0 top-left).
 */
export function groundPoint(u, v, frame = {}) {
  const width = Math.max(1, num(frame.width) || 1);
  const height = Math.max(1, num(frame.height) || 1);
  const horizon = clamp(num(frame.horizon) || 0.55, 0.15, 0.9);
  const cameraHeightM = num(frame.cameraHeightM) > 0 ? num(frame.cameraHeightM) : EYE_LEVEL_M;
  const fy = focalPx(height, frame.vfovDeg);
  const yPx = (num(v) - horizon) * height;
  if (yPx < 1) return { x: 0, z: 40, valid: false };
  const z = (cameraHeightM * fy) / yPx;
  const x = (((num(u) - 0.5) * width) / fy) * z;
  return { x, z, valid: true };
}

export function metresBetweenOnGround(a, b, frame = {}) {
  const width = Math.max(1, num(frame.width) || 1);
  const height = Math.max(1, num(frame.height) || 1);
  const p = groundPoint(num(a.x) / width, num(a.y) / height, { ...frame, width, height });
  const q = groundPoint(num(b.x) / width, num(b.y) / height, { ...frame, width, height });
  return Math.hypot(q.x - p.x, q.z - p.z);
}

/** Metres-per-pixel on the floor near the bottom of the frame, from the vanishing line. */
export function scaleFromVanishing(frame = {}, { horizon, cameraHeightM = EYE_LEVEL_M } = {}) {
  const width = Math.max(8, num(frame.width) || 800);
  const height = Math.max(8, num(frame.height) || 600);
  const h = clamp(num(horizon ?? frame.horizon) || 0.55, 0.15, 0.9);
  const y = height * 0.92;
  const metresPerPixel = metresBetweenOnGround(
    { x: width * 0.5, y },
    { x: width * 0.5 + 1, y },
    { width, height, horizon: h, cameraHeightM, vfovDeg: frame.vfovDeg },
  );
  return {
    metresPerPixel,
    mmPerPixel: metresPerPixel * 1000,
    method: "vanishing",
    horizon: h,
  };
}

/**
 * Vertical object sitting on the floor: similar triangles from the horizon.
 * Height in mm = eye-level × (object px) / (px from object base up to the vanishing line).
 */
export function objectMmFromVanishing({ crop, maskSize, frameSize, horizon, cameraHeightM = EYE_LEVEL_M } = {}) {
  const maskW = Math.max(1, num(maskSize?.width) || num(crop?.width) || 1);
  const maskH = Math.max(1, num(maskSize?.height) || num(crop?.height) || 1);
  const frameH = Math.max(1, num(frameSize?.height) || maskH);
  const scaleY = frameH / maskH;
  void maskW;
  const topY = num(crop?.minY) * scaleY;
  const botY = (num(crop?.minY) + Math.max(1, num(crop?.height))) * scaleY;
  const h = clamp(num(horizon) || 0.55, 0.15, 0.9);
  const horizonY = h * frameH;
  const denom = botY - horizonY;
  if (!(denom > 2)) return cameraHeightM * 1000;
  const heightM = cameraHeightM * ((botY - topY) / denom);
  return clamp(heightM, 0.04, 8) * 1000;
}

export function knownObjectPixelSpan(mask, known) {
  const crop = mask?.crop;
  if (!crop || !(crop.width > 0)) throw new Error("No silhouette to measure against a known object.");
  const spec = known || KNOWN_OBJECTS["credit-card"];
  const aspect = crop.width / Math.max(1, crop.height);
  const knownAspect = (spec.wMm || spec.hMm) / Math.max(1, spec.hMm || spec.wMm);
  const ratio = aspect / Math.max(knownAspect, 1e-6);
  if (ratio > 0.68 && ratio < 1.48) {
    return { pixelSpan: crop.width, knownMm: spec.wMm, used: "width" };
  }
  return {
    pixelSpan: Math.max(crop.width, crop.height),
    knownMm: Math.max(spec.wMm, spec.hMm),
    used: "longest",
  };
}

function hullKindFor(kind) {
  return kind === "circumference" ? "circumference" : "length";
}

/**
 * Turn scan-panel scale UI into the millimetre length carveVisualHull expects.
 * `taps` are in the coordinate space of `frameSize` (the tap canvas).
 */
export function resolveScanScale(masks = {}, options = {}) {
  const kind = String(options.scaleKind || "circumference").toLowerCase();
  const front = masks.front;
  if (kind === "taps" || kind === "tap") {
    const taps = options.taps || [];
    if (taps.length < 2) throw new Error("Tap two points on the frame that are 1 m apart.");
    const { metresPerPixel } = scaleFromTaps(taps[0], taps[1], options.tapMetres || 1);
    const spanMask = Math.max(front?.crop?.width || 0, front?.crop?.height || 0);
    const frameW = num(options.frameSize?.width) || front?.width || spanMask;
    const mapped = spanMask * (frameW / Math.max(1, front?.width || frameW));
    const scaleMm = Math.max(1, mapped * metresPerPixel * 1000);
    return { scaleMm, scaleKind: "length", method: "taps", metresPerPixel };
  }
  if (kind === "known" || kind === "known-object") {
    const spec = knownObject(options.knownId) || KNOWN_OBJECTS["credit-card"];
    const taps = options.taps || [];
    if (taps.length >= 2) {
      const metres = (spec.wMm || 550) / 1000;
      const { metresPerPixel } = scaleFromTaps(taps[0], taps[1], metres);
      const spanMask = Math.max(front?.crop?.width || 0, front?.crop?.height || 0);
      const frameW = num(options.frameSize?.width) || front?.width || spanMask;
      const mapped = spanMask * (frameW / Math.max(1, front?.width || frameW));
      return {
        scaleMm: Math.max(1, mapped * metresPerPixel * 1000),
        scaleKind: "length",
        method: "known-object",
        known: spec,
        metresPerPixel,
      };
    }
    const span = knownObjectPixelSpan(front, spec);
    return {
      scaleMm: span.knownMm,
      scaleKind: "length",
      method: "known-object",
      known: spec,
      pixelSpan: span.pixelSpan,
    };
  }
  if (kind === "vanishing") {
    const scaleMm = objectMmFromVanishing({
      crop: front?.crop,
      maskSize: front,
      frameSize: options.frameSize || { width: front?.width, height: front?.height },
      horizon: options.horizon || 0.55,
    });
    return { scaleMm, scaleKind: "length", method: "vanishing" };
  }
  const scaleMm = num(options.scaleMm);
  if (!(scaleMm > 0)) throw new Error("Enter a scale greater than 0 mm.");
  return { scaleMm, scaleKind: hullKindFor(kind), method: kind };
}

export function calibrateRoomFromTaps(taps, frame = {}, { metres = 1, horizon, aspect } = {}) {
  const width = Math.max(8, num(frame.width) || 800);
  const height = Math.max(8, num(frame.height) || 600);
  const h = clamp(num(horizon ?? frame.horizon) || 0.55, 0.15, 0.9);
  const photoAspect = num(aspect) || width / height;
  const base = roomFromPhotos({ aspect: photoAspect, horizon: h });
  const ground = metresBetweenOnGround(taps[0], taps[1], {
    width,
    height,
    horizon: h,
    cameraHeightM: frame.cameraHeightM,
    vfovDeg: frame.vfovDeg,
  });
  const spanM = num(metres) > 0 ? num(metres) : 1;
  if (ground > 0.04) {
    const factor = spanM / ground;
    return {
      ...base,
      widthM: round2(clamp(base.widthM * factor, 1.2, 14)),
      depthM: round2(clamp(base.depthM * factor, 1.2, 16)),
      heightM: round2(clamp(base.heightM * factor, 2.0, 4.4)),
      metric: true,
      method: "taps",
    };
  }
  const { metresPerPixel } = scaleFromTaps(taps[0], taps[1], spanM);
  const widthM = round2(clamp(width * metresPerPixel, 1.2, 14));
  const depthM = round2(clamp(widthM * (base.depthM / base.widthM), 1.2, 16));
  return { ...base, widthM, depthM, metric: true, method: "taps" };
}

/**
 * Room metres from a frame. Tap/known wins, then typed width/depth, then vanishing.
 */
export function resolveRoomScale({
  kind = "measure",
  aspect,
  horizon,
  widthM,
  depthM,
  taps,
  frame,
  knownId,
  tapMetres,
} = {}) {
  const mode = String(kind || "measure").toLowerCase();
  const h = horizon;
  const photoAspect = aspect;
  if (mode === "vanishing") {
    return { ...roomFromPhotos({ aspect: photoAspect, horizon: h }), method: "vanishing" };
  }
  if (mode === "taps" || mode === "known" || mode === "known-object") {
    const spec = knownObject(knownId);
    const metres =
      mode === "known" || mode === "known-object"
        ? (spec?.wMm || 550) / 1000
        : num(tapMetres) > 0
          ? num(tapMetres)
          : 1;
    if ((taps || []).length >= 2) {
      return calibrateRoomFromTaps(taps, frame || {}, { metres, horizon: h, aspect: photoAspect });
    }
    return { ...roomFromPhotos({ aspect: photoAspect, horizon: h, widthM, depthM }), method: "pending-taps" };
  }
  return { ...roomFromPhotos({ aspect: photoAspect, horizon: h, widthM, depthM }), method: "measure" };
}

/** Times (seconds) at which to grab `count` stills from a clip. */
export function pickFrameTimes(durationSec, count = 3) {
  const n = clamp(Math.round(num(count) || 3), 1, 12);
  const duration = num(durationSec);
  if (!(duration > 0)) {
    return Array.from({ length: n }, (_, i) => round2((i + 0.5) / n));
  }
  const pad = Math.min(0.04, duration * 0.02);
  return Array.from({ length: n }, (_, i) => {
    const t = (duration * (i + 0.5)) / n;
    return Math.min(Math.max(0, t), Math.max(0, duration - pad));
  });
}

/** Map a burst of stills onto front / side / top for the visual hull. */
export function assignScanViews(frames = []) {
  const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
  return {
    front: list[0] || null,
    side: list[1] || list[0] || null,
    top: list[2] || list[0] || null,
  };
}

export { estimateHorizon };

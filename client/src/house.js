/**
 * Lab → House: a room photo, measurements and a budget become a placement
 * plan. Photo + measurements sit in the Lab rails with the bench. AR owns
 * #ar-photo as the room-camera overlay.
 */

const $ = (id) => document.getElementById(id);

function money(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "";
  return `$${value % 1 ? value.toFixed(2) : value}`;
}

function readNumber(id, fallback) {
  const value = Number($(id)?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function footprintOf(plan) {
  const pick = plan?.pick || {};
  const place = plan?.ordered?.[0] || {};
  const overlay = plan?.overlay || {};
  const dims = pick.dimsMm || {};
  return {
    w: overlay.widthM || place.widthM || pick.footprintM?.w || (Number(dims.x) || 550) / 1000,
    d: overlay.depthM || place.depthM || pick.footprintM?.d || (Number(dims.y) || 550) / 1000,
    h: overlay.heightM || place.heightM || pick.footprintM?.h || (Number(dims.z) || 450) / 1000,
  };
}

function sizeCanvas(canvas) {
  const host = canvas.parentElement || canvas;
  const rect = host.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round((rect.width || 900) * dpr));
  const height = Math.max(200, Math.round((rect.height || 560) * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function drawPhoto(ctx, photo, width, height) {
  ctx.fillStyle = "#d8d4cc";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / photo.width, height / photo.height);
  const dw = photo.width * scale;
  const dh = photo.height * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.drawImage(photo, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

function drawEmptyRoom(ctx, width, height, room) {
  ctx.fillStyle = "#8a9aaa";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#c5b7a0";
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.94);
  ctx.lineTo(width * 0.46, height * 0.4);
  ctx.lineTo(width * 0.96, height * 0.94);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#9aa8b6";
  ctx.fillRect(0, 0, width, height * 0.42);
  ctx.fillStyle = "rgba(17, 17, 17, 0.55)";
  ctx.font = `${Math.round(height * 0.032)}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(`${room.widthM} m × ${room.depthM} m`, width * 0.06, height * 0.08);
  return { x: width * 0.08, y: height * 0.42, w: width * 0.84, h: height * 0.5 };
}

// Lens atmosphere over the room photo: a depth-ish gradient that cools the
// far (top) edge plus a light vignette. Plain 2D gradients painted once per
// event-driven redraw — there is no animation loop here, so nothing flickers.
function applyAtmosphere(ctx, width, height) {
  const depth = ctx.createLinearGradient(0, 0, 0, height);
  depth.addColorStop(0, "rgba(22, 28, 36, 0.16)");
  depth.addColorStop(0.55, "rgba(22, 28, 36, 0)");
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, width, height);
  const radius = Math.hypot(width, height) / 2;
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, radius * 0.55,
    width / 2, height / 2, radius,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

// A soft elliptical blob under the piece so it sits on the photo floor
// instead of floating over it — the 2D twin of the Lab's contact shadow.
function drawContactShadow(ctx, cx, cy, radius) {
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, "rgba(14, 17, 21, 0.32)");
  grad.addColorStop(1, "rgba(14, 17, 21, 0)");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.36);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function shade(hex, amount = -22) {
  const raw = String(hex || "#f3efe6").replace("#", "");
  if (raw.length < 6) return "#d8c7a1";
  const n = (i) => Math.max(0, Math.min(255, parseInt(raw.slice(i, i + 2), 16) + amount));
  return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
}

function drawPiece(ctx, plan, floor) {
  const room = plan.room || { widthM: 3.2, depthM: 3.8 };
  const place = plan.ordered?.[0] || { x: room.widthM * 0.35, z: room.depthM * 0.25 };
  const foot = footprintOf(plan);
  const color = plan.overlay?.color || plan.pick?.color || "#f3efe6";
  const shape = plan.overlay?.shape || plan.pick?.shape || "table";

  const nx = Math.min(0.92, Math.max(0.04, place.x / room.widthM));
  const nz = Math.min(0.92, Math.max(0.04, place.z / room.depthM));
  const scaleX = floor.w / room.widthM;
  const scaleZ = floor.h / room.depthM;
  const topW = Math.max(28, foot.w * scaleX);
  const topD = Math.max(16, foot.d * scaleZ * 0.42);
  const height = Math.max(18, foot.h * scaleX * 0.55);
  const x = floor.x + nx * floor.w;
  const y = floor.y + nz * floor.h;
  const skew = topD * 0.45;

  ctx.save();
  const legDrop = shape !== "slab" ? height : 0;
  drawContactShadow(ctx, x + topW / 2 - skew / 2, y + topD * 0.85 + legDrop, Math.max(topW, topD) * 0.72);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(17, 17, 17, 0.35)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + topW, y);
  ctx.lineTo(x + topW - skew, y + topD);
  ctx.lineTo(x - skew, y + topD);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (shape !== "slab") {
    ctx.fillStyle = shade(color, -28);
    const legW = Math.max(5, topW * 0.08);
    const legs = [
      [x + topW * 0.1, y + topD * 0.55],
      [x + topW * 0.72, y + topD * 0.55],
      [x + topW * 0.04 - skew * 0.15, y + topD * 0.85],
      [x + topW * 0.66 - skew, y + topD * 0.85],
    ];
    for (const [lx, ly] of legs) ctx.fillRect(lx, ly, legW, height);
  }

  ctx.fillStyle = "rgba(17, 17, 17, 0.78)";
  ctx.font = `${Math.max(11, Math.round(floor.h * 0.055))}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(plan.pick?.name || "piece", x - 4, y - 8);
  ctx.restore();
}

function notesFor(plan) {
  const place = plan.ordered?.[0];
  const cheaper = plan.cheaper || [];
  const lines = [
    `Pick: ${plan.pick?.name || "—"} ${money(plan.pick?.cost)}${plan.pick?.store ? ` (${plan.pick.store})` : ""}`,
  ];
  if (place) {
    lines.push(`Place at ${Number(place.x).toFixed(2)} × ${Number(place.z).toFixed(2)} m`);
    if (place.why) lines.push(place.why);
  }
  lines.push("", "CHEAPER FITS");
  if (cheaper.length) {
    lines.push(...cheaper.map((item) => `• ${item.name} ${money(item.cost)} save ${money(item.saved)}`));
  } else {
    lines.push("• No cheaper fit in this room and budget.");
  }
  if (plan.note) lines.push("", plan.note);
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function fmtMm(dims) {
  if (!dims) return "";
  const parts = [dims.x, dims.y, dims.z].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return parts.length ? `${parts.map((n) => Math.round(n)).join(" × ")} mm` : "";
}

export function initHouse({ api, hud = () => {}, onPhoto, onPlan, getSelectedPart, onAdd } = {}) {
  if (!api?.adapt) throw new Error("initHouse requires api.adapt");

  const photoInput = $("room-photo");
  const adaptBtn = $("adapt-btn");
  const out = $("adapt-out");
  const scanBtn = $("scan-btn");
  const scanOut = $("scan-out");
  const canvas = $("ar-photo");
  if (!adaptBtn || !canvas) {
    return { applyPlan() {}, draw() {}, setActive() {}, hasPhoto: () => false };
  }

  let photo = null;
  let lastPlan = null;

  function markPhoto() {
    $("app")?.classList.toggle("has-room-photo", Boolean(photo));
  }

  function draw(plan = lastPlan) {
    const ctx = canvas.getContext("2d");
    const { width, height } = sizeCanvas(canvas);
    const room = plan?.room || {
      widthM: readNumber("room-w", 3.2),
      depthM: readNumber("room-d", 3.8),
    };
    const floor = photo ? drawPhoto(ctx, photo, width, height) : drawEmptyRoom(ctx, width, height, room);
    if (plan?.ordered?.[0]) drawPiece(ctx, plan, floor);
    applyAtmosphere(ctx, width, height);
    canvas.classList.remove("hidden");
  }

  function writeNotes(plan) {
    if (out) out.textContent = notesFor(plan);
  }

  function applyPlan(plan) {
    if (!plan?.pick) return;
    lastPlan = plan;
    writeNotes(plan);
    draw(plan);
  }

  function setActive(on) {
    markPhoto();
    canvas.classList.toggle("hidden", !on);
    if (on) draw(lastPlan);
  }

  async function adaptRoom() {
    const widthM = readNumber("room-w", 3.2);
    const depthM = readNumber("room-d", 3.8);
    const budget = readNumber("room-budget", 40);
    const photoName = photoInput?.files?.[0]?.name || (photo ? "room.jpg" : "room.jpg");
    if (out) out.textContent = "Measuring the room…";
    hud("Measuring the room…");
    try {
      const plan = await api.adapt({
        widthM,
        depthM,
        budget,
        want: "table",
        photoName,
      });
      applyPlan(plan);
      onPlan?.(plan);
      hud(`Placed ${plan.pick?.name || "a table"} in the room.`);
    } catch (err) {
      const message = err?.message || "Could not place a piece in this room.";
      if (out) out.textContent = message;
      hud(message);
    }
  }

  adaptBtn.addEventListener("click", () => {
    adaptRoom();
  });

  function readScanBody() {
    const budget = readNumber("room-budget", 40);
    const part = getSelectedPart?.();
    if (part?.dimsMm && (Number(part.dimsMm.x) > 0 || Number(part.dimsMm.y) > 0)) {
      return {
        source: "piece",
        partId: part.id,
        name: part.name,
        dimsMm: { x: part.dimsMm.x, y: part.dimsMm.y, z: part.dimsMm.z },
        budget,
        want: "table",
      };
    }
    return {
      source: "room",
      widthM: readNumber("room-w", 3.2),
      depthM: readNumber("room-d", 3.8),
      budget,
      want: "table",
    };
  }

  function renderScan(result) {
    if (!scanOut) return;
    const suggestions = result?.suggestions || [];
    const scanned = result?.scanned || {};
    const headline = escapeHtml(result?.headline || "you could end up with this");
    const where =
      scanned.source === "piece"
        ? `Scan of the selected piece · ${escapeHtml(scanned.mm || fmtMm(scanned.dimsMm))}`
        : `Scan of the room · ${escapeHtml(scanned.mm || fmtMm(scanned.dimsMm))}`;
    const items = suggestions
      .map((item) => {
        const mm = escapeHtml(item.mm || fmtMm(item.dimsMm));
        const price = money(item.cost ?? item.price);
        return `<div class="item scan-item">
          <div class="scan-meta">
            <span>${escapeHtml(item.name)}</span>
            <small>${mm}${price ? ` · ${price}` : ""}</small>
          </div>
          <button type="button" data-add="${escapeHtml(item.id)}">Add to bench</button>
        </div>`;
      })
      .join("");
    scanOut.innerHTML = `<p class="scan-kicker">${headline}</p><p class="hint">${where}</p>${
      items || `<p class="hint">Nothing in the catalog fits these dimensions and budget.</p>`
    }`;
  }

  async function scanFits() {
    if (!api.scan) {
      hud("Scan is not wired.");
      return;
    }
    if (scanOut) scanOut.textContent = "Scanning the catalog…";
    hud("Scanning the catalog…");
    try {
      const result = await api.scan(readScanBody());
      renderScan(result);
      const first = result.suggestions?.[0];
      hud(first ? `You could end up with ${first.name}.` : "Nothing in the catalog fits.");
    } catch (err) {
      const message = err?.message || "Could not scan the catalog.";
      if (scanOut) scanOut.textContent = message;
      hud(message);
    }
  }

  scanBtn?.addEventListener("click", () => {
    $("lab-room") && ($("lab-room").open = true);
    scanFits();
  });

  scanOut?.addEventListener("click", async (ev) => {
    const id = ev.target.closest("[data-add]")?.dataset.add;
    if (!id) return;
    try {
      if (onAdd) await onAdd(id);
      else await api.add(id, { x: 0.25, y: 0.28, z: 0.1 });
      hud(`Added to the bench.`);
    } catch (err) {
      hud(err?.message || "Could not add that piece.");
    }
  });

  photoInput?.addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      photo = img;
      markPhoto();
      onPhoto?.(img);
      draw(lastPlan);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

  window.addEventListener("resize", () => {
    const app = $("app");
    if (app?.dataset.mode === "lab" && app?.dataset.lab === "ar") draw(lastPlan);
  });

  return {
    applyPlan,
    draw,
    setActive,
    hasPhoto: () => Boolean(photo),
  };
}

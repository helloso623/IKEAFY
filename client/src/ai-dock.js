/**
 * Floating Lab shop: bottom-right orb opens a chat dock.
 * Scene JSON (selected piece, counts, Lab mode) travels with each ask.
 */

export function buildSceneContext({
  lab = "desk",
  mode = "lab",
  pieces = [],
  selected = null,
  hasViewportStill = false,
} = {}) {
  const list = Array.isArray(pieces) ? pieces : [];
  const sel = selected && typeof selected === "object" ? selected : null;
  return {
    mode: mode || "lab",
    lab: lab || "desk",
    pieceCount: list.length,
    selected: sel
      ? {
          id: sel.id || "",
          name: sel.name || sel.partId || "",
          partId: sel.partId || "",
          dimsMm: sel.dimsMm && typeof sel.dimsMm === "object" ? sel.dimsMm : null,
          reconstructed: Boolean(sel.reconstructed),
        }
      : null,
    pieces: list.slice(0, 24).map((item) => ({
      id: item.id || "",
      name: item.name || item.partId || "",
      partId: item.partId || "",
      dimsMm: item.dimsMm && typeof item.dimsMm === "object" ? item.dimsMm : null,
    })),
    hasViewportStill: Boolean(hasViewportStill),
  };
}

export function captureViewThumb(canvas, { maxWidth = 240, quality = 0.45 } = {}) {
  if (!canvas || typeof canvas.toDataURL !== "function") return "";
  const srcW = Number(canvas.width) || 0;
  const srcH = Number(canvas.height) || 0;
  if (srcW < 8 || srcH < 8) return "";
  try {
    const thumb = document.createElement("canvas");
    const width = Math.min(maxWidth, srcW);
    const height = Math.max(1, Math.round((srcH / srcW) * width));
    thumb.width = width;
    thumb.height = height;
    const ctx = thumb.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(canvas, 0, 0, width, height);
    return thumb.toDataURL("image/jpeg", quality);
  } catch {
    return "";
  }
}

export function setAiDockOpen(open, { orb, dock, input } = {}) {
  const shown = Boolean(open);
  if (dock) {
    dock.hidden = !shown;
    dock.classList.toggle("open", shown);
    dock.setAttribute("aria-hidden", shown ? "false" : "true");
  }
  if (orb) {
    orb.classList.toggle("on", shown);
    orb.setAttribute("aria-expanded", shown ? "true" : "false");
  }
  if (shown) input?.focus?.();
}

export function bindAiDock({ orb, dock, close, input } = {}) {
  if (!orb || !dock) return { open: () => {}, close: () => {}, toggle: () => {} };

  const api = {
    open() {
      setAiDockOpen(true, { orb, dock, input });
    },
    close() {
      setAiDockOpen(false, { orb, dock, input });
    },
    toggle() {
      setAiDockOpen(Boolean(dock.hidden), { orb, dock, input });
    },
  };

  orb.addEventListener("click", (event) => {
    event.preventDefault();
    api.toggle();
  });
  close?.addEventListener("click", (event) => {
    event.preventDefault();
    api.close();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dock.hidden) api.close();
  });
  return api;
}

export function renderCommandHistory(node, entries = []) {
  if (!node) return;
  const rows = Array.isArray(entries) ? entries.slice(0, 24) : [];
  node.replaceChildren(
    ...rows.map((entry) => {
      const li = document.createElement("li");
      const cmd = document.createElement("span");
      cmd.className = "ai-cmd";
      cmd.textContent = entry.command || "";
      const res = document.createElement("span");
      res.className = "ai-res";
      res.textContent = entry.result || "";
      li.append(cmd, res);
      return li;
    }),
  );
}

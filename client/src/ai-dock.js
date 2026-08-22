/**
 * Floating Lab shop: bottom-right orb opens a chat dock.
 * Scene JSON (selected piece, counts, Lab mode) travels with each ask.
 */

import { sceneSummary } from "./scene-context.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

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
  const reduceMotion =
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  if (dock) {
    if (typeof dock.__closeTimer === "number") clearTimeout(dock.__closeTimer);
    dock.classList.toggle("open", shown);
    dock.setAttribute("aria-hidden", shown ? "false" : "true");
    if (!shown && !dock.hidden && !reduceMotion) {
      // Let the .closing animation play out before display:none lands.
      dock.classList.toggle("closing", true);
      dock.__closeTimer = setTimeout(() => {
        dock.classList.toggle("closing", false);
        dock.hidden = true;
      }, 220);
    } else {
      dock.classList.toggle("closing", false);
      dock.hidden = !shown;
    }
  }
  if (orb) {
    orb.classList.toggle("on", shown);
    orb.setAttribute("aria-expanded", shown ? "true" : "false");
  }
  if (typeof document !== "undefined") {
    document.getElementById("app")?.classList.toggle("ai-open", shown);
  }
  if (shown) input?.focus?.();
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

export function bindAiDock({
  orb,
  dock,
  close,
  sceneNode,
  historyNode,
  input,
  getScene,
  onReplay,
} = {}) {
  if (!orb || !dock) return { available: false, open() {}, close() {}, toggle() {} };

  function isOpen() {
    return !dock.hidden;
  }

  function refreshScene() {
    const scene = getScene?.() || {};
    if (sceneNode) sceneNode.textContent = sceneSummary(scene);
    return scene;
  }

  function setOpen(open) {
    setAiDockOpen(open, { orb, dock, input });
    if (open) refreshScene();
  }

  function remember(text) {
    const query = String(text || "").trim();
    if (!historyNode || !query) return;
    const existing = [...historyNode.querySelectorAll("[data-replay]")].find(
      (btn) => btn.getAttribute("data-replay") === query,
    );
    if (existing) existing.parentElement?.remove();
    const item = document.createElement("li");
    item.innerHTML = `<button type="button" data-replay="${escapeHtml(query)}">${escapeHtml(query)}</button>`;
    historyNode.prepend(item);
    while (historyNode.children.length > 24) historyNode.lastElementChild?.remove();
  }

  const api = {
    available: true,
    setOpen,
    refreshScene,
    remember,
    isOpen,
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    toggle() {
      setOpen(!isOpen());
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
    if (event.key === "Escape" && isOpen()) api.close();
  });
  historyNode?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-replay]");
    if (!button) return;
    const query = button.getAttribute("data-replay") || "";
    if (input && query) input.value = query;
    if (query && typeof onReplay === "function") onReplay(query);
  });

  refreshScene();
  return api;
}

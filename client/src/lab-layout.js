/**
 * Lab columns — Blender-style left outliner + center viewport + right inspector.
 *
 * `[` toggles the outliner, `]` toggles the inspector. Drag a splitter to
 * resize. Widths and open/closed state persist in localStorage so the next
 * Lab visit opens the same way. IKEAlive upload/watch never see this chrome.
 */

export const LAB_LAYOUT_KEY = "ikealive.lab.layout";

export const LAB_LAYOUT_DEFAULTS = {
  left: 300,
  right: 340,
  leftOpen: true,
  rightOpen: true,
};

export const LAB_LAYOUT_MIN = 180;
export const LAB_LAYOUT_MAX = 560;
export const LAB_LAYOUT_CENTER_MIN = 280;
export const LAB_LAYOUT_COLLAPSE = 88;

export function clampSide(width, fallback = LAB_LAYOUT_DEFAULTS.left) {
  const n = Number(width);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LAB_LAYOUT_MAX, Math.max(LAB_LAYOUT_MIN, Math.round(n)));
}

export function parseLabLayout(raw) {
  const fallback = { ...LAB_LAYOUT_DEFAULTS };
  if (raw == null || raw === "") return fallback;
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  if (!data || typeof data !== "object") return fallback;
  return {
    left: clampSide(data.left, LAB_LAYOUT_DEFAULTS.left),
    right: clampSide(data.right, LAB_LAYOUT_DEFAULTS.right),
    leftOpen: data.leftOpen !== false,
    rightOpen: data.rightOpen !== false,
  };
}

export function toggleLabSide(state, side) {
  const next = { ...state };
  if (side === "right") next.rightOpen = !state.rightOpen;
  else next.leftOpen = !state.leftOpen;
  return next;
}

export function dragLabSide(state, side, width) {
  const key = side === "right" ? "right" : "left";
  const openKey = `${key}Open`;
  const n = Number(width);
  if (!Number.isFinite(n) || n < LAB_LAYOUT_COLLAPSE) {
    return { ...state, [openKey]: false };
  }
  return { ...state, [openKey]: true, [key]: clampSide(n, state[key]) };
}

export function fitLabLayout(state, totalWidth) {
  const fitted = { ...state };
  const total = Number(totalWidth);
  if (!Number.isFinite(total) || total <= 0) return fitted;
  let left = state.leftOpen ? state.left : 0;
  let right = state.rightOpen ? state.right : 0;
  const room = Math.max(0, total - LAB_LAYOUT_CENTER_MIN);
  const used = left + right;
  if (used > room && used > 0) {
    const scale = room / used;
    if (state.leftOpen) left = Math.max(0, Math.round(left * scale));
    if (state.rightOpen) right = Math.max(0, Math.round(right * scale));
  }
  if (state.leftOpen) fitted.left = left;
  if (state.rightOpen) fitted.right = right;
  return fitted;
}

export function layoutCssVars(state) {
  const fitted = state;
  return {
    "--lab-left": fitted.leftOpen ? `${fitted.left}px` : "0px",
    "--lab-right": fitted.rightOpen ? `${fitted.right}px` : "0px",
  };
}

export function loadLabLayout(storage = globalThis.localStorage) {
  try {
    return parseLabLayout(storage?.getItem?.(LAB_LAYOUT_KEY));
  } catch {
    return { ...LAB_LAYOUT_DEFAULTS };
  }
}

export function saveLabLayout(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(
      LAB_LAYOUT_KEY,
      JSON.stringify({
        left: clampSide(state.left, LAB_LAYOUT_DEFAULTS.left),
        right: clampSide(state.right, LAB_LAYOUT_DEFAULTS.right),
        leftOpen: state.leftOpen !== false,
        rightOpen: state.rightOpen !== false,
      }),
    );
  } catch {
    // Storage is unavailable in private windows; the layout just will not persist.
  }
}

function typingTarget(el) {
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
}

export function initLabLayout({
  root = typeof document !== "undefined" ? document.getElementById("app") : null,
  storage = globalThis.localStorage,
  isLab = () => root?.dataset?.mode === "lab",
  onChange,
} = {}) {
  if (!root) return null;

  let preferred = loadLabLayout(storage);
  let drag = null;
  let frame = 0;

  function paint() {
    const fitted = fitLabLayout(preferred, root.clientWidth || 0);
    const vars = layoutCssVars(fitted);
    root.style.setProperty("--lab-left", vars["--lab-left"]);
    root.style.setProperty("--lab-right", vars["--lab-right"]);
    root.classList.toggle("lab-left-off", !preferred.leftOpen);
    root.classList.toggle("lab-right-off", !preferred.rightOpen);
    root.dataset.labLeft = preferred.leftOpen ? "on" : "off";
    root.dataset.labRight = preferred.rightOpen ? "on" : "off";

    for (const btn of root.querySelectorAll("[data-lab-toggle]")) {
      const open = btn.dataset.labToggle === "right" ? preferred.rightOpen : preferred.leftOpen;
      btn.classList.toggle("on", open);
      btn.setAttribute("aria-pressed", open ? "true" : "false");
      const hide = btn.dataset.labToggle === "right" ? "Hide inspector (])" : "Hide outliner ([)";
      const show = btn.dataset.labToggle === "right" ? "Show inspector (])" : "Show outliner ([)";
      if (!btn.classList.contains("lab-edge-tab")) btn.title = open ? hide : show;
    }
    for (const tab of root.querySelectorAll(".lab-edge-tab")) {
      const open = tab.dataset.labToggle === "right" ? preferred.rightOpen : preferred.leftOpen;
      tab.hidden = open;
    }

    const leftRail = root.querySelector(".rail.left.lab-browser");
    const rightRail = root.querySelector(".rail.right.lab-inspector");
    leftRail?.setAttribute("aria-expanded", preferred.leftOpen ? "true" : "false");
    rightRail?.setAttribute("aria-expanded", preferred.rightOpen ? "true" : "false");

    const leftSplit = root.querySelector("[data-lab-split='left']");
    const rightSplit = root.querySelector("[data-lab-split='right']");
    if (leftSplit) {
      leftSplit.setAttribute("aria-valuenow", String(fitted.leftOpen ? fitted.left : 0));
      leftSplit.setAttribute("aria-valuemin", "0");
      leftSplit.setAttribute("aria-valuemax", String(LAB_LAYOUT_MAX));
    }
    if (rightSplit) {
      rightSplit.setAttribute("aria-valuenow", String(fitted.rightOpen ? fitted.right : 0));
      rightSplit.setAttribute("aria-valuemin", "0");
      rightSplit.setAttribute("aria-valuemax", String(LAB_LAYOUT_MAX));
    }

    onChange?.();
  }

  function persist() {
    saveLabLayout(preferred, storage);
    paint();
  }

  function toggle(side) {
    preferred = toggleLabSide(preferred, side);
    persist();
  }

  function bindSplit(el) {
    if (!el) return;
    const side = el.dataset.labSplit === "right" ? "right" : "left";
    el.addEventListener("pointerdown", (ev) => {
      if (!isLab() || ev.button) return;
      ev.preventDefault();
      el.setPointerCapture?.(ev.pointerId);
      drag = {
        side,
        startX: ev.clientX,
        startW: preferred[`${side}Open`] ? preferred[side] : 0,
      };
      document.body.classList.add("lab-resizing");
    });
    el.addEventListener("keydown", (ev) => {
      if (!isLab()) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle(side);
        return;
      }
      const step = ev.shiftKey ? 48 : 16;
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        const dir = ev.key === "ArrowRight" ? 1 : -1;
        const signed = side === "left" ? dir : -dir;
        preferred = dragLabSide(preferred, side, (preferred[`${side}Open`] ? preferred[side] : 0) + signed * step);
        persist();
      }
    });
  }

  function onPointerMove(ev) {
    if (!drag) return;
    const dx = ev.clientX - drag.startX;
    const signed = drag.side === "left" ? dx : -dx;
    preferred = dragLabSide(preferred, drag.side, drag.startW + signed);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
    });
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove("lab-resizing");
    persist();
  }

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-lab-toggle]");
    if (!btn || !isLab()) return;
    ev.preventDefault();
    toggle(btn.dataset.labToggle === "right" ? "right" : "left");
  });

  window.addEventListener("keydown", (ev) => {
    if (!isLab() || typingTarget(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "[") {
      ev.preventDefault();
      toggle("left");
    }
    if (ev.key === "]") {
      ev.preventDefault();
      toggle("right");
    }
  });

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", () => paint());

  bindSplit(root.querySelector("[data-lab-split='left']"));
  bindSplit(root.querySelector("[data-lab-split='right']"));
  paint();

  return {
    getState: () => ({ ...preferred }),
    toggle,
    paint,
  };
}

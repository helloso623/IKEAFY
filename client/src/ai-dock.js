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
  if (!orb || !dock) return { available: false };

  function isOpen() {
    return !dock.hidden;
  }

  function refreshScene() {
    const scene = getScene?.() || {};
    if (sceneNode) sceneNode.textContent = sceneSummary(scene);
    return scene;
  }

  function setOpen(open) {
    const next = Boolean(open);
    dock.hidden = !next;
    dock.setAttribute("aria-hidden", String(!next));
    orb.setAttribute("aria-expanded", String(next));
    orb.classList.toggle("on", next);
    document.getElementById("app")?.classList.toggle("ai-open", next);
    if (next) {
      refreshScene();
      input?.focus();
    }
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

  orb.addEventListener("click", () => setOpen(!isOpen()));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) setOpen(false);
  });
  historyNode?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-replay]");
    if (!button) return;
    const query = button.getAttribute("data-replay") || "";
    if (input && query) input.value = query;
    if (query && typeof onReplay === "function") onReplay(query);
  });

  refreshScene();
  return { available: true, setOpen, refreshScene, remember, isOpen };
}

const app = document.getElementById("app");

function setInterface(name) {
  if (!app || (name !== "intro" && name !== "upload" && name !== "watch")) return;
  app.setAttribute("data-interface", name);
  if (app.dataset.mode !== "ikeafy") window.setIkealiveMode?.("ikeafy");
  window.dispatchEvent(new Event("resize"));
}

function goMode(name) {
  window.setIkealiveMode?.(name);
}

function goBack() {
  if (!app) return;
  if (app.dataset.mode === "lab") {
    setInterface("intro");
    return;
  }
  const current = app.dataset.interface;
  if (current === "watch") setInterface("upload");
  else if (current === "upload") goMode("lab");
}

function setWatchCard(name) {
  const allowed = new Set(["bom", "reviews", "broken", "spare"]);
  const next = allowed.has(name) ? name : "bom";
  const rail = document.querySelector(".rail.cards");
  if (rail) rail.setAttribute("data-watch-card", next);
  for (const btn of document.querySelectorAll(".watch-pick")) {
    const on = btn.getAttribute("data-watch-card") === next;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
  }
}

document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go-interface]");
  if (go) setInterface(go.getAttribute("data-go-interface"));
  const goModeBtn = event.target.closest("[data-go-mode]");
  if (goModeBtn) goMode(goModeBtn.getAttribute("data-go-mode"));
  const back = event.target.closest("#nav-back");
  if (back) goBack();
  const pick = event.target.closest(".watch-pick");
  if (pick) setWatchCard(pick.getAttribute("data-watch-card"));
});

window.setIkealiveInterface = setInterface;
window.setIkealiveWatchCard = setWatchCard;

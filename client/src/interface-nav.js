const app = document.getElementById("app");

function setInterface(name) {
  if (!app || (name !== "upload" && name !== "watch")) return;
  app.setAttribute("data-interface", name);
  const tab = document.querySelector('#modes [data-mode="ikeafy"]');
  if (app.dataset.mode !== "ikeafy") tab?.click();
  window.dispatchEvent(new Event("resize"));
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
  const pick = event.target.closest(".watch-pick");
  if (pick) setWatchCard(pick.getAttribute("data-watch-card"));
});

window.setIkealiveInterface = setInterface;
window.setIkealiveWatchCard = setWatchCard;

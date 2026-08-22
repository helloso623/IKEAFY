/**
 * IKEAlive motion pass — the JS half of the animation work in styles.css.
 * Three jobs only, all expressed as CSS classes so styles stay in one place:
 *
 *   1. #app.is-scrolled once the landing / film column leaves the top,
 *      so the header can shrink and hang a shadow, then ease back.
 *   2. .anim-stagger on lists the first time they fill (steps, bodies,
 *      scrub) and when their pane returns — routine re-renders stay still.
 *   3. .anim-step-swap on the film caption + step notes when the step moves.
 *
 * Honors prefers-reduced-motion by doing nothing.
 */

const app = document.getElementById("app");
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const reduced = () => Boolean(reduceMotion?.matches);

/* ------------------------------------------------------- header scroll state */

function visibleScrollTop() {
  let top = window.scrollY || document.documentElement.scrollTop || 0;
  for (const el of [
    document.querySelector(".iface-upload"),
    document.getElementById("film"),
    document.querySelector(".rail.cards"),
  ]) {
    // display:none panes report clientHeight 0 — their old offsets don't count.
    if (el && el.clientHeight > 0) top = Math.max(top, el.scrollTop);
  }
  return top;
}

let headerTick = false;
function syncHeader() {
  headerTick = false;
  if (!app) return;
  const top = visibleScrollTop();
  const scrolled = app.classList.contains("is-scrolled");
  // Hysteresis keeps the header from fluttering around the threshold.
  if (!scrolled && top > 24) app.classList.add("is-scrolled");
  else if (scrolled && top < 6) app.classList.remove("is-scrolled");
}

function requestHeaderSync() {
  if (headerTick) return;
  headerTick = true;
  requestAnimationFrame(syncHeader);
}

// scroll does not bubble, but it does pass document in the capture phase,
// so one listener covers the landing, the film column, and the card rail.
document.addEventListener("scroll", requestHeaderSync, { capture: true, passive: true });
window.addEventListener("resize", requestHeaderSync, { passive: true });
requestHeaderSync();

/* ----------------------------------------------------------- list staggers */

function stagger(el) {
  if (!el || reduced()) return;
  el.classList.remove("anim-stagger");
  void el.offsetWidth; // restart the entrance animations
  el.classList.add("anim-stagger");
  clearTimeout(el.__staggerTimer);
  el.__staggerTimer = setTimeout(() => el.classList.remove("anim-stagger"), 950);
}

function meaningfulChildren(el) {
  // Empty-state hints don't count as content landing.
  return el.querySelectorAll(":scope > :not(.hint)").length;
}

function staggerOnFirstFill(el) {
  if (!el) return;
  let had = meaningfulChildren(el) > 0;
  new MutationObserver(() => {
    const has = meaningfulChildren(el) > 0;
    if (has && !had) stagger(el);
    had = has;
  }).observe(el, { childList: true });
}

for (const id of ["steps", "bench-pieces", "film-scrub", "bom", "reviews"]) {
  staggerOnFirstFill(document.getElementById(id));
}

// Panes returning to screen replay their list entrances.
if (app) {
  new MutationObserver(() => {
    if (app.dataset.mode === "lab") stagger(document.getElementById("bench-pieces"));
    if (app.dataset.mode === "ikeafy" && app.dataset.interface === "watch") {
      stagger(document.getElementById("steps"));
      stagger(document.getElementById("film-scrub"));
    }
    // Scroll offsets reset between panes — settle the header state too.
    requestHeaderSync();
  }).observe(app, { attributes: true, attributeFilter: ["data-mode", "data-interface", "data-lab"] });
}

/* -------------------------------------------------------------- step swaps */

function retrigger(el) {
  if (!el || reduced()) return;
  el.classList.remove("anim-step-swap");
  void el.offsetWidth;
  el.classList.add("anim-step-swap");
}

const caption = document.getElementById("film-caption");
if (caption) {
  new MutationObserver(() => {
    retrigger(caption);
    retrigger(document.getElementById("step-detail"));
  }).observe(caption, { childList: true, characterData: true, subtree: true });
}

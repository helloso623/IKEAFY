import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  LAB_LAYOUT_CENTER_MIN,
  LAB_LAYOUT_COLLAPSE,
  LAB_LAYOUT_DEFAULTS,
  LAB_LAYOUT_KEY,
  LAB_LAYOUT_MAX,
  LAB_LAYOUT_MIN,
  clampSide,
  dragLabSide,
  fitLabLayout,
  initLabLayout,
  layoutCssVars,
  loadLabLayout,
  parseLabLayout,
  saveLabLayout,
  toggleLabSide,
} from "../client/src/lab-layout.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    dump: () => ({ ...data }),
  };
}

test("default layout is a usable three-column Lab", () => {
  assert.equal(LAB_LAYOUT_DEFAULTS.left, 300);
  assert.equal(LAB_LAYOUT_DEFAULTS.right, 340);
  assert.equal(LAB_LAYOUT_DEFAULTS.leftOpen, true);
  assert.equal(LAB_LAYOUT_DEFAULTS.rightOpen, true);
  assert.ok(LAB_LAYOUT_MIN < LAB_LAYOUT_DEFAULTS.left);
  assert.ok(LAB_LAYOUT_DEFAULTS.right < LAB_LAYOUT_MAX);
});

test("parseLabLayout restores widths and treats missing flags as open", () => {
  assert.deepEqual(parseLabLayout(null), LAB_LAYOUT_DEFAULTS);
  assert.deepEqual(parseLabLayout("{"), LAB_LAYOUT_DEFAULTS);
  assert.deepEqual(parseLabLayout(JSON.stringify({ left: 220, right: 400, leftOpen: false })), {
    left: 220,
    right: 400,
    leftOpen: false,
    rightOpen: true,
  });
  assert.equal(parseLabLayout({ left: "nope", right: 9999 }).left, LAB_LAYOUT_DEFAULTS.left);
  assert.equal(parseLabLayout({ right: 9999 }).right, LAB_LAYOUT_MAX);
  assert.equal(parseLabLayout({ left: 40 }).left, LAB_LAYOUT_MIN);
});

test("clampSide rejects NaN and snaps to the Lab column range", () => {
  assert.equal(clampSide(Number.NaN, 300), 300);
  assert.equal(clampSide(12), LAB_LAYOUT_MIN);
  assert.equal(clampSide(800), LAB_LAYOUT_MAX);
  assert.equal(clampSide(275.4), 275);
});

test("[ ] style toggles flip one side and leave the other alone", () => {
  const closedLeft = toggleLabSide(LAB_LAYOUT_DEFAULTS, "left");
  assert.equal(closedLeft.leftOpen, false);
  assert.equal(closedLeft.rightOpen, true);
  assert.equal(closedLeft.left, 300);
  const closedRight = toggleLabSide(closedLeft, "right");
  assert.equal(closedRight.leftOpen, false);
  assert.equal(closedRight.rightOpen, false);
  assert.deepEqual(toggleLabSide(closedRight, "left").leftOpen, true);
});

test("dragging a splitter below the collapse notch hides that column", () => {
  const collapsed = dragLabSide(LAB_LAYOUT_DEFAULTS, "left", LAB_LAYOUT_COLLAPSE - 1);
  assert.equal(collapsed.leftOpen, false);
  assert.equal(collapsed.left, 300, "remember the last open width");
  const opened = dragLabSide(collapsed, "left", 260);
  assert.equal(opened.leftOpen, true);
  assert.equal(opened.left, 260);
  const right = dragLabSide(LAB_LAYOUT_DEFAULTS, "right", 410);
  assert.equal(right.right, 410);
  assert.equal(right.left, 300);
});

test("fitLabLayout keeps a center viewport when both sides are greedy", () => {
  const wide = { left: 500, right: 500, leftOpen: true, rightOpen: true };
  const fitted = fitLabLayout(wide, 900);
  assert.ok(fitted.left + fitted.right <= 900 - LAB_LAYOUT_CENTER_MIN);
  assert.ok(fitted.left > 0 && fitted.right > 0);
  const closed = fitLabLayout({ ...wide, leftOpen: false }, 900);
  assert.equal(closed.left, 500);
  assert.equal(closed.right, 500);
});

test("collapsed columns report 0px so the viewport can grow", () => {
  const vars = layoutCssVars({ left: 300, right: 340, leftOpen: false, rightOpen: true });
  assert.equal(vars["--lab-left"], "0px");
  assert.equal(vars["--lab-right"], "340px");
});

test("initLabLayout is a no-op without a root", () => {
  assert.equal(initLabLayout({ root: null }), null);
});

test("load and save round-trip through localStorage", () => {
  const storage = memoryStorage();
  saveLabLayout({ left: 240, right: 360, leftOpen: false, rightOpen: true }, storage);
  assert.equal(JSON.parse(storage.dump()[LAB_LAYOUT_KEY]).left, 240);
  assert.deepEqual(loadLabLayout(storage), {
    left: 240,
    right: 360,
    leftOpen: false,
    rightOpen: true,
  });
  assert.deepEqual(loadLabLayout(memoryStorage()), LAB_LAYOUT_DEFAULTS);
});

test("Lab markup keeps Bodies and adds Blender-style splitters", () => {
  const html = read("client/index.html");
  const css = read("client/src/styles.css");
  const main = read("client/src/main.js");
  const layout = read("client/src/lab-layout.js");

  assert.match(html, />\s*Bodies\s*</);
  assert.match(html, /data-lab-split="left"/);
  assert.match(html, /data-lab-split="right"/);
  assert.match(html, /data-lab-toggle="left"/);
  assert.match(html, /data-lab-toggle="right"/);
  assert.match(html, /id="lab-split-left"/);
  assert.match(html, /id="lab-split-right"/);
  assert.match(html, /lab-edge-tab lab-edge-left/);
  assert.match(html, /lab-edge-tab lab-edge-right/);

  assert.match(css, /--lab-left/);
  assert.match(css, /--lab-right/);
  assert.match(css, /grid-template-columns:\s*var\(--lab-left\) minmax\(0, 1fr\) var\(--lab-right\)/);
  assert.match(css, /\.lab-split/);
  assert.match(css, /\.lab-edge-tab/);
  assert.match(css, /#app\.mode-lab\.lab-left-off/);
  assert.match(css, /#app\.mode-lab\.lab-right-off/);

  assert.match(main, /initLabLayout/);
  assert.match(layout, /keydown/);
  assert.match(layout, /ev\.key === "\["/);
  assert.match(layout, /ev\.key === "\]"/);
  assert.match(layout, /localStorage/);
  assert.match(layout, /pointerdown/);
  assert.match(layout, /LAB_LAYOUT_KEY/);
});

test("IKEAlive watch rail stays a fixed two-column page", () => {
  const html = read("client/index.html");
  const css = read("client/src/styles.css");
  const watchCss = css.slice(css.indexOf('#app.mode-ikeafy[data-interface="watch"]'));
  assert.match(watchCss, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(280px, 340px\)/);
  assert.match(html, /class="studio-side"/);
  assert.match(html, /class="panel watch bom"/);
  assert.match(html, /Assembly inventory/);
  assert.doesNotMatch(html.slice(html.indexOf('class="studio-side"'), html.indexOf("LAB — outliner")), /data-lab-split/);
});

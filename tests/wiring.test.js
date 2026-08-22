/**
 * The client is split across four files written by different hands, so the
 * cheapest bug to ship is a button that exists in one file under a name the
 * other file never uses. These tests read the markup and the modules as text and
 * check that every id and every api method one side reaches for is really there.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const html = read("client/index.html");
const main = read("client/src/main.js");
const studio = read("client/src/studio.js");
const apiSource = read("client/src/api.js");

const markupIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

function idsUsedIn(source) {
  const ids = new Set();
  for (const m of source.matchAll(/\$\("([^"]+)"\)/g)) ids.add(m[1]);
  for (const m of source.matchAll(/getElementById\("([^"]+)"\)/g)) ids.add(m[1]);
  for (const m of source.matchAll(/querySelector\("#([\w-]+)"\)/g)) ids.add(m[1]);
  for (const m of source.matchAll(/first\(\s*((?:"#[\w-]+",?\s*)+)\)/g)) {
    // first("#a", "#b") is a deliberate fallback chain: the first one must exist.
    const firstOption = m[1].match(/"#([\w-]+)"/);
    if (firstOption) ids.add(firstOption[1]);
  }
  return ids;
}

test("every id main.js reaches for exists in the markup", () => {
  const missing = [...idsUsedIn(main)].filter((id) => !markupIds.has(id));
  assert.deepEqual(missing, [], `main.js looks for ids that index.html does not define: ${missing}`);
});

test("every id the studio reaches for exists in the markup", () => {
  const missing = [...idsUsedIn(studio)].filter((id) => !markupIds.has(id));
  assert.deepEqual(missing, [], `studio.js looks for ids that index.html does not define: ${missing}`);
});

test("main.js and the studio do not both own the same control", () => {
  // #app and #film are containers on purpose: main.js decides which tab is up,
  // the studio decides what is inside the plate. Anything else being touched by
  // both files means two click handlers on one button.
  const containers = new Set(["app", "film"]);
  const shared = [...idsUsedIn(main)].filter((id) => idsUsedIn(studio).has(id) && !containers.has(id));
  assert.deepEqual(shared, [], `two modules bind the same element: ${shared}`);
});

test("every api call the client makes is exported by the api client", () => {
  const exported = new Set([...apiSource.matchAll(/^\s{2}([\w]+):/gm)].map((m) => m[1]));
  const used = new Set(
    [...`${main}\n${studio}`.matchAll(/\bapi\.([\w]+)\(/g)].map((m) => m[1]),
  );
  const missing = [...used].filter((name) => !exported.has(name));
  assert.deepEqual(missing, [], `client calls api methods that do not exist: ${missing}`);
});

test("the studio tab is its own column layout, not a panel bolted to the bench", () => {
  assert.match(html, /class="studio-in"/, "the studio needs its own left column");
  assert.match(html, /class="studio-side"/, "the studio needs its own right column");
  for (const pane of ["studio-in", "studio-side"]) {
    const block = html.slice(html.indexOf(`class="${pane}"`), html.indexOf(`class="${pane}"`) + 120);
    assert.match(block, /data-pane="ikeafy"/, `${pane} must be tied to the ikeafy tab`);
  }
});

test("the css does not hide the custom guide inputs while the studio is open", () => {
  const css = read("client/src/styles.css");
  const guideHidden = /#guide-in[^{]*\{[^}]*display:\s*none/.test(css.replace(/\s+/g, " "));
  assert.equal(guideHidden, false, "a blanket display:none on #guide-in kills the custom guide");
});

test("the studio starts on input, then progress, then instruction/material results", () => {
  assert.match(html, /data-studio-view="input"/);
  assert.match(html, /id="studio-input"/);
  assert.match(html, /id="studio-progress"/);
  assert.match(html, /id="product-search"/);
  assert.match(html, /id="guide-drop"/);
  assert.match(html, /id="tab-instructions"/);
  assert.match(html, /id="tab-material"/);
  assert.match(html, /id="step-scheme"/);
  assert.match(html, /id="see-guide"/);
});

test("electronics stays a bench feature of the main Ikeafy app", () => {
  assert.equal(/data-mode="electronics"/.test(html), false);
  const modes = html.slice(html.indexOf('id="modes"'), html.indexOf("</nav>"));
  assert.match(modes, /data-mode="ikeafy"/);
  assert.match(modes, /data-mode="bench"/);
  assert.match(modes, /data-mode="house"/);
  assert.match(html, /id="electronics-only"[^>]*electronics-chrome/);
});

test("bench chrome is driven by one class the server can switch off", () => {
  assert.match(html, /class="[^"]*electronics-chrome/, "electronics controls need the shared class");
  assert.match(main, /electronics-chrome/, "main.js must toggle the electronics chrome");
  assert.match(main, /chrome\?\.electronics|chrome\.electronics/, "main.js must read the server's chrome flag");
});

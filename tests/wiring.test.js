/**
 * The client is split across four files written by different hands, so the
 * cheapest bug to ship is a button that exists in one file under a name the
 * other file never uses. These tests read the markup and the modules as text and
 * check that every id and every api method one side reaches for is really there.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const html = read("client/index.html");
const main = read("client/src/main.js");
const studio = read("client/src/studio.js");
const house = read("client/src/house.js");
const apiSource = read("client/src/api.js");

const markupIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

function idsUsedIn(source) {
  const ids = new Set();
  for (const m of source.matchAll(/\$\("([^"]+)"\)/g)) ids.add(m[1]);
  for (const m of source.matchAll(/getElementById\("([^"]+)"\)/g)) ids.add(m[1]);
  for (const m of source.matchAll(/querySelector\("#([\w-]+)"\)/g)) ids.add(m[1]);
  // first("#a", "#b") is optional lookup — IKEAlive leaves leftover studio
  // ids as null rather than inventing Seedance chrome. Do not require them.
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

test("every id house.js reaches for exists in the markup", () => {
  const missing = [...idsUsedIn(house)].filter((id) => !markupIds.has(id));
  assert.deepEqual(missing, [], `house.js looks for ids that index.html does not define: ${missing}`);
});

test("every id lab-layout.js reaches for exists in the markup", () => {
  const layout = read("client/src/lab-layout.js");
  const missing = [...idsUsedIn(layout)].filter((id) => !markupIds.has(id));
  assert.deepEqual(missing, [], `lab-layout.js looks for ids that index.html does not define: ${missing}`);
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
    [...`${main}\n${studio}\n${house}`.matchAll(/\bapi\.([\w]+)\(/g)].map((m) => m[1]),
  );
  const missing = [...used].filter((name) => !exported.has(name));
  assert.deepEqual(missing, [], `client calls api methods that do not exist: ${missing}`);
});

test("IKEAlive is upload then watch, not a bench side panel", () => {
  assert.match(html, /data-interface="upload"/);
  assert.match(html, /data-interface-pane="upload"/);
  assert.match(html, /class="studio-side"/, "the watch rail holds the four Finley cards");
  assert.match(html, /class="watch-picks"/, "four buttons switch the watch cards");
  assert.match(html, /data-watch-card="bom"/);
  assert.match(html, /data-watch-card="reviews"/);
  assert.match(html, /data-watch-card="broken"/);
  assert.match(html, /data-watch-card="spare"/);
  assert.doesNotMatch(html, /id="omnibox"/);
  assert.doesNotMatch(html, /id="omnibox-form"/);
  assert.match(html, /id="ai-orb"/);
  assert.match(html, /id="ai-dock"/);
  const side = html.slice(html.indexOf('class="studio-side"'), html.indexOf('class="studio-side"') + 220);
  assert.match(side, /Assembly inventory|IKEAlive watch|part ID/i);
});

test("the css does not hide the custom notes while the studio is open", () => {
  const css = read("client/src/styles.css");
  const notesHidden = /#guide-notes[^{]*\{[^}]*display:\s*none/.test(css.replace(/\s+/g, " "));
  assert.equal(notesHidden, false, "a blanket display:none on #guide-notes kills the notes field");
  assert.equal(/id="guide-in"/.test(html), false, "pasted-guide textarea is not the PDF-plate path");
});

test("IKEAlive starts on PDF upload and plays a Seedance reel on watch", () => {
  assert.match(html, /id="product-name"/);
  assert.match(html, /id="product-lookup"/);
  assert.match(studio, /lookupManual|fetchNamedManual/);
  assert.match(html, /id="upload-form"/);
  assert.match(html, /Get the Reel/);
  assert.match(html, /New manual/);
  assert.match(html, /process-icon/);
  assert.doesNotMatch(html, /Build the reel/);
  assert.doesNotMatch(html, /New build/);
  assert.doesNotMatch(html, /Or paste the guide/);
  assert.match(html, /id="upload-progress"/);
  assert.match(html, /id="film-video"/);
  assert.match(html, /id="film-status"/);
  assert.match(html, /id="film-play"/);
  assert.match(html, /id="film-wait"/);
  assert.match(html, /id="film-back"/);
  assert.match(html, /id="film-scrub"/);
  assert.match(html, /panel watch chat/);
  assert.match(html, /id="ikea-chat-form"/);
  assert.match(html, /id="ikea-voice"/);
  assert.match(html, /id="lab-voice"/);
  assert.match(html, /id="ai-orb"/);
  assert.match(html, /id="ai-history"/);
  assert.match(html, /id="ai-scene"/);
  assert.equal(/<details class="studio-chat">/.test(html), false);
  assert.match(studio, /bindVoice/);
  assert.match(main, /bindVoice/);
  assert.match(main, /action\.type === "studio"/);
  assert.match(studio, /bootReel|parseCustom/);
  assert.match(studio, /Get the Reel/);
  assert.match(studio, /pagesFromPdf/, "IKEA PDFs are drawings — rasterize plates, do not send only the filename");
  assert.match(studio, /FAL_KEY/);
  assert.match(studio, /renderVideo/);
  assert.match(studio, /bom\.owned|You have this/);
  const showClip = studio.slice(studio.indexOf("function showClip"), studio.indexOf("function finishClip"));
  assert.equal(/drawFrame\(/.test(showClip), false, "watch film must be Seedance MP4, not the canvas table");
});

test("custom studio input is sent as-is — no invented unpack-the-photos guide", () => {
  assert.equal(
    /Unpack the pieces in the photos/.test(studio),
    false,
    "studio.js must not invent a placeholder guide when the user drops photos",
  );
  assert.match(studio, /pdf-upload/, "uploaded PDFs need to travel with parse");
  assert.equal(
    /plates\.text/.test(studio),
    false,
    "extracted PDF text must not be stuffed into the guide textarea",
  );
});

test("electronics stays off the Lab header and inspect", () => {
  assert.equal(/data-mode="electronics"/.test(html), false);
  const modes = html.slice(html.indexOf('id="modes"'), html.indexOf("</nav>"));
  assert.match(modes, /data-mode="ikeafy"/);
  assert.match(modes, /data-mode="lab"/);
  assert.equal(/data-mode="bench"/.test(modes), false, "Desk is inside Lab, not a header product");
  assert.equal(/data-mode="house"/.test(modes), false, "House is inside Lab, not a header product");
  assert.equal(/data-mode="ar"/.test(modes), false, "AR is inside Lab, not a header product");
  assert.match(html, /id="lab-spaces"/);
  assert.doesNotMatch(html, /id="electronics-only"/);
  assert.doesNotMatch(html, /id="flash-btn"/);
  assert.doesNotMatch(html, /id="isolate-btn"/);
  assert.doesNotMatch(html, /id="cables-panel"/);
  assert.doesNotMatch(html, />Arduino</);
});

test("Lab electronics chrome stays hidden even if the server still knows about boards", () => {
  assert.doesNotMatch(html, /electronics-chrome/, "electronics controls stay off the Lab markup");
  assert.match(main, /electronics-chrome/, "main.js still hides leftover electronics chrome");
  assert.match(main, /chrome\?\.electronics|chrome\.electronics/, "main.js still reads the server's chrome flag");
});

test("Lab loadCatalog hides electronics unless you search or toggle them", () => {
  assert.match(main, /function isLabShelfPart/);
  assert.match(main, /function isElectronicsQuery/);
  assert.match(main, /function filterLabCatalog/);
  assert.match(main, /category === "electronics"/);
  assert.match(main, /category === "cable"/);
  assert.match(main, /soldering-iron/);
  assert.match(main, /multimeter/);
  assert.match(main, /enclosure-print/);
  assert.match(main, /arduino-nano/);
  assert.match(main, /\.filter\(isLabShelfPart\)/);
  assert.match(main, /arduino\|leds\?\|nano\|esp\(\?:32\)\?\|resistors\?\|breadboards\?\|jumpers\?\|solder/);
  assert.match(html, /id="show-electronics"/);
  assert.match(html, /Show electronics/);
  assert.doesNotMatch(html, /id="show-electronics"[^>]*checked/);
  assert.match(main, /\$\("show-electronics"\)/);
  const server = read("server/index.js");
  assert.match(server, /state\.project = emptyProject\(\)/);
  assert.match(server, /filterLabCatalog/);
  assert.doesNotMatch(server, /req\.body\?\.lamp \? seedLampTable/);
  assert.doesNotMatch(html, /Arduino Nano|ESP32|Half breadboard|Soldering iron|Digital multimeter|Printable lamp enclosure/);
});

test("the bench catalog ids stay hidden and empty — no parts shelf", () => {
  assert.match(html, /id="catalog-well"/);
  assert.match(html, /id="catalog"/);
  assert.doesNotMatch(html, /catalog-panel/);
  assert.doesNotMatch(html, /Filter library/);
  assert.doesNotMatch(html, /parts in the catalogue/);
  assert.match(html, /class="hidden"[^>]*>[\s\S]*id="catalog-well"/);
  const css = read("client/src/styles.css");
  assert.match(css.replace(/\s+/g, " "), /#catalog-well[^}]*overflow-y: auto/);
  assert.doesNotMatch(main, /data-add="\$\{p\.id\}"/);
  assert.match(main, /shelf\.replaceChildren\(\)/);
});

test("lab tests stay behind a details fold", () => {
  const start = html.indexOf('id="lab-btns"');
  assert.ok(start > 0, "lab buttons must exist");
  assert.match(html.slice(Math.max(0, start - 400), start), /<details class="more-tools">/);
});

test("House is a live Lab form: photo, plan, cheaper fits, overlay", () => {
  for (const id of ["room-photo", "room-w", "room-d", "room-budget", "adapt-btn", "adapt-out", "ar-photo", "scan-btn", "scan-out"]) {
    assert.ok(markupIds.has(id), `House markup is missing #${id}`);
  }
  assert.match(main, /initHouse/);
  assert.match(main, /back-ikealive/);
  assert.match(html, /id="lab-room"/);
  assert.equal(/id="house-drawer"/.test(html), false, "House is not a far drawer");
  assert.match(house, /api\.adapt/);
  assert.match(house, /api\.scan/);
  assert.match(house, /you could end up with this/);
  assert.match(house, /Add to bench/);
  assert.match(house, /CHEAPER FITS/);
  assert.match(house, /drawImage/);
  assert.match(house, /drawPiece|fillRect/);
  assert.match(apiSource, /^\s{2}adapt:/m);
  assert.match(apiSource, /^\s{2}scan:/m);
});

test("Lab spaces are Bench, House, AR, then Scan", () => {
  const spacesAt = html.indexOf('id="lab-spaces"');
  assert.ok(spacesAt > 0, "Lab space switcher must exist");
  const spaces = html.slice(spacesAt, html.indexOf("</nav>", spacesAt));
  assert.match(spaces, /data-lab="desk"/);
  assert.match(spaces, />Bench</);
  assert.match(spaces, /data-lab="house"/);
  assert.match(spaces, /data-lab="ar"/);
  assert.match(spaces, /id="scan-btn"/);
  assert.ok(spaces.indexOf('data-lab="ar"') < spaces.indexOf('id="scan-btn"'), "Scan sits after AR/House");
  assert.match(html, /id="view"/);
  assert.match(html, /id="ar-photo"/);
  assert.match(html, /id="catalog-well"/);
  assert.match(html, /id="delete-piece"/);
  const left = html.slice(html.indexOf("lab-browser"), html.indexOf("lab-viewport"));
  assert.match(left, /id="room-photo"/);
  assert.match(left, /id="room-w"/);
  assert.match(left, /id="adapt-btn"/);
  assert.match(main, /setLabSpace/);
  assert.match(main, /data-lab/);
  assert.match(main, /dataset\.mode === "lab" && isLab\(\)/);
  assert.match(main, /ikealiveLog\("lab"/);
  const css = read("client/src/styles.css");
  assert.match(css, /data-lab="ar"/);
  assert.match(css, /#app\.mode-lab \.modes \[data-mode="ikeafy"\]/);
  assert.match(css.replace(/\s+/g, " "), /\.upload-actions button[^}]*flex: 1 1 0/);
  assert.doesNotMatch(css, /\.house-drawer/);
});

test("the lab strip assigns jobs and runs one behavior suite", () => {
  assert.match(html, /id="lab-strip"/);
  assert.match(html, /id="fn-btns"/);
  assert.match(html, /id="sim-behavior"/);
  assert.match(html, /data-fn="support"/);
  assert.match(html, /data-fn="light"/);
  assert.match(html, /data-fn="sense"/);
  assert.match(html, /data-fn="control"/);
  assert.match(html, /data-fn="decorate"/);
  const stripStart = html.indexOf('id="lab-strip"');
  const strip = html.slice(stripStart, html.indexOf("</details>", stripStart));
  assert.match(strip, /id="lab-btns"/, "the existing lab tests stay inside the new strip");
  assert.match(main, /simBehavior/);
  assert.match(main, /data-fn/);
  assert.match(apiSource, /simBehavior/);
});

test("the workshop is the app — no leftover Next store", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies?.next, undefined);
  assert.equal(pkg.devDependencies?.next, undefined);
  assert.equal(existsSync(path.join(root, "src/app")), false, "src/app is the old Next store");
  assert.equal(existsSync(path.join(root, "next.config.mjs")), false);
  assert.equal(existsSync(path.join(root, "tsconfig.json")), false);
  assert.equal(existsSync(path.join(root, ".next")), false, ".next is leftover Next build output");
  assert.equal(existsSync(path.join(root, "next-env.d.ts")), false);
  assert.doesNotMatch(read(".gitignore"), /next-env\.d\.ts|\.next/, "gitignore should not reserve Next files");
});

test("askShop applies creative-desk add, camera, label, and isolate", () => {
  assert.match(main, /applyShopActions/);
  assert.match(main, /api\.add\(/);
  assert.match(main, /api\.label\(/);
  assert.match(main, /api\.isolate\(/);
  assert.match(main, /shop\.setCamera/);
  assert.match(main, /action\.type === "add"|action\.type === "add_part"/);
});

test("bench editing controls are wired for furniture first", () => {
  for (const id of [
    "edit-bar",
    "edit-move",
    "edit-rotate",
    "edit-scale",
    "edit-snap",
    "edit-pose",
    "duplicate-piece",
    "delete-piece",
    "undo-edit",
    "redo-edit",
    "edit-tools",
    "snap-flag",
  ]) {
    assert.ok(markupIds.has(id), `bench editing markup is missing #${id}`);
  }
  assert.match(main, /api\.move/);
  assert.match(main, /api\.duplicate/);
  assert.match(main, /api\.undo/);
  assert.match(main, /api\.redo/);
  assert.match(main, /onPoseCommit|commitPose/);
  assert.match(main, /setEditMode/);
  assert.match(main, /shop\.setSnap|setSnap\(/);
  const workshop = read("client/src/workshop.js");
  assert.match(workshop, /setTranslationSnap/);
  assert.match(workshop, /onPoseCommit/);
  assert.match(apiSource, /^\s{2}duplicate:/m);
  assert.match(apiSource, /^\s{2}undo:/m);
  assert.match(apiSource, /^\s{2}redo:/m);
});

test("empty inspect is quiet — no ports, no Arduino", () => {
  const start = html.indexOf('id="inspect"');
  const block = html.slice(start, html.indexOf("</div>", start) + 6);
  assert.match(block, /Nothing selected/, "inspect needs a quiet empty-state line");
  assert.doesNotMatch(block, /ports?:/i);
  assert.doesNotMatch(block, /Arduino/i);
  assert.match(main, /EMPTY_INSPECT|showEmptyInspect/, "main.js must restore the empty inspect");
  assert.match(main, /syncDeleteButton/, "delete should track whether a piece is selected");
  assert.doesNotMatch(main, /Plugs:/);
  assert.doesNotMatch(main, /api\.flash\(/);
  assert.doesNotMatch(main, /The light blinks/);
});

test("Lab chrome is a CAD browser, viewport, and inspector", () => {
  assert.match(html, /class="[^"]*lab-browser/, "left pane is the Fusion-style browser");
  assert.match(html, /class="[^"]*lab-viewport/, "center pane is the CAD viewport");
  assert.match(html, /class="[^"]*lab-inspector/, "right pane is the KiCad-style inspector");
  assert.match(html, /Bodies/);
  assert.doesNotMatch(html, /Add · Catalog/);
  assert.match(html, /Parameters/);
  assert.match(html, /Functions/);
  assert.doesNotMatch(html, /Parameters · Functions · Nets/);
  assert.doesNotMatch(html, /<summary class="lab-sheet-sum">Nets<\/summary>/);
  const css = read("client/src/styles.css");
  assert.match(css, /\.lab-browser/);
  assert.match(css, /\.lab-viewport/);
  assert.match(css, /\.lab-inspector/);
  assert.match(css, /\.studio-side > \.watch \{/, "Finley watch cards keep their own chrome");
  assert.match(css, /\.watch-picks/);
  assert.match(css, /\.studio-side > \.watch\.chat/);
  assert.match(css, /Clash Display/, "Finley card type stays on the watch rail");
  assert.match(html, /class="panel watch bom"/);
  assert.match(html, /class="studio-side"/);
  assert.match(html, /data-lab-split="left"/);
  assert.match(html, /data-lab-toggle="right"/);
  assert.match(css, /--lab-left/);
});

test("the shop is a bottom-right AI circle with chat, voice, history, and scene", () => {
  const header = html.slice(html.indexOf('class="top"'), html.indexOf("</header>"));
  assert.doesNotMatch(header, /omnibox/);
  assert.doesNotMatch(header, /id="omnibox-ask"/);
  assert.match(html, /id="ai-orb"/);
  assert.match(html, /id="ai-dock"/);
  assert.match(html, /id="ai-scene"/);
  assert.match(html, /id="ai-history"/);
  assert.match(html, /id="chat-form"/);
  assert.match(html, /id="lab-voice"/);
  const inspector = html.slice(html.indexOf("lab-inspector"), html.indexOf("ai-orb"));
  assert.doesNotMatch(inspector, /id="chat-form"/);
  const css = read("client/src/styles.css");
  assert.match(css.replace(/\s+/g, " "), /\.ai-orb[^}]*right:/);
  assert.match(css.replace(/\s+/g, " "), /\.ai-orb[^}]*bottom:/);
  assert.match(css.replace(/\s+/g, " "), /\.ai-orb[^}]*border-radius:\s*50%/);
  assert.match(main, /bindAiDock/);
  assert.match(main, /sceneContext/);
  assert.match(main, /scene,/);
});

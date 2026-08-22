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
const lab = read("client/src/lab.js");
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
  assert.match(html, /feature-icon/);
  assert.doesNotMatch(html, /Build the reel/);
  assert.doesNotMatch(html, /New build/);
  assert.doesNotMatch(html, /Or paste the guide/);
  assert.match(html, /id="upload-progress"/);
  assert.match(html, /id="film-video"/);
  assert.match(html, /id="film-still"/);
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
  assert.match(studio, /guideText\s*=\s*plates\.text/, "send extracted PDF text to GLiNER 2 before vision");
  assert.match(studio, /guide:\s*guideText/, "include extracted PDF text in the assembly request");
  assert.match(studio, /FAL_KEY/);
  assert.match(studio, /renderVideo/);
  assert.match(studio, /bom\.owned|You have this/);
  const showClip = studio.slice(studio.indexOf("function showClip"), studio.indexOf("function finishClip"));
  assert.equal(/drawFrame\(/.test(showClip), false, "watch film must be Seedance MP4, not the canvas table");
});

test("image instructions render Nano Banana 2 stills in the film stage", () => {
  assert.match(html, /id="film-still"/);
  assert.match(studio, /bootImageReel/);
  assert.match(studio, /renderClipImage/);
  assert.match(studio, /showStill/);
  assert.match(studio, /api\.renderImage/);
  assert.match(studio, /ikealiveLog\("image"/);
  assert.match(studio, /FAL_IMAGE_REQUIRED|Nano Banana 2 instruction stills/);
  assert.match(apiSource, /ikeafy\/image\/render/);
  assert.match(apiSource, /^\s{2}renderImage:/m);
  const index = read("server/index.js");
  assert.match(index, /\/api\/ikeafy\/image\/render/);
  assert.match(index, /renderStepImage/);
  assert.match(index, /ikealiveLog\("image"/);
  const image = read("server/lib/image.js");
  assert.match(image, /fal-ai\/nano-banana-2/);
  assert.match(image, /https:\/\/queue\.fal\.run\/fal-ai\/nano-banana-2/);
  assert.doesNotMatch(image, /fal-ai\/flux\/schnell/);
  assert.match(image, /ikealiveLog\("image", "submit"/);
  assert.match(image, /ikealiveLog\("image", "poll"/);
  assert.match(image, /ikealiveLog\("image", "url"/);
  assert.doesNotMatch(image, /seedance/i);
  const showClip = studio.slice(studio.indexOf("function showClip"), studio.indexOf("function finishClip"));
  assert.match(showClip, /imageUrl/);
  assert.match(showClip, /showStill/);
  assert.equal(/drawFrame\(/.test(showClip), false, "image mode must not draw the LACK table canvas");
  const startChosen = studio.slice(studio.indexOf("async function startChosenRender"), studio.indexOf("function setMode"));
  assert.match(startChosen, /mode === "images"/);
  assert.match(startChosen, /bootImageReel/);
  assert.doesNotMatch(startChosen, /Image instructions are not implemented yet/);
});

test("3D instructions load a Tripo H3.1 GLB on the workshop without a catalog LACK table", () => {
  const workshop = read("client/src/workshop.js");
  const css = read("client/src/styles.css");
  const index = read("server/index.js");
  const scene = read("server/lib/scene.js");
  const startChosen = studio.slice(studio.indexOf("async function startChosenRender"), studio.indexOf("function setMode"));
  const bootScene = studio.slice(studio.indexOf("async function bootScene"), studio.indexOf("async function falIsLive"));
  const showClip = studio.slice(studio.indexOf("function showClip"), studio.indexOf("function finishClip"));

  assert.match(startChosen, /mode === "scene"/);
  assert.match(startChosen, /bootScene/);
  assert.doesNotMatch(startChosen, /3D engine instructions are not implemented yet/);
  assert.match(bootScene, /clipsFromOutline/);
  assert.match(bootScene, /falIsLive/);
  assert.match(bootScene, /renderClipScene/);
  assert.match(bootScene, /FAL_SCENE_REQUIRED/);
  assert.doesNotMatch(bootScene, /illustrate/);
  assert.match(showClip, /isSceneMode/);
  assert.match(showClip, /showScene/);
  assert.match(showClip, /meshUrl/);
  assert.match(studio, /ikealiveLog\("3d"/);
  assert.match(studio, /api\.renderScene/);
  assert.match(studio, /shop\?\.loadInstructionMesh/);
  assert.match(studio, /SCENE_FRAME_MS/);
  assert.doesNotMatch(studio, /shop\?\.illustrate/);
  assert.match(main, /initStudio\(\{[\s\S]*?shop/);
  assert.match(workshop, /function loadInstructionMesh/);
  assert.match(workshop, /GLTFLoader/);
  assert.match(workshop, /function clearInstructionMesh/);
  assert.doesNotMatch(workshop, /function illustrate/);
  assert.doesNotMatch(workshop, /layoutScenePieces/);
  assert.match(workshop, /setCamera/);
  assert.match(css, /data-render-mode="scene"\] #view/);
  assert.match(css, /opacity:\s*1/);
  assert.match(index, /ikealiveLog\("3d"/);
  assert.match(index, /\/api\/ikeafy\/scene\/render/);
  assert.match(index, /renderStepScene/);
  assert.match(index, /engine: "workshop"/);
  assert.match(index, /tripo3d\/h3\.1\/text-to-3d/);
  assert.doesNotMatch(index, /3D engine instructions are not implemented yet/);
  assert.match(scene, /https:\/\/queue\.fal\.run\/tripo3d\/h3\.1\/text-to-3d/);
  assert.match(scene, /ikealiveLog\("3d", "model"/);
  assert.match(scene, /ikealiveLog\("3d", "submit"/);
  assert.match(scene, /ikealiveLog\("3d", "poll"/);
  assert.match(scene, /ikealiveLog\("3d", "mesh"/);
  assert.match(apiSource, /ikeafy\/scene\/render/);
  assert.match(apiSource, /^\s{2}renderScene:/m);
});

test("upload offers video, image, and 3D instruction controls before Seedance", () => {
  for (const id of ["render-modes", "render-mode-video", "render-mode-images", "render-mode-scene"]) {
    assert.ok(markupIds.has(id), `upload markup is missing #${id}`);
  }
  assert.match(html, /data-render-mode="video"/);
  assert.match(html, /data-render-mode="images"/);
  assert.match(html, /data-render-mode="scene"/);
  assert.match(html, /Video instructions/);
  assert.match(html, /Image instructions/);
  assert.match(html, /3D instructions/);
  assert.match(html, /Get the Reel/);
  assert.match(studio, /#render-mode-video/);
  assert.match(studio, /#render-mode-images/);
  assert.match(studio, /#render-mode-scene/);
  assert.match(studio, /chooseRenderMode/);
  assert.match(studio, /afterGuideReady/);
  assert.match(studio, /startChosenRender/);
  assert.match(studio, /ikealiveLog\("render"/);
  assert.match(studio, /api\.runStart\(\{[\s\S]*?renderMode:/);
  assert.match(studio, /api\.renderVideo\(\{[\s\S]*?renderMode:/);
  assert.match(studio, /api\.render\(/);
  assert.match(studio, /mode !== "video"/);
  assert.match(apiSource, /ikeafy\/render/);
  assert.match(apiSource, /^\s{2}render:/m);
  const index = read("server/index.js");
  assert.match(index, /\/api\/ikeafy\/render/);
  assert.match(index, /ikealiveLog\("render"/);
  const parseCustom = studio.slice(studio.indexOf("async function parseCustom"), studio.indexOf("function saveCustom"));
  assert.match(parseCustom, /afterGuideReady/);
  assert.doesNotMatch(parseCustom, /await bootReel\(/);
  const startOfficial = studio.slice(studio.indexOf("async function startOfficial"), studio.indexOf("async function parseCustom"));
  assert.match(startOfficial, /afterGuideReady/);
  assert.doesNotMatch(startOfficial, /await bootReel\(/);
});

test("custom studio sends extracted PDF text to GLiNER 2 without inventing guide text", () => {
  assert.equal(
    /Unpack the pieces in the photos/.test(studio),
    false,
    "studio.js must not invent a placeholder guide when the user drops photos",
  );
  assert.match(studio, /pdf-upload/, "uploaded PDFs need to travel with parse");
  assert.match(studio, /guideText\s*=\s*plates\.text/);
  assert.match(studio, /guide:\s*guideText/);
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

test("Lab loadCatalog hides electronics unless the search asks for them", () => {
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
  assert.doesNotMatch(html, /id="show-electronics"/);
  assert.doesNotMatch(html, /Show electronics/);
  assert.doesNotMatch(main, /\$\("show-electronics"\)/);
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

test("dead simulation controls stay out of the Lab", () => {
  assert.doesNotMatch(html, /id="lab-btns"/);
  assert.doesNotMatch(html, /id="sim-behavior"/);
  assert.doesNotMatch(html, /data-test=/);
  assert.doesNotMatch(html, /id="tape-elec"|id="tape-gaff"/);
  assert.doesNotMatch(lab, /Run sim|data-sim|simRun/);
});

test("House is a live Lab form: photos, plan, cheaper fits, overlay", () => {
  for (const id of ["room-photo", "room-photos", "room-w", "room-d", "room-budget", "adapt-btn", "adapt-out", "ar-photo", "room-scene", "scan-btn", "scan-out", "scan-phone-url", "scan-phone-link"]) {
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
  assert.match(apiSource, /^\s{2}scanPlan:/m);
  assert.match(html, /id="scan-place-room"/);
  assert.match(html, /id="scan-bake-plan"/);
  assert.match(html, /id="room-orbit-hint"/);
  assert.match(main, /scan-place-room/);
  assert.match(main, /scan-bake-plan/);
  assert.match(main, /startFromGuide/);
  assert.match(studio, /startFromGuide/);
  const startFromGuide = studio.slice(studio.indexOf("async function startFromGuide"), studio.indexOf("async function startOfficial"));
  assert.match(startFromGuide, /afterGuideReady/);
  assert.doesNotMatch(startFromGuide, /await bootReel\(/);
  assert.match(house, /makeGenericSideTable/);
  assert.match(house, /KeyW/);
  assert.match(house, /maxPolarAngle = Math.PI \/ 2/);
  assert.doesNotMatch(html, /id="sim-toggle"/);
  assert.doesNotMatch(html, /id="reset-sim"/);
  assert.doesNotMatch(html, /id="print-btn"/);
});

test("Lab spaces are Bench and House; camera/video live under Scan", () => {
  const spacesAt = html.indexOf('id="lab-spaces"');
  assert.ok(spacesAt > 0, "Lab space switcher must exist");
  const spaces = html.slice(spacesAt, html.indexOf("</nav>", spacesAt));
  assert.match(spaces, /data-lab="desk"/);
  assert.match(spaces, />Bench</);
  assert.match(spaces, /data-lab="house"/);
  assert.doesNotMatch(spaces, /data-lab="ar"/);
  assert.match(spaces, /id="scan-btn"/);
  assert.ok(spaces.indexOf('data-lab="house"') < spaces.indexOf('id="scan-btn"'), "Scan sits after House");
  assert.match(html, /id="scan-camera-preview"/);
  assert.match(html, /id="scan-video"/);
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
  assert.doesNotMatch(css, /data-lab="ar"/);
  assert.match(css, /#app\.mode-lab \.modes \[data-mode="ikeafy"\]/);
  assert.match(css.replace(/\s+/g, " "), /\.upload-actions button[^}]*flex: 1 1 0/);
  assert.doesNotMatch(css, /\.house-drawer/);
});

test("the Desk left bar is a modeling sidebar; House keeps the room panel", () => {
  const left = html.slice(html.indexOf("lab-browser"), html.indexOf("lab-viewport"));

  // Model section: create, faces, cuts, sculpt and show tools live on the left bar.
  assert.match(left, /id="model-tools"/);
  for (const tool of ["extrude", "inset", "bevel", "knife", "loopcut"]) {
    assert.match(left, new RegExp(`data-mesh-tool="${tool}"`), `${tool} button lives in the sidebar`);
  }
  for (const brush of ["grab", "smooth", "inflate"]) {
    assert.match(left, new RegExp(`data-sculpt="${brush}"`), `${brush} brush lives in the sidebar`);
  }
  assert.match(left, /data-cad-tool="sketch-rect"/);
  assert.match(left, /data-subdivide/);
  assert.match(left, /data-hide-selected/);
  assert.match(left, /data-unhide-all/);

  // The top strip keeps only transform/snap/history; the moved tools left it.
  const strip = html.slice(html.indexOf('id="edit-tools"'), html.indexOf('id="edit-pose"'));
  assert.doesNotMatch(strip, /data-sculpt=|data-mesh-tool=|data-cad-tool=|data-subdivide/);

  // Fusion-like measure + scale: two-point mm readout and numeric scaling.
  assert.match(left, /id="side-measure"/);
  assert.match(left, /id="measure-readout"/);
  assert.match(left, /id="scale-factor"/);
  assert.match(left, /id="scale-apply"/);
  assert.match(left, /id="scale-target-mm"/);
  assert.match(left, /id="scale-to-measure"/);
  assert.match(lab, /side-measure/);

  // Desk sections hide in House and vice versa; House keeps its room panel.
  const css = read("client/src/styles.css");
  assert.match(css, /data-lab="house"\] \.lab-browser \.desk-space \{ display: none/);
  assert.match(css, /data-lab="desk"\] \.lab-browser \.house-space \{ display: none/);
  assert.match(left, /id="lab-room"[^>]*house-space|house-space[^>]*id="lab-room"/);
  assert.match(left, /id="room-photo"/);
  assert.match(left, /id="adapt-btn"/);

  // main.js wires the sidebar to the workshop.
  assert.match(main, /model-tools/);
  assert.match(main, /scaleSelectedToMeasured/);
  assert.match(main, /hideSelectedBody/);
  assert.match(main, /unhideAllBodies/);

  // The workshop exposes the modeling API the sidebar reaches for.
  const shopSource = read("client/src/workshop.js");
  for (const method of ["setMeshTool", "onMeshEdit", "hideSelected", "unhideAll", "setPieceHidden", "isPieceHidden", "getMeasuredMm"]) {
    assert.match(shopSource, new RegExp(method), `workshop exposes ${method}`);
  }
});

test("the removed function and simulation strips stay out of the Lab", () => {
  assert.doesNotMatch(html, /id="lab-strip"|id="fn-btns"|data-fn=/);
  assert.doesNotMatch(lab, /simRun|data-sim|Run sim/);
  assert.doesNotMatch(main, /shopLine|part\.store|Job: \$\{piece/);
  assert.match(html, /data-watch-card="bom"/);
  assert.match(html, /data-watch-card="reviews"/);
  assert.match(html, /data-watch-card="broken"/);
  assert.match(html, /data-watch-card="spare"/);
  assert.match(html, /id="broken-btn"/);
  assert.match(html, /id="bom"/);
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

test("retail links never fall back to a bare Shop label", () => {
  assert.doesNotMatch(studio, /\|\|\s*"Shop"/, "unnamed retailers read as View, not Shop");
  assert.doesNotMatch(html, />\s*Shop\s*</);
});

test("askShop applies creative-desk add, camera, label, and isolate", () => {
  assert.match(main, /applyShopActions/);
  assert.match(main, /api\.add\(/);
  assert.match(main, /api\.label\(/);
  assert.match(main, /api\.isolate\(/);
  assert.match(main, /shop\.setCamera/);
  assert.match(main, /action\.type === "add"|action\.type === "add_part"/);
  assert.match(main, /action\.type === "scan"/);
  assert.match(main, /action\.type === "move"/);
  assert.match(main, /buildSceneContext|labScenePayload/);
  assert.match(main, /photoName/);
});

test("Lab AI is a bottom-right orb, alongside the header search", () => {
  for (const id of ["ai-orb", "ai-dock", "ai-mic", "ai-history", "ai-status", "chat-log", "chat-in"]) {
    assert.ok(markupIds.has(id), `Lab AI markup is missing #${id}`);
  }
  assert.match(html, /id="omnibox"/);
  const css = read("client/src/styles.css");
  assert.match(css, /#ai-orb/);
  assert.match(css, /#app\.mode-ikeafy #ai-orb/);
  assert.match(main, /bindVoice/);
  assert.match(main, /bindAiDock/);
  assert.match(main, /webkitSpeechRecognition|speechCtor|bindVoice/);
});

test("bench editing controls are wired for furniture first", () => {
  for (const id of [
    "edit-move",
    "edit-rotate",
    "edit-scale",
    "edit-snap",
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

test("sculpt-lite: grab, smooth, inflate and one subdivide on the selected body", () => {
  const tools = html.slice(html.indexOf('id="model-tools"'), html.indexOf("lab-measure-fold"));
  assert.match(tools, /data-sculpt="grab"/);
  assert.match(tools, /data-sculpt="smooth"/);
  assert.match(tools, /data-sculpt="inflate"/);
  assert.match(tools, /data-subdivide/);
  const workshop = read("client/src/workshop.js");
  assert.match(workshop, /setSculptMode/);
  assert.match(workshop, /subdivideSelected/);
  assert.match(workshop, /applySculptStore\(\)/, "sync() must re-apply sculpted geometry");
  assert.match(workshop, /weldGroups/, "split corner verts must move together");
  assert.match(main, /shop\.setSculptMode/);
  assert.match(main, /shop\.subdivideSelected/);
  assert.match(main, /data-sculpt/);
});

test("finish shows progress, scores a physical way, prints it, and opens its parsed todo", () => {
  assert.match(html, /id="finish-model"/);
  assert.match(html, /Finish \/ Find a way/);
  assert.match(html, /id="finish-progress-bar"/);
  assert.match(html, /id="finish-progress-text"/);
  assert.match(html, /visual and dimensional similarity/);
  assert.match(html, /Ways-to-make history/);
  assert.match(apiSource, /^\s{2}startFinishProject:/m);
  assert.match(apiSource, /^\s{2}finishJob:/m);
  assert.match(apiSource, /^\s{2}diyCurrent:/m);
  assert.match(apiSource, /diyCurrent:\s*\(model = \[\]\).*\/api\/project\/diy/);
  assert.match(main, /api\.startFinishProject\(model\)/);
  assert.match(main, /api\.diyCurrent\(meshModel\)/);
  assert.match(main, /api\.finishJob\(id\)/);
  assert.match(main, /finishModelSnapshot/);
  assert.match(main, /Reading the model/);
  assert.match(main, /closest physical result/);
  assert.match(main, /refreshCurrentDiy/);
  assert.match(main, /Ways PDF/);
  assert.match(main, /openBuildPacketPrint/);
  assert.match(main, /openAssemblyView/);
  assert.match(main, /shop\.onSculpt[\s\S]*refreshCurrentDiy/);
  assert.match(main, /shop\.onMeshEdit[\s\S]*refreshCurrentDiy/);
  assert.match(main, /connection-hardware lines/);
});

test("workshop floor is one surface — no GridHelper, no shadow fight", () => {
  const workshop = read("client/src/workshop.js");
  const start = workshop.indexOf("export function createWorkshop");
  const created = workshop.slice(start, workshop.indexOf("const group = new THREE.Group()", start));
  assert.doesNotMatch(created, /new THREE\.GridHelper/);
  assert.match(created, /polygonOffset:\s*true/);
  assert.match(created, /floor\.receiveShadow\s*=\s*false/);
  assert.match(created, /floor\.position\.y\s*=\s*-0\.12/);
  assert.doesNotMatch(workshop, /new THREE\.GridHelper/);
  assert.match(workshop, /floor\.receiveShadow\s*=\s*false/);
  assert.doesNotMatch(workshop, /floor\.receiveShadow\s*=\s*true/);
  assert.doesNotMatch(workshop, /floor\.receiveShadow\s*=\s*!lookOn/);
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
  assert.match(html, /Materials/);
  assert.doesNotMatch(html, />Functions</);
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

test("materials read real: env specular, wood grain, brushed metal, metalness meter", () => {
  const workshop = read("client/src/workshop.js");

  // Image-based specular so metalness/roughness visibly travel.
  assert.match(workshop, /RoomEnvironment/, "procedural room env — no texture downloads");
  assert.match(workshop, /scene\.environment = pmrem/, "prefiltered env feeds physical materials");
  assert.match(workshop, /environmentIntensity/);

  // Wood is grain, tone drift, and relief — not a brown fill.
  assert.match(workshop, /function grainCanvas/);
  assert.match(workshop, /blotches/, "solid wood gets low-frequency tone variation");
  assert.match(workshop, /openWoodMaterial/);
  const wood = workshop.slice(workshop.indexOf("function openWoodMaterial"), workshop.indexOf("function materialFor"));
  assert.match(wood, /bumpMap/, "grain doubles as height so pores catch raking light");
  assert.match(wood, /roughnessMap/, "latewood reads duller than the sanded face");

  // Foil laminate: shader-jittered sheen plus real anisotropy along the grain.
  assert.match(workshop, /roughnessFactor = clamp/, "foil shader hook still jitters roughness");
  assert.match(workshop, /ikeaStreak/, "sheen streaks run with the printed grain");
  assert.match(workshop, /anisotropyRotation/);

  // Metal is brushed against the environment, not grey plastic.
  assert.match(workshop, /function brushedCanvas/);
  assert.match(workshop, /brushedMetalMaterial/);
  assert.match(workshop, /anisotropy: 0\.\d+/);

  // The metalness meter exists and reaches the per-piece materials.
  assert.match(html, /id="mat-metal"/);
  assert.match(html, /id="mat-metal-out"/);
  assert.match(main, /mat-metal/);
  assert.match(main, /applyMaterial\(\{ metalness \}\)/);
  assert.match(workshop, /metalness: metalness \?\? 0\.05|metalness \?\? 0\.05/, "getPieceMaterial reports metalness");
  const setter = workshop.slice(workshop.indexOf("function setPieceMaterial"), workshop.indexOf("function getPieceMaterial"));
  assert.match(setter, /metalness/, "setPieceMaterial applies the meter");
});

test("the shop is a bottom-right editable 3D generator with chat context", () => {
  assert.match(html, /id="ai-orb"/);
  assert.match(html, /id="ai-dock"/);
  assert.match(html, /id="ai-scene"/);
  assert.match(html, /id="ai-history"/);
  assert.match(html, /id="chat-form"/);
  assert.match(html, /id="lab-voice"/);
  assert.match(html, /Describe a chair, monster, room corner, or anything else/);
  assert.match(html, /Prompt the editable 3D generator/);
  assert.doesNotMatch(html, /id="many-agents-note"|build this furniture/);
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

test("physics preview is an overlay by Finish that never edits the bodies", () => {
  // The control sits in the viewport meta bar next to Finish / Find a way.
  const meta = html.slice(html.indexOf('class="lab-view-meta"'), html.indexOf('class="lab-proj"'));
  assert.match(meta, /id="physics-btn"/, "the Will it hold? button lives by Finish");
  assert.match(meta, /id="finish-model"/);
  assert.match(html, /id="physics-verdict"/, "the status bar carries the verdict");

  // main.js toggles the preview and repaints when the workshop clears it.
  assert.match(main, /runPhysicsPreview/);
  assert.match(main, /clearPhysicsPreview/);
  assert.match(main, /onPhysicsCleared/);

  // The workshop runs the pure analyzer and animates ghost clones only.
  const workshop = read("client/src/workshop.js");
  assert.match(workshop, /from "\.\/stability\.js"/);
  assert.match(workshop, /physicsFx/);
  assert.match(workshop, /clone\(true\)/, "ghosts are clones, not the editable meshes");
  assert.doesNotMatch(
    workshop.slice(workshop.indexOf("Physics preview"), workshop.indexOf("function clearPhysicsPreview")),
    /geometry\.attributes|setAttribute|needsUpdate/,
    "the preview never writes into body geometry",
  );

  // The analyzer stays pure so node:test can drive stable vs unstable builds.
  const stability = read("client/src/stability.js");
  assert.doesNotMatch(stability, /["']three["']|from "three/, "stability.js must not need three.js");
  assert.match(stability, /analyzeStability/);
  assert.match(stability, /floating/);
  assert.match(stability, /tip/);
  assert.match(stability, /joint/);
});

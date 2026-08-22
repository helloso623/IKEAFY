/**
 * Smoke checks for the desktop shell. These read the Electron entry and
 * package.json — they do not launch Electron (that is too heavy for CI).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const entry = path.join(root, "electron/main.js");
const main = readFileSync(entry, "utf8");
const vite = readFileSync(path.join(root, "client/vite.config.js"), "utf8");
const html = readFileSync(path.join(root, "client/index.html"), "utf8");

function startsStack(script) {
  return /dev:client|vite/.test(script) && /electron/.test(script);
}

test("Electron entry exists and package.json points at it", () => {
  assert.equal(existsSync(entry), true);
  assert.equal(pkg.main, "electron/main.js");
  assert.ok(pkg.scripts.electron, "package.json needs an electron script");
  assert.ok(pkg.scripts["dev:electron"], "package.json needs a dev:electron script");
  assert.ok(pkg.scripts["electron:dev"], "package.json needs an electron:dev script");
  assert.ok(startsStack(pkg.scripts.electron), "electron starts vite + electron");
  assert.ok(startsStack(pkg.scripts["electron:dev"]), "electron:dev starts vite + electron");
  assert.doesNotMatch(pkg.scripts.electron, /dev:server/, "Electron owns its one Express child");
  assert.doesNotMatch(pkg.scripts["electron:dev"], /dev:server/, "Electron owns its one Express child");
});

test("browser npm run dev still starts the Vite + Express workshop", () => {
  assert.match(pkg.scripts.dev, /dev:server/);
  assert.match(pkg.scripts.dev, /dev:client/);
  assert.doesNotMatch(pkg.scripts.dev, /electron/);
});

test("Electron loads the local UI on 5173, localhost, or file:// dist without nodeIntegration", () => {
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /loadURL/);
  assert.match(main, /5173/);
  assert.match(main, /127\.0\.0\.1/);
  assert.match(main, /file:|pathToFileURL|distFileUrl/);
  assert.match(main, /dist/);
  assert.match(main, /BrowserWindow/);
  assert.match(main, /waitForUrl/);
  assert.match(main, /\/api\/health/);
  assert.match(main, /buildsMatch/);
  assert.match(main, /stale IKEAlive code/);
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(main, /apiPort/, "file renderers need the Express port in their URL");
  assert.match(vite, /base:\s*["']\.\/["']/, "file renderers need relative built assets");
  assert.match(vite, /strictPort:\s*true/, "Electron must not wait on a different port than Vite selected");
  assert.match(vite, /process\.env\.CLIENT_PORT/, "Vite and Electron must honor the same client port");
  assert.match(vite, /process\.env\.PORT/, "Vite must proxy to Electron's Express port");
  assert.match(vite, /__IKEALIVE_RENDERER_BUILD__/, "the renderer needs immutable startup build info");
  assert.doesNotMatch(main, /nodeIntegration:\s*true/);
});

test("production Electron does not attach to an arbitrary Vite process", () => {
  const clientUrl = main.slice(main.indexOf("export async function clientUrl"), main.indexOf("function attachRendererLogs"));
  assert.match(clientUrl, /if \(isDev\)/);
  assert.doesNotMatch(clientUrl, /urlReady\(CLIENT_ORIGIN\)/);
  assert.match(clientUrl, /fileClientUrl/);
});

test("Electron pipes BrowserWindow console-message events to process.stdout", () => {
  assert.match(main, /console-message/);
  assert.match(main, /process\.stdout\.write/);
  assert.match(main, /attachRendererLogs/);
  assert.match(main, /from "\.\/log\.js"/);
  assert.match(main, /"console-message",\s*\(event\)\s*=>/);
  assert.doesNotMatch(main, /"console-message",\s*\(event,\s*level,\s*message\)/);
});

test("renderer has a restrictive CSP compatible with local Vite development", () => {
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /default-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /ws:\/\/127\.0\.0\.1:\*/);
  assert.doesNotMatch(html, /script-src[^;]*'unsafe-eval'/);
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/);
});

test("Electron grants video-only media access to its local renderer", () => {
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /permission === "media"/);
  assert.match(main, /mediaTypes\.includes\("video"\)/);
  assert.match(main, /!mediaTypes\.includes\("audio"\)/);
  assert.match(main, /127\.0\.0\.1|localhost/);
});

test(".env stays out of the repo", () => {
  const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^\.env$/m);
  const tracked = execSync("git ls-files -z", { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  assert.equal(tracked.includes(".env"), false, "do not commit .env");
  assert.equal(tracked.includes(".env.example"), true, ".env.example is the public template");
});

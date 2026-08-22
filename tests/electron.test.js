/**
 * Smoke checks for the desktop shell. These read the Electron entry and
 * package.json — they do not launch Electron (that is too heavy for CI).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const entry = path.join(root, "electron/main.js");
const main = readFileSync(entry, "utf8");

test("Electron entry exists and package.json points at it", () => {
  assert.equal(existsSync(entry), true);
  assert.equal(pkg.main, "electron/main.js");
  assert.ok(pkg.scripts.electron, "package.json needs an electron script");
  assert.ok(pkg.scripts["dev:electron"], "package.json needs a dev:electron script");
});

test("browser npm run dev still starts the Vite + Express workshop", () => {
  assert.match(pkg.scripts.dev, /dev:server/);
  assert.match(pkg.scripts.dev, /dev:client/);
  assert.doesNotMatch(pkg.scripts.dev, /electron/);
});

test("Electron loads the client over localhost without nodeIntegration", () => {
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /loadURL/);
  assert.match(main, /127\.0\.0\.1/);
  assert.match(main, /BrowserWindow/);
  assert.match(main, /waitForUrl/);
  assert.match(main, /\/api\/health/);
  assert.doesNotMatch(main, /nodeIntegration:\s*true/);
});

test("Electron pipes BrowserWindow console-message events to process.stdout", () => {
  assert.match(main, /console-message/);
  assert.match(main, /process\.stdout\.write/);
  assert.match(main, /attachRendererLogs/);
  assert.match(main, /from "\.\/log\.js"/);
});

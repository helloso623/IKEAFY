/**
 * Desktop shell for the IKEAlive / Lab web app (upload/watch, Bench, House).
 * Starts Express when needed, then loads the Vite client on :5173 in dev or
 * the built UI from file://dist (falling back to the Express static origin).
 * Renderer console-message events are forwarded to the Electron terminal.
 */
import { app, BrowserWindow, dialog } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rendererConsoleText } from "./log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST_INDEX = path.join(ROOT, "dist", "index.html");

export const SERVER_PORT = Number(process.env.PORT || 8787);
export const CLIENT_PORT = Number(process.env.CLIENT_PORT || process.env.VITE_PORT || 5173);
export const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
export const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;

const isDev = process.env.ELECTRON_DEV === "1";
const WAIT_MS = isDev ? 90_000 : 45_000;

let serverProcess = null;
let quitting = false;

export function distFileUrl(indexPath = DIST_INDEX) {
  if (!existsSync(indexPath)) return null;
  return pathToFileURL(indexPath).href;
}

export async function waitForUrl(url, timeoutMs = WAIT_MS) {
  const started = Date.now();
  let lastError = "unreachable";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = String(err?.message || err);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url} (${lastError})`);
}

async function urlReady(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

function startExpress() {
  const nodeBin = process.env.npm_node_execpath || "node";
  const child = spawn(nodeBin, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: String(SERVER_PORT) },
  });
  child.on("exit", (code, signal) => {
    if (!quitting && code && code !== 0) {
      console.error(`Express server exited (${code || signal})`);
    }
  });
  return child;
}

export async function ensureServer() {
  if (await urlReady(`${SERVER_ORIGIN}/api/health`)) return;
  serverProcess = startExpress();
  await waitForUrl(`${SERVER_ORIGIN}/api/health`);
}

export async function clientUrl() {
  await ensureServer();
  if (isDev) {
    await waitForUrl(CLIENT_ORIGIN);
    return CLIENT_ORIGIN;
  }
  if (await urlReady(CLIENT_ORIGIN)) return CLIENT_ORIGIN;
  const fileUrl = distFileUrl();
  if (fileUrl) return fileUrl;
  return SERVER_ORIGIN;
}

function attachRendererLogs(win) {
  win.webContents.on("console-message", (event, level, message) => {
    const text = rendererConsoleText(event, level, message);
    if (!text) return;
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  });
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: "IKEAlive",
    backgroundColor: "#f4efe4",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  attachRendererLogs(win);
  win.loadURL(url);
  return win;
}

const launchedAsElectron = Boolean(app);

if (launchedAsElectron) {
  app.setName("IKEAlive");

  app.whenReady().then(async () => {
    try {
      const url = await clientUrl();
      createWindow(url);
    } catch (err) {
      console.error(err);
      dialog.showErrorBox("IKEAlive", String(err?.message || err));
      app.quit();
      return;
    }
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(await clientUrl());
      }
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

// IKEAFY Electron main process.
// Wraps the Next.js UI in a desktop window. This shell does NOT start the
// Next.js server itself — run the web app first, then launch Electron:
//   1. `npm run dev`            (or `npm run build && npm start` for prod)
//   2. `electron electron/main.js`
// The window loads process.env.IKEAFY_URL, defaulting to http://localhost:3000.

const { app, BrowserWindow } = require("electron");
const path = require("path");

const APP_URL = process.env.IKEAFY_URL || "http://localhost:3000";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "IKEAFY",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

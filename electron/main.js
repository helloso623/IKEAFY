// IKEAFY desktop shell.
//
// This Electron main process expects the Next.js server to be running on PORT
// (either `npm run dev`, or `npm start` after `npm run build`). It simply loads
// that local server in a native window.

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DEV_URL = `http://localhost:${PORT}`;

function loadWithRetry(win, url, attemptsLeft = 20) {
  win.loadURL(url).catch(() => {
    if (attemptsLeft > 0) {
      // Dev server may not be up yet; retry shortly.
      setTimeout(() => loadWithRetry(win, url, attemptsLeft - 1), 1000);
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "IKEAFY",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank / external http(s) links in the user's default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  loadWithRetry(win, DEV_URL);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // On macOS, re-create a window when the dock icon is clicked and none open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS apps typically stay active until the user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

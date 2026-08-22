// Minimal, safe preload. With contextIsolation enabled we only expose a tiny
// read-only API to the renderer via contextBridge — no Node access leaks.

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ikeafy", {
  platform: process.platform,
  isElectron: true,
});

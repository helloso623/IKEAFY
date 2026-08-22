// IKEAFY Electron preload script.
// Runs in an isolated context before the renderer loads. It exposes only a
// tiny, read-only surface via contextBridge and never leaks Node.js APIs.

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ikeafy", {
  version: process.env.npm_package_version || "0.1.0",
  platform: process.platform,
});

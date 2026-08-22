const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ikeafy", {
  platform: process.platform,
  isElectron: true,
});

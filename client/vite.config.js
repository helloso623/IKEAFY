import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeBuild } from "../runtime-build.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");
const serverPort = Number(process.env.PORT || 8787);
const clientPort = Number(process.env.CLIENT_PORT || process.env.VITE_PORT || 5173);
const build = runtimeBuild(projectRoot);

export default defineConfig({
  root,
  // Electron loads dist/index.html over file:// when Vite is not running.
  // Relative asset URLs keep the built renderer usable in that mode.
  base: "./",
  publicDir: path.join(root, "public"),
  server: {
    host: "0.0.0.0",
    port: clientPort,
    strictPort: true,
    proxy: {
      // Seedance can poll fal for ~15 minutes; do not let the Vite proxy cut the socket first.
      "/api": {
        target: `http://127.0.0.1:${serverPort}`,
        timeout: 0,
        proxyTimeout: 0,
      },
      "/phone-upload": `http://127.0.0.1:${serverPort}`,
      "/phone": `http://127.0.0.1:${serverPort}`,
    },
  },
  define: {
    __IKEALIVE_RENDERER_BUILD__: JSON.stringify(build),
  },
  build: {
    outDir: path.join(projectRoot, "dist"),
    emptyOutDir: true,
  },
});

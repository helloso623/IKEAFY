import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  // Electron loads dist/index.html over file:// when Vite is not running.
  // Relative asset URLs keep the built renderer usable in that mode.
  base: "./",
  publicDir: path.join(root, "public"),
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: path.join(root, "..", "dist"),
    emptyOutDir: true,
  },
});

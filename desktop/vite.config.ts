import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(desktopRoot, "..");

export default defineConfig({
  root: desktopRoot,
  base: "./",
  publicDir: path.join(projectRoot, "public"),
  plugins: [react()],
  css: { postcss: path.join(projectRoot, "postcss.config.mjs") },
  build: {
    outDir: path.join(projectRoot, "desktop-dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});

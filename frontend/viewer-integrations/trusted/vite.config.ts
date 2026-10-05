import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
export default defineConfig({
  root,
  publicDir: false,
  worker: { format: "es" },
  build: { outDir: "dist/web", chunkSizeWarningLimit: 5000 },
});

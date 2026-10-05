import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: {
    rollupOptions: {
      input: {
        viewer: fileURLToPath(new URL("./index.html", import.meta.url)),
        trusted: fileURLToPath(new URL("./trusted.html", import.meta.url)),
      },
    },
    outDir: "../../public/viewer/cad",
    chunkSizeWarningLimit: 5000,
  },
});

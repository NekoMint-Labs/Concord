import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: { outDir: "../../public/viewer/cad", chunkSizeWarningLimit: 5000 },
});

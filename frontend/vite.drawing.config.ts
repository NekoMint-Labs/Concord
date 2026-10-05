import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
/** Independently qualify C's lazy surfaces before B's product integration. */
export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  build: {
    outDir: "../.verification-work/drawing-dist",
    rollupOptions: { input: resolve("tests/engineering-viewers.html") },
  },
});

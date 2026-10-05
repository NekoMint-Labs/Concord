import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "viewer-integrations/trusted/dist/mapper",
    lib: {
      entry: fileURLToPath(new URL("./normalization.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "normalization.mjs",
    },
  },
});

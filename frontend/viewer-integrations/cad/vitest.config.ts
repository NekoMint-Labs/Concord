import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    server: { deps: { inline: [/@mlightcad\//] } },
    include: ["viewer-integrations/cad/tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});

import { defineConfig } from "@playwright/test";
import engineering from "./playwright.engineering.config";

/** Opt-in real SDK pressure lane; missing SDK/assets fail instead of being mocked. */
export default defineConfig({
  ...engineering,
  testMatch: ["**/ifc-pressure.spec.ts"],
  outputDir: "test-results/ifc-pressure",
});

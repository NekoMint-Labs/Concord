import { defineConfig } from "@playwright/test";
import realProject from "./playwright.real-project.config";

// Own isolated data/process like the real-project lane; no route mocks or developer DB.
export default defineConfig({
  ...realProject,
  testMatch: ["**/engineering-real.spec.ts", "**/evidence-integration.spec.ts"],
  outputDir: "../.verification-work/issue-16-real/results",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "../.verification-work/issue-16-real/report",
      },
    ],
  ],
});

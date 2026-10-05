import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Run only in the pinned B + C rehearsal. Never substitute a probe for B's host.
if (!existsSync("src/app/EvidenceWorkspaceHost.tsx"))
  throw new Error(
    "Evidence host qualification requires the combined #22 + #24 tree",
  );

export default defineConfig({
  testDir: "./tests/host",
  testMatch: "**/host.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120000,
  expect: { timeout: 60000 },
  outputDir: "test-results/evidence-host",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:15173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 15173",
    url: "http://127.0.0.1:15173/tests/host/evidence-host.html",
    reuseExistingServer: false,
  },
});

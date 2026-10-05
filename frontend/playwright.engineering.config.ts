import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/drawing.spec.ts",
    "**/cad.spec.ts",
    "**/ifc.spec.ts",
    "**/document.spec.ts",
  ],
  workers: 1,
  timeout: 120000,
  expect: { timeout: 60000 },
  outputDir: "test-results/drawing",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:15173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 15173",
    url: "http://127.0.0.1:15173/tests/engineering-viewers.html",
    reuseExistingServer: false,
  },
});

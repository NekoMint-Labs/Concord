import { defineConfig, devices } from "@playwright/test";

// The spec owns its isolated DBOS process, port and data directory, including
// actual stop/restart. Never attach to a developer server or use demo reset.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/real-project.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  outputDir: "../.verification-work/real-project/results",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "../.verification-work/real-project/report",
      },
    ],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "real-project-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: process.env.CI
          ? { args: ["--use-gl=angle", "--use-angle=swiftshader"] }
          : {},
      },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

const port = process.env.CCA_E2E_PORT ?? "18000";
const baseURL = `http://127.0.0.1:${port}`;
const runtime = process.env.CCA_E2E_RUNTIME ?? "dbos";
const python = process.env.CCA_E2E_PYTHON ?? "python";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/ifc.spec.ts", "**/real-project.spec.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // GPU-less CI still executes real WebGL using ANGLE/SwiftShader. This is
  // scoped to trusted local fixtures, never a production-browser launch policy.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.CI
          ? { args: ["--use-gl=angle", "--use-angle=swiftshader"] }
          : {},
      },
    },
  ],
  webServer: {
    command: `"${python}" ../scripts/e2e_backend.py`,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { CCA_E2E_PORT: port, CCA_E2E_RUNTIME: runtime },
  },
});

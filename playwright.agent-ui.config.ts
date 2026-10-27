import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/agent-ui-browser",
  timeout: 30_000,
  retries: 0,
  outputDir: "test-results/agent-ui",
  use: { baseURL: "http://127.0.0.1:4184", screenshot: "only-on-failure",
    trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node node_modules/vite/bin/vite.js --config vite.agent-ui.config.ts",
    url: "http://127.0.0.1:4184/agent-ui-qa.html",
    reuseExistingServer: false, timeout: 60_000 },
});

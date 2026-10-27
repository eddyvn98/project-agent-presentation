import { defineConfig, devices } from "@playwright/test";

// Browser-engine compatibility smoke checks use the same real account components and fake APIs.
export default defineConfig({
  testDir: "tests/agent-ui-browser",
  testMatch: /cross-browser\.spec\.mjs/,
  timeout: 35_000,
  retries: 0,
  outputDir: "test-results/cross-browser",
  use: { baseURL: "http://127.0.0.1:4184", trace: "retain-on-failure",
    screenshot: "only-on-failure" },
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: { command: "node node_modules/vite/bin/vite.js --config vite.agent-ui.config.ts",
    url: "http://127.0.0.1:4184/agent-ui-qa.html",
    reuseExistingServer: false, timeout: 60_000 },
});

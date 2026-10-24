import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: { baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4183", screenshot: "only-on-failure", launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {} },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4183", url: "http://127.0.0.1:4183", reuseExistingServer: true },
});

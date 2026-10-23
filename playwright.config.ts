import { defineConfig, devices } from "@playwright/test";

const requestedPort = Number(process.env.PLAYWRIGHT_PORT ?? "4173");
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1024 and 65535.");
}
const baseURL = `http://127.0.0.1:${requestedPort}`;
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run demo -- --port ${requestedPort} --strictPort`,
    url: baseURL,
    // Never accidentally run tests against another app already occupying this port.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const baseURL = process.env.P7_HOST_BASE_URL;
const storageState = process.env.P7_OWNER_STORAGE_STATE;
if (!baseURL) throw new Error("P7_HOST_BASE_URL is required for host QA");
if (!storageState || !existsSync(storageState))
  throw new Error("P7_OWNER_STORAGE_STATE must point to an existing local QA login file");
const address = new URL(baseURL);
if (!["http:", "https:"].includes(address.protocol) || address.username || address.password ||
    address.pathname !== "/" || address.search || address.hash)
  throw new Error("P7_HOST_BASE_URL must be a bare http(s) origin with no credentials");
if (!["localhost", "127.0.0.1", "[::1]"].includes(address.hostname) &&
    process.env.P7_ALLOW_REMOTE_HOST !== "1")
  throw new Error("Remote host tests require explicit P7_ALLOW_REMOTE_HOST=1");

const evidence = process.env.P7_CAPTURE_EVIDENCE === "1";
export default defineConfig({
  testDir: "./tests/host-browser",
  timeout: 120_000,
  expect: { timeout: 12_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: "test-results/p7-host-report.json" }]],
  use: {
    baseURL: address.origin,
    storageState,
    trace: evidence ? "retain-on-failure" : "off",
    screenshot: evidence ? "only-on-failure" : "off",
    video: "off",
    serviceWorkers: "block",
  },
  projects: [
    { name: "host-api", testMatch: /.*\.api\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-ui", testMatch: /.*\.ui\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-ui", testMatch: /.*\.ui\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
});

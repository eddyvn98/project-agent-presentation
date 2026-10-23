import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
export { chromium };
export type { Browser };
export const browserExecutable = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
export const launchChromium = () => chromium.launch({ headless: true, ...(existsSync(browserExecutable) ? { executablePath: browserExecutable } : {}) });

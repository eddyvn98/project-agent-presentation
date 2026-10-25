import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
if (process.env.PROJECT_AGENT_RUNTIME !== "sandbox" || process.env.PROJECT_AGENT_BROWSER_AGENT !== "1")
  throw new Error("Isolated QA host requires PROJECT_AGENT_RUNTIME=sandbox and PROJECT_AGENT_BROWSER_AGENT=1");
const executable = process.env.PROJECT_AGENT_CHROMIUM_EXECUTABLE?.trim() || chromium.executablePath();
if (!existsSync(executable)) throw new Error("Host Chromium executable missing; install Playwright Chromium or configure PROJECT_AGENT_CHROMIUM_EXECUTABLE");
const browser = await chromium.launch({ executablePath: executable, headless: true, timeout: 30000 });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.setContent("<main><h1>P7 local in-memory browser preflight</h1></main>");
    const jpg = await page.screenshot({ type: "jpeg", quality: 50 });
    if (jpg[0] !== 255 || jpg[1] !== 216) throw new Error("Chromium did not produce JPEG bytes");
    console.log(JSON.stringify({ chromium: "OK", screenshot: "JPEG", bytes: jpg.byteLength,
      browserConnected: browser.isConnected() }, null, 2));
  } finally { await context.close(); }
} finally { await browser.close(); }

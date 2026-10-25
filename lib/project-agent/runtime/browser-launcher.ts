import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { verifyBrowserExecutableDigest } from "./browser-binary-integrity";
export { chromium };
export type { Browser };
/** Browser is launched by the host process, not inside a Docker sandbox by default. */
export const browserExecutable = process.env.PROJECT_AGENT_CHROMIUM_EXECUTABLE?.trim() || chromium.executablePath();
export async function launchChromium(): Promise<Browser> {
  if (process.env.PROJECT_AGENT_BROWSER_AGENT !== "1") throw new Error("Enable PROJECT_AGENT_BROWSER_AGENT=1 on an isolated QA host");
  if (!existsSync(browserExecutable)) throw new Error("Host Chromium unavailable; install Playwright Chromium or set PROJECT_AGENT_CHROMIUM_EXECUTABLE");
  await verifyBrowserExecutableDigest(browserExecutable, process.env.PROJECT_AGENT_CHROMIUM_SHA256);
  return chromium.launch({ headless: true, executablePath: browserExecutable, timeout: 30_000 });
}

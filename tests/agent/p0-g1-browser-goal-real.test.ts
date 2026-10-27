import { afterEach, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";
import type { RuntimeInput } from "../../lib/project-agent/runtime/run-agent-types";

const fixtures = vi.hoisted(() => ({ session: vi.fn(), loop: vi.fn(), probe: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: fixtures.session,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/loop-state", () => ({
  browserLoopStatus: fixtures.loop,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/p8-qa-fixture", () => ({
  p8QaBrowserProbe: fixtures.probe,
}));
import { checkG1SyntheticGoal, formatG1Receipt, g1QaPrompt, g1QaActionAllowed } from
  "../../lib/project-agent/runtime/g1-goal-check";

const owner = "qa-owner@project-agent.test", id = "pat_abcdef123456";
let browser: Browser | undefined;
afterEach(async () => { await browser?.close(); browser = undefined;
  vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("P0 model-independent goal receipt with real isolated Chromium DOM", () => {
  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "model cannot claim success until a real browser click changes the target DOM", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("PROJECT_AGENT_G1_QA", "1");
      vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "1");
      vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent('<main data-p7-synthetic="true">' +
        '<button id="add">Increase count</button><output id="qa-output">0</output></main>');
      await page.locator("#add").evaluate(button => button.addEventListener("click", () => {
        const out = document.querySelector("#qa-output")!;
        out.textContent = String(Number(out.textContent) + 1);
      }));
      const input = ({ taskId: id, ownerEmail: owner,
        userPrompt: g1QaPrompt("success") } as RuntimeInput);
      fixtures.session.mockReturnValue({ owner, browser: { isConnected: () => true }, page });
      fixtures.loop.mockReturnValue({ verified: 1, actions: 1 });
      fixtures.probe.mockReturnValue({ connected: true, networkAttempts: 0 });
      expect(g1QaActionAllowed(input, { action: "shell", op: "execute" })).toBe(false);
      expect(g1QaActionAllowed(input, { action: "browser", op: "click" })).toBe(true);
      await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/not independently verified/);
      await page.locator("#add").click();
      const receipt = await checkG1SyntheticGoal(input);
      expect(receipt).toMatchObject({ taskId: id, observed: 1,
        expected: 1, checker: "chromium_dom", pageNetworkAttempts: 0 });
      expect(formatG1Receipt(receipt!)).toContain("G1_VERIFIED_RECEIPT");
      fixtures.session.mockReturnValue({ owner: "other-owner@project-agent.test",
        browser: { isConnected: () => true }, page });
      await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/session unavailable/);
      fixtures.session.mockReturnValue({ owner, browser: { isConnected: () => true }, page });
      fixtures.probe.mockReturnValue({ connected: true, networkAttempts: 1 });
      await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/not independently verified/);
    }, 35000,
  );
});

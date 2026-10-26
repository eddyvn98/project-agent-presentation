import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";

const mock = vi.hoisted(() => ({
  session: vi.fn(), withBrowserOp: vi.fn(), watchStatus: vi.fn(), capture: vi.fn(),
  claim: vi.fn(), begin: vi.fn(), complete: vi.fn(),
}));
vi.mock("@/lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: mock.session, withBrowserOp: mock.withBrowserOp,
}));
vi.mock("@/lib/project-agent/runtime/browser-agent/control", () => ({
  beginBrowserIntervention: mock.begin, completeBrowserIntervention: mock.complete,
  notifyBrowserIntervention: vi.fn(), claimHumanBrowserAction: mock.claim,
}));
vi.mock("@/lib/project-agent/runtime/browser-agent/watch", () => ({
  browserWatchStatus: mock.watchStatus, captureBrowserWatch: mock.capture, setBrowserWatch: vi.fn(),
}));

import { humanBrowserOperation } from "@/lib/project-agent/runtime/browser-agent/manual";

afterEach(() => vi.clearAllMocks());

it("keeps a successful human click successful when navigation destroys the old page context", async () => {
  let evaluation = 0;
  const page = {
    url: () => "https://www.iana.org/",
    viewportSize: () => ({ width: 1000, height: 800 }),
    evaluate: vi.fn(async () => {
      evaluation += 1;
      if (evaluation === 1) return { tag: "A", label: "Domain Names" };
      if (evaluation === 2) throw new Error("Execution context was destroyed, most likely because of a navigation");
      return false;
    }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    mouse: { click: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Page;
  mock.session.mockReturnValue({ page });
  mock.withBrowserOp.mockImplementation(async (_session: unknown, operation: () => Promise<unknown>) => operation());
  mock.watchStatus.mockReturnValue({ watching: true, sequence: 4 });
  mock.claim.mockReturnValue(true);

  const result = await humanBrowserOperation("task-1", "chat-1", {
    op: "click", frame: 4, x: 0.2, y: 0.4,
  });

  expect(result).toMatchObject({ ok: true, paused: false });
  expect(page.waitForLoadState).toHaveBeenCalledWith("domcontentloaded", { timeout: 5_000 });
  expect(mock.capture).toHaveBeenCalledWith("task-1", page, "human_click", { x: 0.2, y: 0.4, kind: "human" });
  expect(mock.complete).toHaveBeenCalledWith("task-1");
});

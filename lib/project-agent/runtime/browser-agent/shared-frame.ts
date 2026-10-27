import { createHash, randomUUID } from "node:crypto";
import type { Page } from "playwright-core";
import { getMongoAiDb } from "@/services/mongodb/client";
import { readProjectControl } from "./project-control-db";
import { projectRecordByKey } from "./project-registry";
import type { BrowserSession } from "./session";
import { sensitiveScreenshotMask } from "./privacy";

type Identity = {
  steelId: string; targetId: string; tabIndex: number;
  viewport: string; urlHash: string; scroll: string;
};
interface FrameRow extends Identity {
  _id: string; owner: string; frameId: string; createdAt: number;
  scopeId: string; revision: number;
}
const collection = async () =>
  (await getMongoAiDb()).collection<FrameRow>("projectAgentBrowserFrameProofs");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function sharedActivePage(session: BrowserSession): Promise<{
  page: Page; tabIndex: number;
} | null> {
  if (!session.persistent || !session.scopeId || !session.steelId || !session.owner) return null;
  const row = await projectRecordByKey(session.scopeId, session.owner);
  if (!row || row.steelId !== session.steelId) return null;
  const pages = session.context.pages().filter(p => !p.isClosed());
  const tabIndex = row.activeTabIndex ?? 0;
  const page = pages[tabIndex];
  return page ? { page, tabIndex } : null;
}
async function identity(session: BrowserSession, page: Page, tabIndex: number): Promise<Identity> {
  const cdp = await session.context.newCDPSession(page);
  let targetId: string;
  try {
    const info = await cdp.send("Target.getTargetInfo");
    targetId = info.targetInfo.targetId;
  } finally { await cdp.detach().catch(() => {}); }
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Browser viewport unavailable");
  const scroll = await page.evaluate(() => [window.scrollX, window.scrollY].join(":"));
  return {
    steelId: session.steelId!, targetId, tabIndex,
    viewport: viewport.width + ":" + viewport.height,
    urlHash: digest(page.url()), scroll,
  };
}
export async function captureSharedFrame(session: BrowserSession, taskId: string,
  owner: string): Promise<{ bytes: Buffer; frameId: string }> {
  const state = await readProjectControl(session.scopeId!);
  if (!state.paused || state.activeTaskId !== taskId)
    throw new Error("Take control before capturing a manual frame");
  const active = await sharedActivePage(session);
  if (!active) throw new Error("Browser tab unavailable");
  const before = await identity(session, active.page, active.tabIndex);
  const bytes = await active.page.screenshot({
    type: "jpeg", quality: 58, timeout: 4_000, animations: "disabled",
    mask: [sensitiveScreenshotMask(active.page)], maskColor: "#64748b",
  });
  if (bytes.byteLength > 750_000) throw new Error("Browser frame too large");
  const after = await sharedActivePage(session);
  if (!after || after.page !== active.page || after.tabIndex !== active.tabIndex ||
      JSON.stringify(await identity(session, after.page, after.tabIndex)) !== JSON.stringify(before))
    throw new Error("Browser moved during frame capture");
  const current = await readProjectControl(session.scopeId!);
  if (!current.paused || current.revision !== state.revision ||
      current.activeTaskId !== taskId) throw new Error("Takeover changed during capture");
  const frameId = randomUUID();
  await (await collection()).updateOne({ _id: taskId }, { $set: {
    ...before, _id: taskId, frameId, owner: owner.trim().toLowerCase(),
    scopeId: session.scopeId!, revision: state.revision, createdAt: Date.now(),
  } }, { upsert: true });
  return { bytes, frameId };
}
export async function assertSharedFrame(session: BrowserSession, taskId: string,
  owner: string, token: string, page: Page): Promise<void> {
  const proof = await (await collection()).findOne({
    _id: taskId, owner: owner.trim().toLowerCase(), frameId: token,
    scopeId: session.scopeId!, createdAt: { $gt: Date.now() - 20_000 },
  });
  if (!proof) throw new Error("Browser frame expired; refresh the preview");
  const state = await readProjectControl(session.scopeId!);
  const active = await sharedActivePage(session);
  if (!state.paused || state.activeTaskId !== taskId || state.revision !== proof.revision ||
      !active || active.page !== page) throw new Error("Browser control or tab changed");
  const now = await identity(session, page, active.tabIndex);
  if (Object.keys(now).some(key => now[key as keyof Identity] !== proof[key as keyof Identity]))
    throw new Error("Browser frame is stale; refresh the preview");
}
export async function clearSharedFrame(taskId: string): Promise<void> {
  await (await collection()).deleteOne({ _id: taskId });
}

import { getMongoAiDb } from "@/services/mongodb/client";
import { PROJECT_AGENT_BOOT_ID } from "../../boot";
import type { BrowserSession } from "./session";
import {
  claimBrowserLease, assertBrowserLease, renewBrowserLease,
  changeBrowserControl, finishBrowserLease, stopBrowserLease,
  type BrowserLeaseClaim,
} from "./g2-lease-core.mjs";

const COLLECTION = "projectAgentBrowserOwnership";
const leases = new WeakMap<BrowserSession, {
  claim: BrowserLeaseClaim; heartbeat: ReturnType<typeof setInterval>;
}>();
/** Explicit development-only opt-in. Never share screenshots, refs or cookies in Mongo. */
export const g2OwnershipEnabled = () =>
  process.env.PROJECT_AGENT_G2_BROWSER_OWNERSHIP === "1" &&
  process.env.G2_ISOLATED_QA === "1" &&
  process.env.PROJECT_AGENT_RUNTIME === "sandbox" &&
  ["development", "test"].includes(process.env.NODE_ENV ?? "");
const scoped = (id: string, owner?: string) =>
  g2OwnershipEnabled() && /^pat_[a-f0-9]{12}$/.test(id) &&
  Boolean(owner && /^[a-z0-9._+-]+@project-agent\.test$/i.test(owner));
async function collection() {
  return (await getMongoAiDb()).collection(COLLECTION);
}
export async function bindG2BrowserOwnership(
  id: string, session: BrowserSession, owner?: string,
): Promise<void> {
  if (!g2OwnershipEnabled()) return;
  if (!scoped(id, owner)) throw new Error("G2 requires synthetic task and owner");
  const claim = await claimBrowserLease(await collection(), id,
    owner!, PROJECT_AGENT_BOOT_ID);
  if (!claim) throw new Error("Browser owned by another worker or needs review");
  const heartbeat = setInterval(() => {
    void collection().then(coll => renewBrowserLease(coll, claim))
      .then(ok => { if (!ok) void session.close(); })
      .catch(() => { void session.close(); }); // Fail closed if Mongo is lost.
  }, 20_000);
  heartbeat.unref?.();
  leases.set(session, { claim, heartbeat });
  const close = session.close.bind(session);
  let closed = false;
  session.close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    leases.delete(session);
    // Close Chromium FIRST even if Mongo is unavailable or slow.
    await close();
    // Old crashed/stopped worker cannot clear a newer worker's lease.
    await collection().then(coll => finishBrowserLease(coll, claim)).catch(() => {});
  };
}
export async function assertG2BrowserOwnership(session: BrowserSession,
  mode: "agent" | "human"): Promise<void> {
  const owned = leases.get(session);
  if (!owned && !g2OwnershipEnabled()) return;
  if (!owned) throw new Error("G2 session has no Mongo browser ownership");
  await assertBrowserLease(await collection(), owned.claim, mode);
}
export async function changeG2HumanControl(
  session: BrowserSession, from: "agent" | "human", to: "human" | "agent",
): Promise<void> {
  const owned = leases.get(session);
  if (!owned && !g2OwnershipEnabled()) return;
  if (!owned) throw new Error("G2 session has no Mongo browser ownership");
  await changeBrowserControl(await collection(), owned.claim, from, to);
}
export async function revokeG2BrowserOwnership(taskId: string,
  owner: string): Promise<void> {
  if (!g2OwnershipEnabled()) return;
  if (!scoped(taskId, owner)) throw new Error("G2 Stop identity denied");
  await stopBrowserLease(await collection(), taskId, owner);
}

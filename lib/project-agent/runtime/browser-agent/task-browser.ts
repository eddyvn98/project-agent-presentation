import { activeBrowserSession, type BrowserSession } from "./session";
import { findProjectBrowser, projectBrowserKey } from "./project-sessions";
import { browserControlState } from "./control";
import { readProjectControl } from "./project-control-db";

/** Authorization is done in the calling task route before this resolver runs. */
export async function taskBrowserControlStatus(taskId: string, projectId?: string,
  owner?: string): Promise<{ paused: boolean; revision: number }> {
  if (!projectId || !owner || process.env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    return browserControlState(taskId);
  const control = await readProjectControl(projectBrowserKey(projectId, owner));
  if (control.activeTaskId !== taskId) return { paused: false, revision: control.revision };
  return { paused: control.paused, revision: control.revision };
}
/** Reattach to existing Steel by Mongo identity; never creates a new Steel session. */
export async function resolveTaskBrowser(taskId: string, projectId: string,
  owner: string): Promise<BrowserSession | null> {
  const expectedOwner = owner.trim().toLowerCase();
  const local = activeBrowserSession(taskId);
  if (local && !local.persistent && local.owner === expectedOwner &&
      local.browser.isConnected() && !local.page.isClosed()) return local;
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1") return null;
  const control = await readProjectControl(projectBrowserKey(projectId, owner));
  if (control.activeTaskId !== taskId) return null;
  const shared = await findProjectBrowser(projectId, owner);
  if (!shared || !shared.persistent || shared.owner !== expectedOwner) return null;
  // Lease can change while connecting to the remote CDP endpoint.
  const after = await readProjectControl(projectBrowserKey(projectId, owner));
  return after.activeTaskId === taskId ? shared : null;
}

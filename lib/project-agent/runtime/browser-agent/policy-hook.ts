import type { RuntimeInput } from "../run-agent-types";
import type { BrowserSession } from "./session";
import { checkBrowserSitePolicy, recordBrowserSecurityAudit } from "../../browser-security-policy";
export async function checkAgentBrowserPolicy(input: RuntimeInput, session: BrowserSession,
  operation: string, destination?: string): Promise<void> {
  const url = destination ?? session.page.url();
  if (url === "about:blank" || !input.ownerEmail) return;
  let hostname = "";
  try { hostname = new URL(url).hostname; } catch { throw new Error("Browser destination is invalid"); }
  try {
    await checkBrowserSitePolicy(input.ownerEmail, url, operation);
    await recordBrowserSecurityAudit({ owner: input.ownerEmail, projectId: input.projectId ?? "",
      taskId: input.taskId ?? "", hostname, action: operation, decision: "allow" });
  } catch (error) {
    await recordBrowserSecurityAudit({ owner: input.ownerEmail, projectId: input.projectId ?? "",
      taskId: input.taskId ?? "", hostname, action: operation, decision: "deny" });
    throw error;
  }
}

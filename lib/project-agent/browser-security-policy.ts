import { createHash, randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
export type BrowserPolicyMode = "inherit" | "read" | "interact" | "deny";
export interface BrowserSitePolicy {
  id: string; owner: string; hostname: string; mode: BrowserPolicyMode; updatedAt: string;
}
interface Stored extends BrowserSitePolicy { _id: string }
const user = (s: string) => s.trim().toLowerCase();
export function policyHost(value: string): string {
  const url = new URL(value.startsWith("https://") ? value : "https://" + value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes("."))
    throw new Error("Policy requires an HTTPS domain without credentials or a custom port");
  return url.hostname.toLowerCase();
}
const id = (owner: string, host: string) =>
  createHash("sha256").update(user(owner) + "\0" + host).digest("hex");
async function collection() {
  const db = await getMongoAiDb();
  return db.collection<Stored>("projectAgentBrowserPolicies");
}
export async function listBrowserPolicies(owner: string): Promise<BrowserSitePolicy[]> {
  const rows = await (await collection()).find({ owner: user(owner) })
    .sort({ updatedAt: -1 }).limit(100).toArray();
  return rows.map(({ _id: _key, ...item }) => item);
}
export async function setBrowserPolicy(owner: string, raw: string, mode: BrowserPolicyMode) {
  if (!["inherit","read","interact","deny"].includes(mode)) throw new Error("Invalid browser access policy");
  const hostname = policyHost(raw), email = user(owner), _id = id(email, hostname);
  if (mode === "inherit") { await (await collection()).deleteOne({ _id, owner: email }); return null; }
  const record: Stored = { _id, id: _id, owner: email, hostname, mode, updatedAt: new Date().toISOString() };
  await (await collection()).updateOne({ _id, owner: email },
    { $set: record }, { upsert: true });
  return record;
}
/** Policy is exact-host only; private website Vault authorization is checked separately. */
export async function checkBrowserSitePolicy(owner: string, raw: string, operation: string) {
  const hostname = policyHost(raw), email = user(owner);
  const rule = await (await collection()).findOne({ _id: id(email, hostname), owner: email });
  const writing = !["open","back","snapshot","screenshot","extract","console","network","wait",
    "tabs","switch_tab","visual_observe","scroll","download","close"].includes(operation);
  if (rule?.mode === "deny" || (rule?.mode === "read" && writing))
    throw new Error("This website action is blocked by your Agent Control Center policy");
  return { hostname, mode: rule?.mode ?? "inherit" };
}
export async function recordBrowserSecurityAudit(input: {
  owner: string; taskId: string; projectId: string; hostname: string; action: string;
  decision: "allow" | "deny" | "approval_required"; label?: string;
}) {
  try {
    const db = await getMongoAiDb();
    const labelDigest = createHash("sha256").update(input.label ?? "").digest("hex").slice(0, 18);
    await db.collection("projectAgentBrowserAudits").insertOne({
      _id: randomUUID(), owner: user(input.owner), taskId: input.taskId,
      projectId: input.projectId, hostname: input.hostname, action: input.action,
      decision: input.decision, labelDigest, at: new Date(),
    });
  } catch { /* Auditing must not create an unapproved browser action. */ }
}

import { randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { listProactiveSignalOwners } from "./proactive-signals";
import { proactiveSuggestions, type AgentProactiveSuggestion } from "./proactive-suggestions";

interface Opportunity {
  _id: string; ownerEmail: string; id: string; suggestion: AgentProactiveSuggestion;
  state: "new" | "dismissed" | "snoozed"; snoozedUntil?: string;
  firstSeenAt: string; updatedAt: string;
}
interface Lease { _id: string; token: string; leaseUntil: string; nextAt: string }
const owner = (email: string) => email.trim().toLowerCase();
async function col() {
  const db = await getMongoAiDb();
  const collection = db.collection<Opportunity>("projectAgentProactiveOpportunities");
  await collection.createIndex({ ownerEmail: 1, state: 1, updatedAt: -1 });
  return collection;
}
const recordId = (ownerEmail: string, id: string) => owner(ownerEmail) + ":" + id;
export async function saveProactiveOpportunities(ownerEmail: string, values: AgentProactiveSuggestion[]) {
  const collection = await col(), now = new Date().toISOString();
  for (const suggestion of values.slice(0, 8)) {
    await collection.updateOne({ _id: recordId(ownerEmail, suggestion.id) }, {
      $set: { updatedAt: now, suggestion },
      $setOnInsert: { ownerEmail: owner(ownerEmail), id: suggestion.id,
        state: "new", firstSeenAt: now },
    }, { upsert: true });
  }
}
export async function listProactiveOpportunities(ownerEmail: string) {
  const now = new Date().toISOString();
  const rows = await (await col()).find({
    ownerEmail: owner(ownerEmail),
    $or: [{ state: "new" }, { state: "snoozed", snoozedUntil: { $lte: now } }],
  }).sort({ updatedAt: -1 }).limit(8).toArray();
  return rows.map(r => r.suggestion);
}
export async function changeProactiveOpportunity(ownerEmail: string, id: string,
  action: "dismiss" | "snooze") {
  if (!/^[a-f0-9]{16}$/.test(id)) throw new Error("Invalid suggestion id");
  const result = await (await col()).updateOne({
    _id: recordId(ownerEmail, id), ownerEmail: owner(ownerEmail),
  }, { $set: { state: action === "dismiss" ? "dismissed" : "snoozed",
    snoozedUntil: action === "snooze" ? new Date(Date.now() + 14 * 86400000).toISOString() : undefined,
    updatedAt: new Date().toISOString() } });
  if (!result.matchedCount) throw new Error("Suggestion not found");
}
export async function discoverProactiveOpportunities(): Promise<{ scanned: number; proposed: number; skipped: boolean }> {
  const db = await getMongoAiDb();
  const leases = db.collection<Lease>("projectAgentProactiveLeases");
  const now = new Date(), token = randomUUID();
  let acquired: Lease | null = null;
  try {
    acquired = await leases.findOneAndUpdate({ _id: "background-discovery",
      $or: [{ leaseUntil: { $lt: now.toISOString() } }, { leaseUntil: { $exists: false } }],
      nextAt: { $lte: now.toISOString() },
    }, { $set: { token, leaseUntil: new Date(now.getTime() + 8 * 60000).toISOString() },
      $setOnInsert: { nextAt: new Date(0).toISOString() } }, {
      upsert: true, returnDocument: "after",
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  if (!acquired || acquired.token !== token) return { scanned: 0, proposed: 0, skipped: true };
  let scanned = 0, proposed = 0;
  try {
    const owners = await listProactiveSignalOwners();
    for (const email of owners) {
      const candidates = await proactiveSuggestions(email);
      await saveProactiveOpportunities(email, candidates);
      scanned++; proposed += candidates.length;
    }
    return { scanned, proposed, skipped: false };
  } finally {
    await leases.updateOne({ _id: "background-discovery", token },
      { $set: { leaseUntil: new Date(0).toISOString(),
        nextAt: new Date(Date.now() + 6 * 3600000).toISOString() } });
  }
}

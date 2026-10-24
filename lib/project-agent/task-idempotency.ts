import { createHash } from "node:crypto";

/** The same owner and operation always resolve to one Mongo task identity. */
export function deterministicAgentTaskId(ownerEmail: string, key: string): string {
  if (!/^(schedule|workflow):[a-zA-Z0-9:._-]{6,190}$/.test(key))
    throw new Error("Invalid task idempotency key");
  const digest = createHash("sha256").update(ownerEmail.trim().toLowerCase())
    .update("\x00").update(key).digest("hex");
  return "pat_" + digest.slice(0, 12);
}

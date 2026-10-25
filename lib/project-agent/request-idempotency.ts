import { createHash } from "node:crypto";
/** A UUID is reusable only for an identical user request in one Project. */
export function requestTaskKey(projectId: string, raw: string | null): string | undefined {
  if (raw === null) return undefined;
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(raw))
    throw new Error("Idempotency-Key must be a UUID");
  return `request:${createHash("sha256").update(projectId).digest("hex").slice(0, 12)}:${raw.toLowerCase()}`;
}
export function fingerprintTaskBody(projectId: string, body: Record<string, unknown>): string {
  const fields = ["prompt", "userPrompt", "conversationId", "retryOfTaskId", "modelSelector", "goal", "inputFiles"];
  const canonical: Record<string, unknown> = { projectId };
  for (const field of fields) if (Object.hasOwn(body, field)) canonical[field] = body[field];
  const json = JSON.stringify(canonical);
  if (Buffer.byteLength(json) > 256 * 1024) throw new Error("Task fingerprint payload is too large");
  return createHash("sha256").update(json).digest("hex");
}

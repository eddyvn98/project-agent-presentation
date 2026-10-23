import { createHash } from "node:crypto";

/** Server-side Hindsight REST transport. Disabled unless the operator opts in. */
const ENABLED = "PROJECT_AGENT_HINDSIGHT_ENABLED";
const URL_KEY = "PROJECT_AGENT_HINDSIGHT_API_URL";
const MAX_RESPONSE_BYTES = 220_000;

export function hindsightConfig(forCleanup = false): { url: URL; key: string } | null {
  if ((!forCleanup && process.env[ENABLED] !== "1") || !process.env[URL_KEY]?.trim()) return null;
  try {
    const url = new URL(process.env[URL_KEY]!.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (local || process.env.PROJECT_AGENT_HINDSIGHT_ALLOW_HTTP === "1"))) return null;
    if (!local && process.env.PROJECT_AGENT_HINDSIGHT_ALLOW_REMOTE !== "1") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return { url, key: process.env.PROJECT_AGENT_HINDSIGHT_API_KEY?.trim() ?? "" };
  } catch { return null; }
}

export function hindsightBankId(projectId: string): string {
  const salt = process.env.PROJECT_AGENT_HINDSIGHT_BANK_SALT ?? "";
  return "pa_project_" + createHash("sha256").update(salt).update("\0").update(projectId).digest("hex").slice(0, 32);
}
export function hindsightDocumentId(taskId: string): string {
  return "task_" + createHash("sha256").update(taskId).digest("hex").slice(0, 32);
}
export function hindsightMemoryTag(): string { return "source:project-agent-task"; }

export class HindsightHttpError extends Error {
  constructor(readonly status: number) { super("Hindsight request failed (" + status + ")"); }
}
export async function hindsightRequest(
  projectId: string, route: string, method: "POST" | "DELETE",
  body?: Record<string, unknown>, timeoutMs = 4_000, signal?: AbortSignal, cleanup = false,
): Promise<unknown> {
  const config = hindsightConfig(cleanup);
  if (!config) throw new Error("Hindsight not enabled/configured");
  const bank = encodeURIComponent(hindsightBankId(projectId));
  const url = new URL(config.url);
  const basePath = config.url.pathname.replace(/\/+$/, "");
  url.pathname = basePath + "/v1/default/banks/" + bank + route;
  const timer = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([timer, signal]) : timer;
  const response = await fetch(url, {
    method, cache: "no-store", signal: combined,
    headers: { ...(config.key ? { Authorization: "Bearer " + config.key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new HindsightHttpError(response.status);
  if (method === "DELETE" || response.status === 204) return null;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error("Hindsight response exceeds limit");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("Hindsight response exceeds limit");
  return text ? JSON.parse(text) as unknown : null;
}

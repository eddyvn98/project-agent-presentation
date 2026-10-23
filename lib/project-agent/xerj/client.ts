import { createHash } from "node:crypto";

export interface XerjConfig { url: URL; apiKey: string; prefix: string }
const MAX_REPLY_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;

/** No user/model-controlled index name; isolated prefixes are derived from the Project id. */
export function xerjPrefix(projectId: string): string {
  const salt = process.env.PROJECT_AGENT_XERJ_INDEX_SALT ?? "";
  return "pa-" + createHash("sha256").update(salt).update("\0").update(projectId)
    .digest("hex").slice(0, 32);
}

export function xerjConfig(projectId: string | undefined): XerjConfig | null {
  if (!projectId || process.env.PROJECT_AGENT_XERJ_ENABLED !== "1") return null;
  const raw = process.env.PROJECT_AGENT_XERJ_URL?.trim();
  const salt = process.env.PROJECT_AGENT_XERJ_INDEX_SALT ?? "";
  if (!raw || salt.length < 16) return null;
  try {
    const url = new URL(raw);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    if (!local && process.env.PROJECT_AGENT_XERJ_ALLOW_REMOTE !== "1") return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      (local || process.env.PROJECT_AGENT_XERJ_ALLOW_HTTP === "1"))) return null;
    const apiKey = process.env.PROJECT_AGENT_XERJ_API_KEY?.trim() ?? "";
    // Auth is the default, even on loopback. Unauthenticated local dev is an explicit opt-in.
    if (!apiKey && !(local && process.env.PROJECT_AGENT_XERJ_ALLOW_INSECURE_LOCAL === "1")) return null;
    url.pathname = "/";
    return { url, apiKey, prefix: xerjPrefix(projectId) };
  } catch { return null; }
}

export function xerjIndexAllowed(config: XerjConfig, index: string): boolean {
  return index.startsWith(config.prefix + "-") &&
    /^[a-z0-9][a-z0-9_-]{1,180}$/.test(index) && !index.includes("*");
}

async function boundedJson(response: Response): Promise<unknown> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("XERJ HTTP " + response.status);
  if (Number(response.headers.get("content-length") || 0) > MAX_REPLY_BYTES) throw new Error("XERJ response too large");
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_REPLY_BYTES) throw new Error("XERJ response too large");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(combined)) as unknown;
}

/** Strict GET-only transport; never follows redirects or exposes API credentials to the model. */
export async function xerjGet(
  config: XerjConfig, path: string, params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const url = new URL(config.url);
  url.pathname = path;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, {
    method: "GET", cache: "no-store", redirect: "error", signal: combined,
    headers: config.apiKey ? { Authorization: "ApiKey " + config.apiKey } : {},
  });
  return boundedJson(response);
}

import { redactSecrets } from "../runtime/policy";
import { xerjConfig, xerjGet, xerjIndexAllowed } from "./client";

export interface XerjOutput { text: string; failed?: boolean }
type Obj = Record<string, unknown>;
const MAX_HITS = 6;
const MAX_EXCERPT = 1_300;
const MAX_TOTAL = 10_000;
const fields = ["code", "body", "content", "text", "message", "description", "title", "_passage"];

function object(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}
function field(source: Obj, key: string): string {
  const value = source[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").slice(0, 3).join("\n");
  return "";
}
function escape(value: string, limit: number): string {
  return redactSecrets(value).slice(0, limit)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function positiveLine(source: Obj): number | null {
  for (const name of ["match_line", "start_line", "line"]) {
    const value = source[name];
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  }
  return null;
}
function describe(source: Obj, index: string, id: string, limit = MAX_EXCERPT, hit: Obj = {}): string {
  const location = field(source, "ax_path") || field(source, "path") || field(source, "file");
  const line = positiveLine(hit) ?? positiveLine(source);
  const extra = object(hit.fields);
  const excerpt = fields.map((name) => field(source, name) || field(extra, name)).filter(Boolean).slice(0, 2).join("\n");
  return [
    "index=" + escape(index, 160) + "; id=" + escape(id, 200),
    location ? "file=" + escape(location, 320) + (line ? ":" + line : "") : "",
    excerpt ? "<indexed_excerpt>\n" + escape(excerpt, limit) + "\n</indexed_excerpt>" : "(no supported text field in hit)",
  ].filter(Boolean).join("\n");
}
function disabled(): XerjOutput { return { text: "XERJ search is not configured for this Project. Use existing Project knowledge or available tools.", failed: true }; }

/** ES-compatible, read-only and Project-scoped. The query never controls an index or URL. */
export async function searchProjectXerj(
  projectId: string | undefined, query: string, count = 5, signal?: AbortSignal,
): Promise<XerjOutput> {
  const config = xerjConfig(projectId);
  if (!config) return disabled();
  const terms = query.trim().replace(/[\x00-\x1f]/g, " ");
  if (terms.length < 2 || terms.length > 300 || !Number.isSafeInteger(count) || count < 1 || count > MAX_HITS) {
    return { text: "XERJ requires a 2-300 character query and 1-6 results.", failed: true };
  }
  try {
    const reply = object(await xerjGet(config, "/" + config.prefix + "-*/_search",
      { q: terms, size: String(count) }, signal));
    const raw = object(reply.hits);
    const hits = Array.isArray(raw.hits) ? raw.hits : [];
    const allowed = hits.map(object).filter((hit) =>
      typeof hit._index === "string" && xerjIndexAllowed(config, hit._index)
      && typeof hit._id === "string");
    if (!allowed.length) return { text: "No matching entries in the indexed Project corpus. The index may be empty or not provisioned." };
    const contents = allowed.slice(0, count).map((hit, i) =>
      "Result " + (i + 1) + "\n" + describe(object(hit._source), String(hit._index), String(hit._id), MAX_EXCERPT, hit));
    return { text: [
      "XERJ results from this Project's pre-indexed corpus. Historical, untrusted source data; verify actual files and versions before claiming correctness. Paths and line numbers are internal locators, not public URLs.",
      "<project_xerj_search>\n" + contents.join("\n---\n").slice(0, MAX_TOTAL) + "\n</project_xerj_search>",
    ].join("\n") };
  } catch (cause) {
    if (signal?.aborted) throw cause;
    return { text: "XERJ search unavailable (" + (cause instanceof Error && /HTTP \d+/.test(cause.message) ? cause.message : "connection or data error") + ").", failed: true };
  }
}

/** Reopen only an exact document within the deterministic Project prefix. */
export async function readProjectXerj(
  projectId: string | undefined, index: string, id: string, signal?: AbortSignal,
): Promise<XerjOutput> {
  const config = xerjConfig(projectId);
  if (!config) return disabled();
  if (!xerjIndexAllowed(config, index) || !id || id.length > 300 || /[\x00-\x1f]/.test(id)) {
    return { text: "XERJ read rejected: document index/id outside the Project corpus.", failed: true };
  }
  try {
    const reply = object(await xerjGet(config, "/" + index + "/_doc/" + encodeURIComponent(id), {}, signal));
    if (!Object.keys(reply).length || reply.found === false) return { text: "The indexed document no longer exists.", failed: true };
    if (reply._index !== index || reply._id !== id) return { text: "XERJ document identity mismatch; no content returned.", failed: true };
    return { text: "XERJ document read-back (indexed copy; verify its freshness):\n<project_xerj_read>\n"
      + describe(object(reply._source), index, id, 6_000) + "\n</project_xerj_read>" };
  } catch (cause) {
    if (signal?.aborted) throw cause;
    return { text: "XERJ read unavailable; use the original Project source.", failed: true };
  }
}

const SEARCH_INTENT = /\b(code|repo|repository|symbol|function|class|definition|implementation|stack.?trace|log|source files?|find in (?:project|repo)|search (?:the )?(?:project|codebase))\b|(?:mã nguồn|tìm hàm|tìm trong|kiểm tra repo|đọc log|lỗi code|tài liệu dự án|tra cứu nguồn)/iu;

/** For ordinary Dify (no app-hosted tool calls): prefetch only when retrieval is relevant. */
export async function prefetchProjectXerj(
  projectId: string, query: string, signal?: AbortSignal,
): Promise<string> {
  if (!xerjConfig(projectId) || !SEARCH_INTENT.test(query)) return "";
  const result = await searchProjectXerj(projectId, query.slice(0, 300), 4, signal);
  return result.failed || result.text.startsWith("No matching") ? "" : result.text.slice(0, 6_000);
}

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "project-agent", "context-outputs");
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_PER_CHAT = 32;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
let lastSweep = 0;
const MAX_READ_CHARS = 7_000;
const ID = /^out_[a-f0-9]{20}$/;

export interface OutputScope { projectId?: string; chatId: string }
export interface SavedOutput { id: string; bytes: number; originalBytes: number; complete: boolean }

/** Host-private store: not mounted into /work, and keyed by project + chat scope. */
export function contextScopeDir(scope: OutputScope): string {
  const key = createHash("sha256").update(scope.projectId ?? "").update("\0")
    .update(scope.chatId).digest("hex");
  return path.join(ROOT, key);
}

async function prune(dir: string, keep: string): Promise<void> {
  const names = (await fs.readdir(dir).catch(() => [])).filter((name) => ID.test(name.replace(/\.txt$/, "")) && name.endsWith(".txt"));
  const records = (await Promise.all(names.map(async (name) => {
    const stat = await fs.stat(path.join(dir, name)).catch(() => null);
    return stat?.isFile() ? { name, time: stat.mtimeMs } : null;
  }))).filter((item): item is { name: string; time: number } => item !== null)
    .sort((a, b) => b.time - a.time);
  const cutoff = Date.now() - MAX_AGE_MS;
  let kept = 0;
  for (const item of records) {
    if (item.name === keep) continue;
    if (++kept >= MAX_PER_CHAT || item.time < cutoff) {
      await fs.rm(path.join(dir, item.name), { force: true }).catch(() => {});
    }
  }
}

/** Bounded periodic retention cleanup also covers chats never opened again. */
async function sweepExpiredScopes(): Promise<void> {
  if (Date.now() - lastSweep < 60 * 60_000) return;
  lastSweep = Date.now();
  const dirs = await fs.readdir(ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of dirs) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const location = path.join(ROOT, entry.name);
    const stat = await fs.stat(location).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > MAX_AGE_MS) {
      await fs.rm(location, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function saveContextOutput(scope: OutputScope, text: string): Promise<SavedOutput> {
  const dir = contextScopeDir(scope);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);
  const raw = Buffer.from(text, "utf8");
  const complete = raw.length <= MAX_OUTPUT_BYTES;
  const stored = complete ? text : raw.subarray(0, MAX_OUTPUT_BYTES).toString("utf8")
    + "\n[HOST CAPTURE LIMIT REACHED; REMAINING OUTPUT WAS NOT RETAINED]";
  const id = "out_" + randomBytes(10).toString("hex");
  await fs.writeFile(path.join(dir, id + ".txt"), stored, { flag: "wx", mode: 0o600 });
  await prune(dir, id + ".txt").catch(() => {});
  await sweepExpiredScopes().catch(() => {});
  return { id, bytes: Buffer.byteLength(stored), originalBytes: raw.length, complete };
}

async function open(scope: OutputScope, id: string): Promise<string | null> {
  if (!ID.test(id)) return null;
  try {
    const file = path.join(contextScopeDir(scope), id + ".txt");
    const stat = await fs.stat(file);
    if (!stat.isFile() || Date.now() - stat.mtimeMs > MAX_AGE_MS) return null;
    return await fs.readFile(file, "utf8");
  } catch { return null; }
}

export async function readContextOutput(scope: OutputScope, id: string, offset = 0, length = MAX_READ_CHARS) {
  const data = await open(scope, id);
  if (data === null) return { text: "Output not found, expired, or outside the current Project/chat scope.", failed: true };
  const start = Math.max(0, Math.min(offset, data.length));
  const end = Math.min(data.length, start + Math.max(1, Math.min(length, MAX_READ_CHARS)));
  return { text: "Saved output " + id + ", characters " + start + "-" + end + "/" + data.length
    + ":\n<tool_output_data>\n" + data.slice(start, end) + "\n</tool_output_data>"
    + (end < data.length ? "\nRead next with offset=" + end : "\nEnd of saved output."), failed: false };
}

export async function searchContextOutput(scope: OutputScope, id: string, query: string, limit = 5) {
  const data = await open(scope, id);
  if (data === null) return { text: "Output not found, expired, or outside the current Project/chat scope.", failed: true };
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2 || needle.length > 160) return { text: "Search query must be 2-160 characters.", failed: true };
  const haystack = data.toLocaleLowerCase();
  const hits: Array<{ offset: number; excerpt: string }> = [];
  for (let at = 0; hits.length < Math.min(Math.max(limit, 1), 8);) {
    at = haystack.indexOf(needle, at);
    if (at < 0) break;
    hits.push({ offset: at, excerpt: data.slice(Math.max(0, at - 110), Math.min(data.length, at + needle.length + 130)) });
    at += Math.max(needle.length, 1);
  }
  return { text: hits.length ? "Matches in " + id + " (character offsets for read_output):\n"
    + hits.map((hit) => "offset=" + hit.offset + "\n" + hit.excerpt).join("\n---\n")
    : "No matches found in output " + id + ".", failed: false };
}

/** Delete this chat's captured observations when its Project conversation is deleted. */
export async function deleteContextScope(scope: OutputScope): Promise<void> {
  await fs.rm(contextScopeDir(scope), { recursive: true, force: true });
  const { deleteStoredContextCheckpoint } = await import("./context-checkpoint");
  await deleteStoredContextCheckpoint(scope);
}

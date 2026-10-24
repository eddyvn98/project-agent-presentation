import fs from "node:fs/promises";
import path from "node:path";
import type { QueueReceipt } from "./durable-mongo-queue";
import { importLegacyQueueReceipt } from "./durable-mongo-queue";

const legacyDir = () => path.resolve(process.env.PROJECT_AGENT_LEGACY_QUEUE_DIR ??
  process.env.PROJECT_AGENT_DURABLE_QUEUE_DIR ??
  (process.env.PROJECT_AGENT_SCHEDULES_DIR
    ? path.join(process.env.PROJECT_AGENT_SCHEDULES_DIR, "_queue")
    : path.join(process.cwd(), "data", "project-agent", "durable-queue")));
/** Opt-in one-way migration, old queued jobs preserved, uncertain running jobs quarantined. */
export async function migrateLegacyTaskQueue(limit = 150) {
  const root = legacyDir(), result = { imported: 0, rejected: 0 };
  const names = await fs.readdir(root).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  for (const name of names.filter(n => /^pat_[0-9a-f]{12}\.json$/.test(n)).slice(0, limit)) {
    const source = path.join(root, name);
    try {
      const text = await fs.readFile(source, "utf8");
      const entry = JSON.parse(text) as QueueReceipt;
      if (entry.taskId + ".json" !== name) throw new Error("Legacy queue task mismatch");
      await importLegacyQueueReceipt(entry);
      await fs.rename(source, source + ".migrated");
      result.imported++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.rejected++;
    }
  }
  return result;
}

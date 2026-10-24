import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ScheduledAgentTask } from "./scheduled-types";
import { importLegacySchedule } from "./scheduled-mongo-store";

const ownerHash = (owner: string) => createHash("sha256")
  .update(owner.trim().toLowerCase()).digest("hex");
const directory = () => path.resolve(process.env.PROJECT_AGENT_LEGACY_SCHEDULES_DIR ??
  (process.env.PROJECT_AGENT_SCHEDULES_DIR ?? path.join(process.cwd(), "data", "project-agent", "schedules")));
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

/** Explicit, opt-in migration. After successful DB insert rename old file to avoid resurrection. */
export async function migrateLegacyScheduleFiles(limit = 200) {
  const root = directory(), result = { imported: 0, skipped: 0 };
  const userDirs = await fs.readdir(root, { withFileTypes: true }).catch(error => {
    if (errorCode(error) === "ENOENT") return [] as import("node:fs").Dirent[];
    throw error;
  });
  for (const folder of userDirs) {
    if (!folder.isDirectory() || !/^[a-f0-9]{64}$/.test(folder.name)) continue;
    const accountPath = path.join(root, folder.name);
    for (const name of await fs.readdir(accountPath)) {
      if (!/^sat_[0-9a-f-]{36}\.json$/.test(name)) continue;
      const source = path.join(accountPath, name);
      try {
        const data = JSON.parse(await fs.readFile(source, "utf8")) as ScheduledAgentTask;
        if (!data.ownerEmail || ownerHash(data.ownerEmail) !== folder.name ||
          data.id + ".json" !== name) throw new Error("Legacy owner mismatch");
        await importLegacySchedule(data);
        await fs.rename(source, source + ".migrated");
        result.imported++;
      } catch (error) {
        if (errorCode(error) !== "ENOENT") result.skipped++;
      }
      if (result.imported + result.skipped >= limit) return result;
    }
  }
  return result;
}

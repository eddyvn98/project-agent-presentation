import { readInsightHistory } from "./insights-store";
import { recordProactiveSignal } from "./proactive-signals";

/** Migrate the earlier local insights journal once, before relying only on Mongo signals. */
export async function migrateProactiveInsightHistory(limit = 5000) {
  const history = (await readInsightHistory()).slice(-limit);
  let imported = 0, skipped = 0;
  for (const task of history) {
    try {
      await recordProactiveSignal(task);
      imported++;
    } catch { skipped++; }
  }
  return { imported, skipped };
}

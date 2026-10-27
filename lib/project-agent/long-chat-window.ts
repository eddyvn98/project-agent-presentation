/** Only mount the most recent loaded responses. Expensive Markdown, charts and
 * Mermaid in earlier turns remain in loaded history without rendering their DOM.
 * Users can reveal older batches without requesting duplicate tasks. */
export const LONG_CHAT_BATCH = 80;
export function longChatWindow<T>(items: readonly T[], maxItems = LONG_CHAT_BATCH): T[] {
  const count = Number.isSafeInteger(maxItems) ? Math.max(1, maxItems) : LONG_CHAT_BATCH;
  return items.slice(-count);
}

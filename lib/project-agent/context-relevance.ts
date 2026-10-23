/** Select bounded relevant Project history without mixing in chats from another access scope. */
const STOP = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "have", "what",
  "please", "about", "your", "would", "could", "các", "cho", "với", "trong",
  "một", "những", "được", "của", "vào", "này", "trên", "tôi", "hãy", "giúp",
]);

export function historyTerms(value: string, max = 80): string[] {
  const words = value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(words.filter((word) => !STOP.has(word)))].slice(0, max);
}

export function rankRelevantHistory<T>(
  candidates: T[],
  query: string,
  textOf: (item: T) => string,
  limit: number,
): T[] {
  const terms = historyTerms(query);
  if (!terms.length) return candidates.slice(0, limit);
  const scored = candidates.map((item, index) => {
    const text = textOf(item).toLowerCase().normalize("NFKC");
    const found = new Set(historyTerms(text.slice(0, 40_000), 2_000));
    const overlap = terms.reduce((sum, term) => sum + (found.has(term) ? (term.length >= 5 ? 2 : 1) : 0), 0);
    return { item, index, overlap };
  });
  const relevant = scored.filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.index - b.index);
  const chosen = relevant.slice(0, limit);
  if (!chosen.length) return candidates.slice(0, limit); // Keep continuity for short follow-ups.
  return chosen.map((item) => item.item);
}

/** Retain the chat identity and its most recent turns, never cut away the source heading. */
export function clipHistoryExcerpt(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const at = value.indexOf("\n");
  const title = at < 0 ? "" : value.slice(0, at + 1);
  const rest = value.slice(at + 1);
  return title + "… [older turns omitted]\n" + rest.slice(-Math.max(0, limit - title.length - 30));
}

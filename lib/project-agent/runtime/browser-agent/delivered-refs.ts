/** Only refs at the start of emitted element lines are actionable. */
export function bindDeliveredBrowserRefs(
  target: Map<string, string>, candidates: ReadonlyMap<string, string>,
  delivered: string, guarded: boolean,
): void {
  if (!guarded) {
    for (const [ref, selector] of candidates) target.set(ref, selector);
    return;
  }
  target.clear();
  for (const line of delivered.split("\n")) {
    const match = /^\[ref=(e\d+)\] (?:\w+)/.exec(line);
    if (!match) continue;
    const selector = candidates.get(match[1]);
    if (selector) target.set(match[1], selector);
  }
}

/** OpenGCUA-inspired observation contract; does not invoke the upstream SDK. */
export function bindDeliveredBrowserRefs(
  target: Map<string, string>, candidates: ReadonlyMap<string, string>,
  delivered: string, guarded: boolean,
): void {
  if (!guarded) {
    for (const [ref, selector] of candidates) target.set(ref, selector);
    return;
  }
  target.clear();
  for (const match of delivered.matchAll(/\[ref=(e\d+)\]/g)) {
    const selector = candidates.get(match[1]);
    if (selector) target.set(match[1], selector);
  }
}

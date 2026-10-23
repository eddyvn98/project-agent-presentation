const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "then", "than", "into", "onto", "any", "all", "are", "was", "were", "have", "has", "had", "you", "your", "its", "not", "but", "can", "will", "when", "before", "after", "instead", "first", "just", "each", "every", "only", "also", "use", "using", "used", "lesson", "always", "never", "which", "while", "rather", "ever", "more", "most", "very", "them", "they", "their", "does", "did", "out", "via", "per", "own", "one", "before", "again", "once"]);

/** Light suffix stemming: enough to equate "reading/reads/read" and "checks/checking/checked", not a full stemmer. */
export function stem(word: string): string {
	let value = word;
	for (const [suffix, min] of [["ies", 3], ["ing", 4], ["ed", 4], ["es", 4], ["s", 4], ["ly", 4]] as const) {
		if (value.length - suffix.length >= min && value.endsWith(suffix)) { value = suffix === "ies" ? `${value.slice(0, -3)}y` : value.slice(0, -suffix.length); break; }
	}
	return value.length > 4 && value.endsWith("e") ? value.slice(0, -1) : value;
}

export function stems(text: string): Set<string> {
	const found = text.toLowerCase().replace(/^lesson:\s*/, "").match(/[\p{L}\p{N}]{3,}/gu) ?? [];
	return new Set(found.filter((word) => !STOP.has(word)).map(stem).filter((word) => word.length >= 3 && !STOP.has(word)));
}

/** Jaccard similarity on normalised stems (stop words removed). */
export function stemSimilarity(a: string, b: string): number {
	const left = stems(a); const right = stems(b);
	if (!left.size || !right.size) return 0;
	let shared = 0;
	for (const word of left) if (right.has(word)) shared += 1;
	return shared / (left.size + right.size - shared);
}

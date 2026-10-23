/** Parses a single `Range: bytes=...` header against a known size. null: no usable range (serve the whole file); "invalid": answer 416. */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
	const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
	if (!match || size <= 0) return null;
	const [, first, last] = match;
	if (!first && !last) return null;
	let start: number, end: number;
	if (!first) { start = Math.max(0, size - Number(last)); end = size - 1; }
	else { start = Number(first); end = last ? Math.min(Number(last), size - 1) : size - 1; }
	return start >= size || start > end ? "invalid" : { start, end };
}

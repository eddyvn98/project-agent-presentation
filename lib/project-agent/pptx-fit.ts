const EMU_PER_PT = 12700;

/**
 * Estimates whether any positioned text box on a slide needs more height than it has, from its width, font sizes and
 * text length. `measured` is false when no text box carries its own geometry (placeholders inheriting from the layout).
 */
export function slideTextFit(xml: string): { measured: boolean; overflow: boolean } {
	let measured = false, overflow = false;
	for (const [shape] of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
		const ext = shape.match(/<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
		const body = shape.match(/<p:txBody>[\s\S]*<\/p:txBody>/)?.[0];
		if (!ext || !body || !/<a:t>[^<]*\S[^<]*<\/a:t>/.test(body)) continue;
		measured = true;
		if (/<a:normAutofit\b/.test(body)) continue;
		const width = Number(ext[1]) / EMU_PER_PT - 14, height = Number(ext[2]) / EMU_PER_PT;
		let needed = 0;
		for (const [paragraph] of body.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*\/>/g)) {
			const text = [...paragraph.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1]).join("");
			const size = Number(paragraph.match(/\bsz="(\d+)"/)?.[1] ?? 1800) / 100;
			const perLine = Math.max(4, Math.floor(width / (size * 0.5)));
			needed += Math.max(1, Math.ceil(text.length / perLine)) * size * 1.2;
		}
		if (needed > height * 1.25 + 6) overflow = true;
	}
	return { measured, overflow };
}

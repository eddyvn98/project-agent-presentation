import JSZip from "jszip";

const unescapeXml = (value: string) => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
export async function reviewPptxStructure(bytes: Uint8Array, prompt = ""): Promise<string[]> {
	const zip = await JSZip.loadAsync(bytes);
	const names = Object.keys(zip.files);
	const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
	const issues: string[] = [];
	const presentation = await zip.file("ppt/presentation.xml")?.async("string") ?? "";
	const slideSize = presentation.match(/<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
	const maxX = Number(slideSize?.[1] ?? 12192000), maxY = Number(slideSize?.[2] ?? 6858000);
	const fontNames = new Set<string>();
	for (const [index, name] of slides.entries()) {
		const xml = await zip.file(name)!.async("string");
		if (/transition/i.test(prompt) && !/<p:transition\b/.test(xml)) issues.push(`slide ${index + 1} is missing a transition`);
		if (/\b(animation|animated|entrance animation|by paragraph)\b/i.test(prompt) && !/<p:timing\b/.test(xml)) issues.push(`slide ${index + 1} is missing requested entrance animation`);
		const relation = names.find((entry) => entry === `ppt/slides/_rels/slide${index + 1}.xml.rels`);
		const rels = relation ? await zip.file(relation)!.async("string") : "";
		if (relation && !/Type="[^"]+\/slideLayout"/.test(rels)) issues.push(`slide ${index + 1} is not linked to a master layout`);
		const imageRels = new Map([...rels.matchAll(/<Relationship\b(?=[^>]*Type="[^"]+\/image")(?=[^>]*Id="([^"]+)")(?=[^>]*Target="([^"]+)")[^>]*\/>/g)].map((match) => [match[1], match[2]]));
		for (const pic of xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
			const id = pic[0].match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1], target = imageRels.get(id ?? ""), extent = pic[0].match(/<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
			if (!target || !extent) continue;
			const media = await zip.file(`ppt/${target.replace(/^\.\.\//, "")}`)?.async("uint8array");
			if (!media || media[0] !== 0x89 || media[1] !== 0x50 || media.length < 24) continue;
			const pxW = media[16] * 0x1000000 + media[17] * 0x10000 + media[18] * 0x100 + media[19], pxH = media[20] * 0x1000000 + media[21] * 0x10000 + media[22] * 0x100 + media[23];
			const dpi = Math.min(pxW * 914400 / Number(extent[1]), pxH * 914400 / Number(extent[2]));
			if (dpi < 150) issues.push(`slide ${index + 1} has an image below 150 dpi at its placed size`);
		}
		const boxes: Array<{ x: number; y: number; r: number; b: number; text: string }> = [];
		for (const shape of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
			const value = shape[0], off = value.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/), ext = value.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
			if (!off || !ext) continue;
			const x = Number(off[1]), y = Number(off[2]), w = Number(ext[1]), h = Number(ext[2]);
			if (x < 0 || y < 0 || x + w > maxX + 20000 || y + h > maxY + 20000) issues.push(`slide ${index + 1} has a shape outside the slide bounds`);
			const text = [...value.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => unescapeXml(match[1])).join(" ").trim();
			if (text) boxes.push({ x, y, r: x + w, b: y + h, text });
			for (const match of value.matchAll(/<a:latin\b[^>]*typeface="([^"]+)"/g)) fontNames.add(match[1]);
		}
		for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i], b = boxes[j], width = Math.min(a.r, b.r) - Math.max(a.x, b.x), height = Math.min(a.b, b.b) - Math.max(a.y, b.y);
			if (width > 15000 && height > 15000) issues.push(`slide ${index + 1} has overlapping text boxes`);
		}
	}
	if (fontNames.size > 2) issues.push(`deck uses ${fontNames.size} font families (maximum 2)`);
	return [...new Set(issues)];
}

export async function reviewXlsxStructure(bytes: Uint8Array, prompt = ""): Promise<string[]> {
	const zip = await JSZip.loadAsync(bytes), names = Object.keys(zip.files);
	const issues: string[] = [];
	const chartCount = names.filter((name) => /^xl\/charts\/chart\d+\.xml$/.test(name)).length;
	if (/\b(chart|graph)\b/i.test(prompt) && chartCount === 0) issues.push("request asked for a chart but workbook has no native chart");
	let formulas = 0, hardTotals = 0;
	const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string") ?? "";
	const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, value]) => [...value.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, text]) => unescapeXml(text)).join(""));
	for (const name of names.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry))) {
		const xml = await zip.file(name)!.async("string");
		formulas += (xml.match(/<f(?:\s|>)/g) ?? []).length;
		for (const [row] of xml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
			const hasTotalLabel = [...row.matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)].some(([, cell]) => {
				const sharedIndex = /\bt="s"/.test(cell) ? cell.match(/<v>(\d+)<\/v>/)?.[1] : undefined;
				const label = sharedIndex === undefined ? cell.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "" : shared[Number(sharedIndex)] ?? "";
				return /total|sum|subtotal/i.test(label);
			});
			if (hasTotalLabel && /<c\b[^>]*>(?![\s\S]*?<f\b)[\s\S]*?<v>-?\d+(?:\.\d+)?<\/v>[\s\S]*?<\/c>/.test(row)) hardTotals++;
		}
	}
	if (formulas === 0 && /\b(total|sum|subtotal|formula|calculation)\b/i.test(prompt)) issues.push("request expects calculated totals but workbook has no formulas");
	if (hardTotals && formulas) issues.push("check totals: workbook contains numeric constants where formulas may be expected");
	return issues;
}

export async function reviewDocxStructure(bytes: Uint8Array, prompt = ""): Promise<string[]> {
	const zip = await JSZip.loadAsync(bytes), xml = await zip.file("word/document.xml")?.async("string") ?? "";
	const issues: string[] = [];
	const levels = [...xml.matchAll(/<w:pStyle\s+w:val="Heading([1-3])"/g)].map((match) => Number(match[1]));
	if (/\bheading|section|report|document\b/i.test(prompt) && !levels.length) issues.push("document has no semantic heading styles");
	for (let index = 1; index < levels.length; index++) if (levels[index] > levels[index - 1] + 1) { issues.push("heading hierarchy skips a level"); break; }
	const heading1 = levels.filter((level) => level === 1).length;
	if (heading1 >= 3 && !/<w:instrText[^>]*>\s*TOC\b/.test(xml)) issues.push("document has 3 or more top-level sections but no table of contents");
	if (/\b(header|footer|page number|page fields?)\b/i.test(prompt)) {
		const names = Object.keys(zip.files);
		if (!names.some((name) => /^word\/header\d+\.xml$/.test(name))) issues.push("document is missing a header");
		if (!names.some((name) => /^word\/footer\d+\.xml$/.test(name))) issues.push("document is missing a footer");
	}
	return issues;
}

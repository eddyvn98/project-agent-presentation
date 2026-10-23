import JSZip from "jszip";

const FIT = 'fitToWidth="1" fitToHeight="0" orientation="landscape"';

/** Edits one worksheet's XML so LibreOffice prints it one page wide instead of cutting wide sheets across pages. */
export function fitSheetXml(xml: string): string {
	let out = xml;
	if (/<pageSetUpPr\b/.test(out)) out = out.replace(/<pageSetUpPr\b[^>]*\/>/, '<pageSetUpPr fitToPage="1"/>');
	else if (/<sheetPr\s*\/>/.test(out)) out = out.replace(/<sheetPr\s*\/>/, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
	else if (/<sheetPr\b[^>]*\/>/.test(out)) out = out.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>');
	else if (/<sheetPr\b/.test(out)) out = out.replace(/<\/sheetPr>/, '<pageSetUpPr fitToPage="1"/></sheetPr>');
	else out = out.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
	if (/<pageSetup\b/.test(out)) return out.replace(/<pageSetup\b([^>]*?)\/>/, (_m, attrs: string) => `<pageSetup${attrs.replace(/\s(?:fitToWidth|fitToHeight|scale|orientation)="[^"]*"/g, "")} ${FIT}/>`);
	const setup = `<pageSetup ${FIT}/>`;
	if (/<pageMargins\b[^>]*\/>/.test(out)) return out.replace(/(<pageMargins\b[^>]*\/>)/, `$1${setup}`);
	const margins = '<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
	const next = out.search(/<(?:headerFooter|rowBreaks|colBreaks|drawing|legacyDrawing|tableParts|extLst)\b|<\/worksheet>/);
	return next < 0 ? out : `${out.slice(0, next)}${margins}${setup}${out.slice(next)}`;
}

/** The workbook with every sheet set to fit the page width, for rendering previews only (the user's file is not changed). */
export async function fitWorkbookToPageWidth(bytes: Buffer): Promise<Buffer> {
	try {
		const zip = await JSZip.loadAsync(bytes);
		const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name));
		for (const name of sheets) zip.file(name, fitSheetXml(await zip.files[name].async("string")));
		return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
	} catch { return bytes; }
}

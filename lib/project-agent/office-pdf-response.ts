import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { convertOfficeDocumentToPdf } from "@/lib/workspace/office-preview-conversion";

const CACHE_LIMIT = 6;
const cache = new Map<string, Buffer>();
export const OFFICE_PDF_PREVIEW_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx"]);

/** Word and PowerPoint files use LibreOffice PDF previews for page-accurate viewing. */
export async function officePdfResponse(bytes: Buffer, name: string): Promise<NextResponse> {
	const key = createHash("sha1").update(bytes).digest("hex");
	let pdf = cache.get(key);
	if (!pdf) {
		const converted = await convertOfficeDocumentToPdf(bytes, name);
		if (converted.status !== "READY") return NextResponse.json({ error: converted.status === "FAILED" ? converted.error.slice(0, 240) : "LibreOffice is unavailable" }, { status: 422 });
		pdf = converted.pdf;
		cache.set(key, pdf);
		if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
	}
	return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

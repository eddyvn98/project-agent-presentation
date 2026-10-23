import fs from "node:fs/promises";
import path from "node:path";
import { detectReferenceCandidate, loadReferences } from "../reference-library";

const OFFICIAL_HOST = /(^|\.)(vanban\.chinhphu\.vn|vbpl\.vn|moc\.gov\.vn|xaydung\.gov\.vn|congbao\.chinhphu\.vn|iccsafe\.org|nfpa\.org|eurocodes\.jrc\.ec\.europa\.eu)$/i;

export function buildTaskReferenceProposal(title: string, url: string, excerpt: string, knownCodes: string[]) {
	try { if (!OFFICIAL_HOST.test(new URL(url).hostname)) return null; } catch { return null; }
	const code = detectReferenceCandidate(title, url, knownCodes);
	return code ? { type: "candidate", fromTask: true, code, old: null, proposed: { code, title, sourceUrl: url }, evidence: [{ url, quote: excerpt.slice(0, 700) }] } : null;
}

export async function proposeTaskReference(title: string, url: string, excerpt: string): Promise<void> {
	let host: string;
	try { host = new URL(url).hostname; } catch { return; }
	if (!OFFICIAL_HOST.test(host)) return;
	const entries = await loadReferences();
	const proposal = buildTaskReferenceProposal(title, url, excerpt, entries.map((entry) => entry.code));
	if (!proposal) return;
	const dir = path.join(process.cwd(), "data/project-agent/reference/proposals");
	await fs.mkdir(dir, { recursive: true });
	const date = new Date().toISOString().slice(0, 10);
	const slug = proposal.code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	await fs.writeFile(path.join(dir, `${slug}-${date}.json`), JSON.stringify(proposal, null, 2) + "\n").catch(() => {});
}

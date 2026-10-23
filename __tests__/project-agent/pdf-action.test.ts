import http from "node:http";
import { createHmac } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePdfAction, runPdfAction } from "@/lib/project-agent/runtime/pdf-action";
import { parseRuntimeAction } from "@/lib/project-agent/runtime/actions";
import { workspaceDir } from "@/lib/project-agent/runtime/sandbox";

const SECRET = "0123456789abcdef0123456789abcdef";
const CHAT = "pdf-action-test-chat";
const calls: string[] = [];
let server: http.Server;

function verified(req: http.IncomingMessage): boolean {
	const token = String(req.headers["x-tpdf-agent-web-identity"] ?? "");
	const [payload, signature] = token.split(".");
	if (!payload || signature !== createHmac("sha256", SECRET).update(payload).digest("base64url")) return false;
	const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
	return claims.method === req.method && claims.path === (req.url ?? "").split("?")[0] && claims.aud === "tpdf" && claims.exp - claims.iat <= 60 && claims.projectId === "proj1";
}

beforeAll(async () => {
	process.env.PROJECT_AGENT_PDF_ENGINE = "tpdf";
	server = http.createServer((req, res) => {
		const url = req.url ?? "";
		calls.push(`${req.method} ${url}`);
		if (!verified(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "bad identity" })); return; }
		const send = (body: unknown, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
		req.resume();
		req.on("end", () => {
			if (req.method === "POST" && url.startsWith("/api/tpdf/agent/v1/documents?")) return send({ document: { id: "doc-1" } }, 201);
			if (url.startsWith("/api/tpdf/agent/v1/documents/doc-1/text")) return send({ pageCount: 2, pages: [{ page: 2, text: "Fire escape width 1.2 m" }] });
			if (url.endsWith("/index")) return send({ indexed: true });
			if (url.endsWith("/search")) return send({ results: [{ page: 2, snippet: "Fire escape width 1.2 m", score: 2.7 }], pageCount: 2, indexedPages: 2 });
			if (url.endsWith("/jobs") && req.method === "POST") return send({ jobId: "job-1", status: "queued" }, 202);
			if (url.endsWith("/jobs/job-1")) return send({ status: "done" });
			if (url.endsWith("/jobs/job-1/result")) return send({ result: { documentId: "doc-2", differences: [{ page: 2, changedPercent: 0.5, status: "modified", region: { x: 10, y: 20, width: 5, height: 5 } }] } });
			if (url.endsWith("/documents/doc-2/file")) { res.setHeader("content-type", "application/pdf"); res.end("%PDF-1.4 highlighted"); return; }
			send({ error: "not found" }, 404);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	process.env.TPDF_AGENT_WEB_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	process.env.TPDF_AGENT_WEB_BRIDGE_SECRET = SECRET;
	await mkdir(path.join(workspaceDir(CHAT), "inputs"), { recursive: true });
	await writeFile(path.join(workspaceDir(CHAT), "inputs", "a.pdf"), "%PDF-1.4 a");
	await writeFile(path.join(workspaceDir(CHAT), "inputs", "b.pdf"), "%PDF-1.4 b");
});
afterAll(async () => { server.close(); await rm(workspaceDir(CHAT), { recursive: true, force: true }); delete process.env.TPDF_AGENT_WEB_BASE_URL; delete process.env.TPDF_AGENT_WEB_BRIDGE_SECRET; });

const identity = { email: "user@company.com", projectId: "proj1" };

describe("pdf action", () => {
	it("parses and validates the action", () => {
		expect(parseRuntimeAction('{"action":"pdf","op":"search","path":"inputs/a.pdf","query":"fire escape"}')).toMatchObject({ action: "pdf", op: "search", query: "fire escape" });
		expect(parsePdfAction({ op: "search", path: "x.pdf" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "edit", path: "x.pdf", type: "format-c" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "nope", path: "x.pdf" })).toHaveProperty("error");
	});

	it("reads text and searches with a signed identity that excludes the query string", async () => {
		const text = await runPdfAction(CHAT, identity, parsePdfAction({ op: "text", path: "inputs/a.pdf", page: 2, count: 1 }) as never);
		expect(text.failed).toBeUndefined();
		expect(text.text).toContain("Fire escape width 1.2 m");
		const search = await runPdfAction(CHAT, identity, parsePdfAction({ op: "search", path: "inputs/a.pdf", query: "fire escape" }) as never);
		expect(search.text).toContain("page 2");
		expect(calls.filter((call) => call.startsWith("POST /api/tpdf/agent/v1/documents?")).length).toBe(1);
	});

	it("compares two PDFs and saves the highlighted file in the workspace", async () => {
		const result = await runPdfAction(CHAT, identity, parsePdfAction({ op: "compare", path: "inputs/a.pdf", other: "inputs/b.pdf" }) as never);
		expect(result.failed).toBeUndefined();
		expect(result.text).toContain("page 2: modified");
		expect(await readFile(path.join(workspaceDir(CHAT), "outputs", "a-vs-b.pdf"), "utf8")).toContain("highlighted");
	});

	it("rejects other projects and reviewer edits, and use the sandbox implementation unless the Tpdf engine is selected", async () => {
		const wrong = await runPdfAction(CHAT, { email: "user@company.com", projectId: "other" }, parsePdfAction({ op: "info", path: "inputs/a.pdf" }) as never);
		expect(wrong.failed).toBe(true);
		const reviewer = await runPdfAction(CHAT, identity, parsePdfAction({ op: "edit", path: "inputs/a.pdf", type: "rotate", pages: [1] }) as never, undefined, true);
		expect(reviewer.text).toContain("reviewer");
		const engine = process.env.PROJECT_AGENT_PDF_ENGINE; delete process.env.PROJECT_AGENT_PDF_ENGINE;
		const local = await runPdfAction(CHAT, identity, parsePdfAction({ op: "text", path: "inputs/missing.pdf" }) as never);
		expect(local.failed).toBe(true); expect(local.text).toContain("not found in the workspace");
		process.env.PROJECT_AGENT_PDF_ENGINE = engine;
	});
});

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { canRewrite, rewriteLocation, rewriteRootPaths } from "@/lib/project-agent/live-preview/rewrite";
import { parsePreviewFile, listLivePreviews } from "@/lib/project-agent/live-preview/registry";
import { forwardToSandbox } from "@/lib/project-agent/live-preview/tunnel";
import { isLivePort, signLiveToken, verifyLiveToken } from "@/lib/project-agent/live-preview/token";
import { containerName, workspaceDir } from "@/lib/project-agent/runtime/sandbox";
import { WEBKIT_SCRIPT } from "@/lib/project-agent/runtime/webkit-script";

const BASE = "/api/projects/p1/agent/tasks/t1/live/TOKEN/5173";

describe("live preview links", () => {
	it("a token opens only its own project, task and port, and expires", () => {
		const token = signLiveToken("p1", "t1", 5173, 1_000);
		expect(verifyLiveToken(token, "p1", "t1", 5173, 2_000)).toBe(true);
		expect(verifyLiveToken(token, "p1", "t2", 5173, 2_000)).toBe(false);
		expect(verifyLiveToken(token, "p2", "t1", 5173, 2_000)).toBe(false);
		expect(verifyLiveToken(token, "p1", "t1", 5174, 2_000)).toBe(false);
		expect(verifyLiveToken(token, "p1", "t1", 5173, 1_000 + 5 * 60 * 60_000)).toBe(false);
		expect(verifyLiveToken(`${token}x`, "p1", "t1", 5173, 2_000)).toBe(false);
		expect(verifyLiveToken("garbage", "p1", "t1", 5173)).toBe(false);
	});
	it("only unprivileged ports are allowed", () => {
		for (const port of [80, 1023, 70000, 12.5, Number.NaN]) expect(isLivePort(port)).toBe(false);
		expect(isLivePort(5173)).toBe(true);
	});
	it("rewrites root-absolute paths in html and css but not protocol-relative or relative ones", () => {
		const html = '<link href="/a.css"><script src=\'/b.js\'></script><img src="//cdn.x/y.png"><a href="rel/z">z</a><form action="/go"><style>body{background:url(/bg.png)}</style>';
		const out = rewriteRootPaths(html, BASE);
		expect(out).toContain(`href="${BASE}/a.css"`);
		expect(out).toContain(`src='${BASE}/b.js'`);
		expect(out).toContain(`action="${BASE}/go"`);
		expect(out).toContain(`url(${BASE}/bg.png)`);
		expect(out).toContain('src="//cdn.x/y.png"');
		expect(out).toContain('href="rel/z"');
		expect(rewriteLocation("/login", BASE)).toBe(`${BASE}/login`);
		expect(rewriteLocation("//evil.example/x", BASE)).toBe("//evil.example/x");
		expect(rewriteLocation("https://example.com/", BASE)).toBe("https://example.com/");
		expect(canRewrite("text/html; charset=utf-8", 100)).toBe(true);
		expect(canRewrite("application/javascript", 100)).toBe(false);
		expect(canRewrite("text/html", 6 * 1024 * 1024)).toBe(false);
	});
	it("reads a registered preview and refuses bad ports", () => {
		expect(parsePreviewFile('{"port":5173,"title":"Site","startedAt":"2026-10-22T00:00:00Z"}')).toEqual({ port: 5173, title: "Site", startedAt: "2026-10-22T00:00:00Z" });
		expect(parsePreviewFile('{"port":22}')).toBeNull();
		expect(parsePreviewFile("not json")).toBeNull();
	});
});

const docker = process.env.PROJECT_AGENT_DOCKER_TESTS === "1";
const chatKey = `live-it-${Date.now()}`;
const image = process.env.PROJECT_AGENT_SANDBOX_IMAGE || "project-agent-sandbox:local";

describe.skipIf(!docker)("live preview through a real sandbox container", () => {
	afterAll(() => { try { execFileSync("docker", ["rm", "-f", containerName(chatKey)]); } catch { /* gone */ } fs.rmSync(workspaceDir(chatKey), { recursive: true, force: true }); });

	it("serves a site registered by webkit.py and forwards requests, fixing root paths", async () => {
		const root = workspaceDir(chatKey);
		for (const dir of ["site", ".tools", ".tmp", "outputs", "inputs"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
		fs.writeFileSync(path.join(root, ".tools", "webkit.py"), WEBKIT_SCRIPT);
		fs.writeFileSync(path.join(root, "site", "index.html"), '<!doctype html><title>Live</title><link rel="stylesheet" href="/style.css"><h1>Hello</h1>');
		fs.writeFileSync(path.join(root, "site", "style.css"), "h1{color:#0a5}");
		execFileSync("chmod", ["-R", "777", root]);
		execFileSync("docker", ["run", "-d", "--name", containerName(chatKey), "-v", `${root}:/work`, image, "sleep", "infinity"]);
		execFileSync("docker", ["exec", containerName(chatKey), "python3", "/work/.tools/webkit.py", "serve", "/work/site", "--port", "5173", "--title", "Test site"]);

		expect(await listLivePreviews(chatKey)).toMatchObject([{ port: 5173, title: "Test site" }]);
		const page = await forwardToSandbox(chatKey, 5173, { method: "GET", path: "/", headers: { accept: "text/html" } });
		expect(page.status).toBe(200);
		expect(page.headers.find(([key]) => key.toLowerCase() === "content-type")?.[1]).toContain("text/html");
		expect(await new Response(page.body).text()).toContain("<h1>Hello</h1>");
		const css = await forwardToSandbox(chatKey, 5173, { method: "GET", path: "/style.css", headers: {} });
		expect(await new Response(css.body).text()).toBe("h1{color:#0a5}");
		const missing = await forwardToSandbox(chatKey, 5173, { method: "GET", path: "/nope", headers: {} });
		expect(missing.status).toBe(404);
		const nothing = await forwardToSandbox(chatKey, 6000, { method: "GET", path: "/", headers: {} });
		expect(nothing.status).toBe(502);
		expect(await new Response(nothing.body).text()).toContain("Nothing answers on port 6000");
	}, 120_000);
});

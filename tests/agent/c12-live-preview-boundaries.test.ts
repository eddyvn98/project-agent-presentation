import { describe, expect, it } from "vitest";
import { signLiveToken, verifyLiveToken, isLivePort } from
  "../../lib/project-agent/live-preview/token";
import { canRewrite, rewriteRootPaths, rewriteLocation } from
  "../../lib/project-agent/live-preview/rewrite";
import { requestTaskKey, fingerprintTaskBody } from
  "../../lib/project-agent/request-idempotency";

describe("C12 signed preview links and idempotency scope", () => {
  it("binds HMAC to project, task and port across expiry and tampering", () => {
    const issued = 10_000;
    const token = signLiveToken("project-a", "pat_abcdef123456", 5173, issued);
    expect(verifyLiveToken(token, "project-a", "pat_abcdef123456", 5173, issued)).toBe(true);
    for (const [project, task, port] of [
      ["project-b", "pat_abcdef123456", 5173],
      ["project-a", "pat_111111111111", 5173],
      ["project-a", "pat_abcdef123456", 5174],
    ] as const) expect(verifyLiveToken(token, project, task, port, issued)).toBe(false);
    expect(verifyLiveToken(token, "project-a", "pat_abcdef123456",
      5173, issued + 4 * 60 * 60_000 + 1)).toBe(false);
    expect(verifyLiveToken(token + "x", "project-a", "pat_abcdef123456", 5173, issued)).toBe(false);
    expect(verifyLiveToken("nonsense", "project-a", "pat_abcdef123456", 5173)).toBe(false);
    expect(verifyLiveToken("0.x", "project-a", "pat_abcdef123456", 5173)).toBe(false);
  });
  it("keeps rewrite boundaries explicit and preserves protocol-relative URLs", () => {
    expect(isLivePort(1024)).toBe(true);
    expect(isLivePort(65535)).toBe(true);
    expect(isLivePort(1023)).toBe(false);
    expect(isLivePort(65536)).toBe(false);
    expect(isLivePort(Infinity)).toBe(false);
    expect(canRewrite("TEXT/CSS", 5 * 1024 * 1024)).toBe(true);
    expect(canRewrite("text/html", 5 * 1024 * 1024 + 1)).toBe(false);
    expect(canRewrite("application/javascript", 42)).toBe(false);
    const base = "/safe/live/token/5173";
    const html = '<img SRC="/a.png"><link href="//cdn.example/app.css">' +
      '<form action="/submit"></form><style>@import "/main.css";div{background:url(/a.png)}</style>';
    const out = rewriteRootPaths(html, base);
    expect(out).toContain('SRC="' + base + '/a.png"');
    expect(out).toContain('href="//cdn.example/app.css"');
    expect(out).toContain('action="' + base + '/submit"');
    expect(out).toContain('@import "' + base + '/main.css"');
    expect(out).toContain("url(" + base + "/a.png)");
    expect(rewriteLocation("/login", base)).toBe(base + "/login");
    expect(rewriteLocation("//cdn.example/login", base)).toBe("//cdn.example/login");
  });
  it("canonicalizes UUID request keys yet scopes fingerprints to meaningful fields", () => {
    const key = "01234567-89AB-CDEF-0123-456789ABCDEF";
    expect(requestTaskKey("p1", key)).toBe(requestTaskKey("p1", key.toLowerCase()));
    expect(requestTaskKey("p1", key)).not.toBe(requestTaskKey("p2", key));
    expect(() => requestTaskKey("p1", key + "/../")).toThrow(/UUID/);
    const first = { prompt: "Build", inputFiles: ["file-one"], ignored: "A" };
    expect(fingerprintTaskBody("p1", first)).toBe(fingerprintTaskBody("p1", {
      ignored: "B", inputFiles: ["file-one"], prompt: "Build",
    }));
    expect(fingerprintTaskBody("p1", first)).not.toBe(fingerprintTaskBody("p1", {
      ...first, inputFiles: ["file-two"],
    }));
    expect(fingerprintTaskBody("p1", first)).not.toBe(fingerprintTaskBody("p2", first));
  });
});

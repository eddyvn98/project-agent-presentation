import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBrowserExecutableDigest } from
  "../../lib/project-agent/runtime/browser-binary-integrity";

let folder: string | null = null;
async function testBinary() {
  folder = await mkdtemp(join(tmpdir(), "agent-chromium-integrity-"));
  const file = join(folder, "synthetic-chromium");
  const bytes = Buffer.from("isolated synthetic binary fixture; no executable code");
  await writeFile(file, bytes);
  return { file, sha: createHash("sha256").update(bytes).digest("hex") };
}
afterEach(async () => {
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = null;
});
describe("opt-in Chromium executable integrity", () => {
  it("leaves existing launcher behavior alone when not configured", async () => {
    await expect(verifyBrowserExecutableDigest("/nonexistent/path", undefined)).resolves.toBeUndefined();
    await expect(verifyBrowserExecutableDigest("/nonexistent/path", "")).resolves.toBeUndefined();
  });
  it("accepts exact SHA-256 with casing and optional whitespace", async () => {
    const { file, sha } = await testBinary();
    await expect(verifyBrowserExecutableDigest(file, "  " + sha.toUpperCase() + "  "))
      .resolves.toBeUndefined();
  });
  it("fails closed for invalid digests before opening an executable", async () => {
    await expect(verifyBrowserExecutableDigest("/nonexistent/path", "not-a-sha"))
      .rejects.toThrow("64 hexadecimal");
  });
  it("detects replacement or changes to browser bytes", async () => {
    const { file, sha } = await testBinary();
    await writeFile(file, "tampered synthetic browser");
    await expect(verifyBrowserExecutableDigest(file, sha)).rejects.toThrow("mismatch");
  });
  it("does not download or silently fall back if a pinned file disappears", async () => {
    const { file, sha } = await testBinary();
    await rm(file);
    await expect(verifyBrowserExecutableDigest(file, sha)).rejects.toThrow();
  });
});

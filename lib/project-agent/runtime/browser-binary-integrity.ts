import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * Optional deployment pin for an already-installed Chromium executable.
 * Does not download a browser, certify its publisher or change the browser engine.
 */
export async function verifyBrowserExecutableDigest(executable: string,
  configuredSha256: string | undefined): Promise<void> {
  if (configuredSha256 === undefined || configuredSha256.trim() === "") return;
  const expectedHex = configuredSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHex))
    throw new Error("PROJECT_AGENT_CHROMIUM_SHA256 must be 64 hexadecimal characters");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(executable)) hash.update(chunk);
  const actual = hash.digest();
  const expected = Buffer.from(expectedHex, "hex");
  if (!timingSafeEqual(actual, expected))
    throw new Error("Configured Chromium SHA-256 mismatch; refusing browser launch");
}

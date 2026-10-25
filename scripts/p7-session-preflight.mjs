import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Authenticate synthetic QA identities by asking NextAuth, not by inspecting cookies. */
export function syntheticSessionEmail(value, expectedEmail) {
  const email = typeof value?.user?.email === "string" ? value.user.email.trim().toLowerCase() : "";
  const expected = expectedEmail?.trim().toLowerCase();
  if (!email.endsWith("@project-agent.test") || email === "@project-agent.test")
    throw new Error("NextAuth session is empty or is not a synthetic QA identity");
  if (!expected || !expected.endsWith("@project-agent.test") || email !== expected)
    throw new Error("NextAuth synthetic QA identity does not match the expected account");
  return email;
}
export function isolatedQaOrigin(baseURL, mutation = false, approvedOrigin) {
  const url = new URL(baseURL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Session preflight requires a bare loopback HTTP QA origin");
  if (mutation && approvedOrigin !== url.origin)
    throw new Error("Set P7_QA_MUTATION_ALLOWED_ORIGIN to the exact isolated QA origin");
  return url.origin;
}
export async function verifySyntheticNextAuthState(origin, filename, expected, requester) {
  if (!filename || !existsSync(resolve(filename)))
    throw new Error("Synthetic QA Playwright storage state file is missing");
  if (resolve(filename).replaceAll("\\", "/").split("/").includes("public"))
    throw new Error("Never load QA authentication state from a public directory");
  const client = await requester.newContext({
    baseURL: origin, storageState: resolve(filename),
  });
  try {
    const response = await client.get("/api/auth/session", {
      maxRedirects: 0, timeout: 8000, failOnStatusCode: false,
    });
    if (response.status() !== 200)
      throw new Error("QA NextAuth session endpoint returned HTTP " + response.status());
    const session = await response.json().catch(() => null);
    return syntheticSessionEmail(session, expected);
  } finally { await client.dispose(); }
}
export async function p7SessionPreflight(env = process.env, requester, mutation = false) {
  if (env.P7_ISOLATED_QA !== "1")
    throw new Error("P7_ISOLATED_QA=1 is required; shared/dev host must not run closeout");
  if (!env.P7_HOST_BASE_URL) throw new Error("P7_HOST_BASE_URL is required");
  const origin = isolatedQaOrigin(env.P7_HOST_BASE_URL, mutation,
    env.P7_QA_MUTATION_ALLOWED_ORIGIN);
  if (mutation && (env.P7_ALLOW_QA_STOP !== "1" ||
      env.P7_SYNTHETIC_BROWSER_TASK !== "1" ||
      !env.P7_PROJECT_ID || !env.P7_RUNNING_BROWSER_TASK_ID))
    throw new Error("Closeout needs P7_ALLOW_QA_STOP=1 and an isolated synthetic browser fixture");
  const owner = await verifySyntheticNextAuthState(origin, env.P7_OWNER_STORAGE_STATE,
    env.P7_OWNER_EMAIL, requester);
  const other = await verifySyntheticNextAuthState(origin, env.P7_OTHER_STORAGE_STATE,
    env.P7_OTHER_EMAIL, requester);
  if (owner === other) throw new Error("Synthetic QA owner and nonmember must be distinct");
  return { isolated: true, ownerAuthenticated: true, nonmemberAuthenticated: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { request } = await import("@playwright/test");
    const result = await p7SessionPreflight(process.env, request,
      process.argv.includes("--mutation"));
    console.log(JSON.stringify(result, null, 2)); // Never print cookies, tokens or addresses.
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Synthetic session preflight failed");
    process.exitCode = 1;
  }
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedQaOrigin, verifySyntheticNextAuthState } from "./p7-session-preflight.mjs";

/** Do not generate cookies or bypass NextAuth: check real synthetic sessions. */
export async function p8SessionPreflight(env, requester) {
  if (env.P7_ISOLATED_QA !== "1" || env.P8_QA_ISOLATED_HOST !== "1" ||
      env.P8_QA_ALLOW_CLOSEOUT !== "1")
    throw new Error("P8 closeout requires explicit isolated-host and mutation flags");
  const origin = isolatedQaOrigin(env.P7_HOST_BASE_URL ?? "");
  const url = new URL(origin);
  if (!["3005", "3006"].includes(url.port) || env.P8_QA_ALLOWED_ORIGIN !== origin)
    throw new Error("P8 closeout requires a dedicated localhost 3005/3006 origin");
  if (!["0", "1"].includes(env.P8_QA_EXPECT_REPORT_ONLY))
    throw new Error("Set P8_QA_EXPECT_REPORT_ONLY to 0 or 1 for this host");
  if (!env.P7_PROJECT_ID || !/^[\w-]{4,128}$/.test(env.P7_PROJECT_ID))
    throw new Error("Specify the isolated synthetic P7_PROJECT_ID");
  const owner = await verifySyntheticNextAuthState(origin, env.P7_OWNER_STORAGE_STATE,
    env.P7_OWNER_EMAIL, requester);
  const other = await verifySyntheticNextAuthState(origin, env.P7_NONMEMBER_STORAGE_STATE,
    env.P7_OTHER_EMAIL, requester);
  if (owner === other) throw new Error("Synthetic owner and nonmember must differ");
  return { origin, sessionChecks: 2, isolated: true, externalRequests: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { request } = await import("@playwright/test");
    const status = await p8SessionPreflight(process.env, request);
    console.log(JSON.stringify(status, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "P8 QA preflight failed");
    process.exitCode = 1;
  }
}

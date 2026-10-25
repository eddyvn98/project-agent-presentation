import { request } from "@playwright/test";
import { p8SessionPreflight } from "./p8-session-preflight.mjs";
import { isolatedQaOrigin, verifySyntheticNextAuthState } from "./p7-session-preflight.mjs";

const env = process.env;
async function main() {
  if (env.G2_QA_ALLOW_CLOSEOUT !== "1" || env.G2_ISOLATED_QA !== "1" ||
      env.PROJECT_AGENT_G2_BROWSER_OWNERSHIP !== "1" ||
      env.PROJECT_AGENT_P8_QA_SESSION !== "1" ||
      env.PROJECT_AGENT_P8_LOOP !== "1" ||
      env.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      env.PROJECT_AGENT_BROWSER_AGENT !== "1" ||
      env.PROJECT_AGENT_DURABLE_QUEUE !== "0")
    throw new Error("G2 two-Next closeout needs dedicated QA-only feature flags");
  const a = isolatedQaOrigin(env.P7_HOST_BASE_URL ?? "");
  const b = isolatedQaOrigin(env.G2_QA_OTHER_ORIGIN ?? "");
  const firstUrl = new URL(a), secondUrl = new URL(b);
  if (firstUrl.port !== "3005" || secondUrl.port !== "3006" ||
      firstUrl.hostname !== secondUrl.hostname ||
      env.P8_QA_ALLOWED_ORIGIN !== a)
    throw new Error("G2 requires the same exact loopback hostname on QA ports 3005/3006, with P8_QA_ALLOWED_ORIGIN matching A");
  const first = await p8SessionPreflight(env, request);
  const owner = await verifySyntheticNextAuthState(b,
    env.P7_OWNER_STORAGE_STATE, env.P7_OWNER_EMAIL, request);
  const other = await verifySyntheticNextAuthState(env.G2_QA_OTHER_ORIGIN,
    env.P7_NONMEMBER_STORAGE_STATE, env.P7_OTHER_EMAIL, request);
  if (owner === other) throw new Error("G2 two-host NextAuth identities overlap");
  console.log(JSON.stringify({
    a: first.origin, b,
    syntheticAuthChecks: 4, isolation: true, expectedRealNextProcesses: 2,
    actualDistinctPids: "requires independent host operator evidence",
  }));
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "G2 preflight failed");
  process.exitCode = 1;
});

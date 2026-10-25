import { request } from "@playwright/test";
import { p8SessionPreflight } from "./p8-session-preflight.mjs";

const env = process.env;
const addresses = ["PROJECT_AGENT_DIFY_API_URL", "PROJECT_AGENT_RUNTIME_DIFY_API_URL"];
async function main() {
  if (env.G1_QA_ALLOW_CLOSEOUT !== "1" || env.PROJECT_AGENT_G1_QA !== "1" ||
      env.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      env.PROJECT_AGENT_BROWSER_AGENT !== "1" ||
      env.PROJECT_AGENT_P8_LOOP !== "1" ||
      env.PROJECT_AGENT_P8_LOOP_REPORT_ONLY !== "0" ||
      env.PROJECT_AGENT_P8_QA_SESSION !== "1" ||
      env.PROJECT_AGENT_P7_QA_FIXTURE !== "1" ||
      env.PROJECT_AGENT_DURABLE_QUEUE !== "0" ||
      env.PROJECT_AGENT_AI_TITLES !== "0") throw new Error("G1 QA needs explicit isolated runtime flags");
  for (const name of addresses) {
    const url = new URL(env[name] ?? "");
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "3998" ||
        url.username || url.password) throw new Error(name + " must point to the loopback mock");
  }
  if (env.PROJECT_AGENT_DIFY_API_KEY !== "g1-local-only" ||
      env.PROJECT_AGENT_RUNTIME_DIFY_API_KEY !== "g1-local-only")
    throw new Error("Use only synthetic G1 model tokens");
  const session = await p8SessionPreflight(env, request);
  console.log(JSON.stringify({ ...session, model: "127.0.0.1:3998",
    provider: "synthetic SSE", durableQueue: "disabled for G1" }, null, 2));
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "G1 preflight failed");
  process.exitCode = 1;
});

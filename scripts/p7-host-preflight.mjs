import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const required = ["P7_HOST_BASE_URL", "P7_OWNER_STORAGE_STATE", "P7_PROJECT_ID"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error("P7 host QA missing environment variable(s): " + missing.join(", "));
  process.exit(1);
}
const origin = new URL(process.env.P7_HOST_BASE_URL);
if (!["http:", "https:"].includes(origin.protocol) ||
    origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password)
  throw new Error("P7_HOST_BASE_URL must be a bare HTTP(S) origin");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    process.env.P7_ALLOW_REMOTE_HOST !== "1")
  throw new Error("Non-local P7 host requires P7_ALLOW_REMOTE_HOST=1");
if (!/^[\w-]{4,128}$/.test(process.env.P7_PROJECT_ID))
  throw new Error("P7_PROJECT_ID is invalid");
for (const key of ["P7_OWNER_STORAGE_STATE", "P7_OTHER_STORAGE_STATE"]) {
  if (!process.env[key]) continue;
  const location = resolve(process.env[key]);
  if (!existsSync(location)) throw new Error(key + " file was not found");
  if (location.includes("/public/") || location.includes("\\public\\"))
    throw new Error("Authentication state must not be placed in a public directory");
  const json = JSON.parse(readFileSync(location, "utf8"));
  if (!Array.isArray(json.cookies) || !Array.isArray(json.origins))
    throw new Error(key + " is not a Playwright storageState JSON");
}
if (process.env.P7_ALLOW_BROWSER_CONTROL === "1" && !process.env.P7_RUNNING_BROWSER_TASK_ID)
  throw new Error("Browser control requires P7_RUNNING_BROWSER_TASK_ID");
if (process.env.P7_ALLOW_TASK_CREATION === "1" && process.env.P7_PROJECT_CHAT_PATH === "/")
  throw new Error("Use an isolated QA chat route, not the host root");
console.log("P7 host QA preflight passed (no credentials printed).");
console.log(JSON.stringify({
  remoteHost: !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname),
  ownerAuthLoaded: true,
  otherAuthLoaded: Boolean(process.env.P7_OTHER_STORAGE_STATE),
  createTaskEnabled: process.env.P7_ALLOW_TASK_CREATION === "1",
  browserControlEnabled: process.env.P7_ALLOW_BROWSER_CONTROL === "1",
  chatRouteConfigured: Boolean(process.env.P7_PROJECT_CHAT_PATH),
}, null, 2));

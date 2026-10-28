import { readFileSync, realpathSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { g2HostOrigins } from "./g2-host-origins.mjs";

const REQUIRED = ["P7_ISOLATED_QA", "P8_QA_ISOLATED_HOST",
  "P8_QA_ALLOW_CLOSEOUT", "G2_ISOLATED_QA",
  "PROJECT_AGENT_G2_BROWSER_OWNERSHIP", "G2_QA_CRASH_RECOVERY",
  "G2_QA_ALLOW_CRASH", "PROJECT_AGENT_P8_QA_SESSION",
  "PROJECT_AGENT_P8_LOOP", "PROJECT_AGENT_BROWSER_AGENT",
  "PROJECT_AGENT_P7_QA_FIXTURE"];
export function crashEnvironment(env = process.env) {
  if (process.platform === "win32")
    throw new Error("G2 process-group SIGKILL harness requires POSIX");
  if (env.NODE_ENV === "production" ||
      env.G2_QA_DB_ISOLATION_ATTESTED !== "1")
    throw new Error("G2 crash QA requires nonproduction and explicit QA DB isolation attestation");
  for (const name of REQUIRED)
    if (env[name] !== "1") throw new Error(name + "=1 required for G2 crash QA");
  if (env.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      env.PROJECT_AGENT_DURABLE_QUEUE !== "0" ||
      env.PROJECT_AGENT_P8_LOOP_REPORT_ONLY !== "0")
    throw new Error("G2 crash QA requires sandbox, no model queue and P8 enforcement");
  if (!/^[a-f0-9]{12}$/.test(env.G2_QA_RUN_ID ?? "") ||
      !/^[a-f0-9]{24}$/.test(env.G2_QA_REVIEW_TICKET ?? ""))
    throw new Error("Synthetic G2 run ID and operator review ticket are required");
  if (!env.P7_PROJECT_ID || env.P7_PROJECT_ID !== env.PROJECT_AGENT_P7_QA_PROJECT_ID ||
      !/^[\w-]{4,128}$/.test(env.P7_PROJECT_ID))
    throw new Error("G2 requires one explicitly scoped synthetic Project");
  const { a, b } = g2HostOrigins(env);
  const paths = ["G2_QA_CHECKOUT_A", "G2_QA_CHECKOUT_B"].map(name => {
    if (!env[name]) throw new Error(name + " must point to a private checkout");
    const root = realpathSync(resolve(env[name]));
    const markerPath = join(root, ".g2-crash-qa.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    if (marker.purpose !== "g2-isolated-crash" ||
        marker.runId !== env.G2_QA_RUN_ID ||
        marker.projectId !== env.P7_PROJECT_ID || marker.allowStart !== true)
      throw new Error("Invalid exact run marker: " + name);
    if (!existsSync(join(root, "node_modules", "next", "dist", "bin", "next")))
      throw new Error("Missing locally installed Next CLI in " + name);
    return root;
  });
  if (paths[0] === paths[1] || paths[0].startsWith(paths[1] + "/") ||
      paths[1].startsWith(paths[0] + "/"))
    throw new Error("Use two non-overlapping Next worktrees/build directories");
  const dest = paths.map(root => resolve(root, ".next"));
  if (dest[0] === dest[1] || (existsSync(dest[0]) && existsSync(dest[1]) &&
      realpathSync(dest[0]) === realpathSync(dest[1])))
    throw new Error("Two Next workers cannot share .next");
  return { a, b, paths };
}
async function assertPortFree(port) {
  await new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(port, "localhost", () => server.close(done));
  });
}
/** Exact QA-only worker config, with an opt-in Steel/G2 ownership separation. */
export function crashHostLaunchEnvironment(env, origin, options = {}) {
  if (options.disableG2Ownership !== undefined &&
      typeof options.disableG2Ownership !== "boolean")
    throw new Error("Invalid G2 worker override");
  return {
    ...env, NEXT_TELEMETRY_DISABLED: "1", NEXTAUTH_URL: origin,
    P8_QA_ALLOWED_ORIGIN: origin, PROJECT_AGENT_ALLOW_UPLOADS: "0",
    PROJECT_AGENT_DIFY_API_KEY: "g2-fixture-no-provider",
    PROJECT_AGENT_RUNTIME_DIFY_API_KEY: "g2-fixture-no-provider",
    PROJECT_AGENT_DIFY_API_URL: "http://127.0.0.1:3998",
    PROJECT_AGENT_RUNTIME_DIFY_API_URL: "http://127.0.0.1:3998",
    ...(options.disableG2Ownership ?
      { PROJECT_AGENT_G2_BROWSER_OWNERSHIP: "0" } : {}),
  };
}
export async function startCrashHosts(env = process.env, options = {}) {
  const { a, b, paths } = crashEnvironment(env);
  await assertPortFree(3005);
  await assertPortFree(3006);
  const hosts = [];
  for (const [i, origin] of [a, b].entries()) {
    const root = paths[i];
    const environment = crashHostLaunchEnvironment(env, origin, options);
    const binary = join(root, "node_modules", "next", "dist", "bin", "next");
    const child = spawn(process.execPath,
      [binary, "dev", "-H", "localhost", "-p", String(3005 + i)],
      { cwd: root, env: environment, detached: true,
        stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", chunk => { log = (log + chunk.toString()).slice(-16_000); });
    hosts.push({ child, origin, getLog: () => log, root });
  }
  return hosts;
}
/** Sends signals ONLY to process groups spawned by this harness. */
export async function stopCrashHost(host, signal = "SIGTERM") {
  const { child } = host;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
  await Promise.race([exited, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("G2 spawned host did not exit")), 10_000);
    timer.unref?.();
    exited.then(() => clearTimeout(timer));
  })]);
}
export async function killCrashHost(host) {
  await stopCrashHost(host, "SIGKILL");
}

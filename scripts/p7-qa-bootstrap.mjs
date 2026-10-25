import { existsSync, promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { request } from "@playwright/test";

const command = process.argv[2];
if (!["create", "cleanup"].includes(command)) throw new Error("Use create or cleanup");
const base = process.env.P7_HOST_BASE_URL;
if (!base) throw new Error("P7_HOST_BASE_URL is required");
const url = new URL(base);
if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/" || url.username || url.password || url.search || url.hash)
  throw new Error("Bootstrap requires an isolated loopback HTTP origin");
if (process.env.P7_ISOLATED_QA !== "1") throw new Error("P7_ISOLATED_QA=1 required");
const owner = process.env.P7_OWNER_EMAIL?.toLowerCase() ?? "";
const other = process.env.P7_OTHER_EMAIL?.toLowerCase() ?? "";
if (!owner.endsWith("@project-agent.test") || !other.endsWith("@project-agent.test") || owner === other)
  throw new Error("Two distinct dev-only synthetic identities required");
const state = process.env.P7_OWNER_STORAGE_STATE;
const otherState = process.env.P7_OTHER_STORAGE_STATE;
if (!state || !otherState || !existsSync(state) || !existsSync(otherState))
  throw new Error("Playwright synthetic login states required; no SSO secrets created");
const manifestPath = resolve(process.env.P7_QA_MANIFEST ?? ".p7-auth/p7-manifest.json");
if (manifestPath.includes("/public/")) throw new Error("Manifest may not be in public/");
const origin = url.origin;
const ownerClient = await request.newContext({ baseURL: origin, storageState: state, extraHTTPHeaders: { Origin: origin } });
const otherClient = await request.newContext({ baseURL: origin, storageState: otherState });
async function jsonOk(response, op) {
  if (!response.ok()) throw new Error(`${op} HTTP ${response.status()}`);
  return response.json();
}
async function saveManifest(value) {
  await fs.mkdir(dirname(manifestPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(manifestPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}
try {
  if (command === "create") {
    if (existsSync(manifestPath)) throw new Error("Manifest exists; cleanup before a new QA run");
    const runId = randomUUID().slice(0, 8);
    const project = await jsonOk(await ownerClient.post("/api/projects", { data: {
      name: "P7 QA Synthetic " + runId, description: "Disposable synthetic QA only", memoryMode: "PROJECT_ONLY",
    } }), "create project");
    if (typeof project.id !== "string" || !/^proj_[\w-]+$/.test(project.id))
      throw new Error("Project API returned an invalid id; inspect isolated QA DB");
    const manifest = { version: 1, origin, owner, other, runId, projectId: project.id,
      createdAt: new Date().toISOString(), tasks: [], createdBy: "p7-qa-bootstrap" };
    await saveManifest(manifest); // Preserve provenance even after later bootstrap failure.
    const endpoint = `/api/projects/${encodeURIComponent(project.id)}/agent/p7-qa`;
    for (const kind of ["pdf", "browser"]) {
      const item = await jsonOk(await ownerClient.post(endpoint, { data: { kind } }), `create ${kind}`);
      manifest.tasks.push({ kind, taskId: item.taskId,
        ...(item.fileId ? { fileId: item.fileId } : {}),
        ...(item.clickPoint ? { clickPoint: item.clickPoint } : {}) });
      await saveManifest(manifest);
      if (kind === "browser" && !item.hasFrame) throw new Error("No genuine Chromium Watch frame");
    }
    const denied = await otherClient.get(`/api/projects/${project.id}/agent/tasks`, { maxRedirects: 0 });
    if (![401, 403, 404].includes(denied.status())) throw new Error("Non-member can read owner's task history");
    const browser = manifest.tasks.find(task => task.kind === "browser");
    const pdf = manifest.tasks.find(task => task.kind === "pdf");
    const escape = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
    const values = { P7_PROJECT_ID: project.id, P7_RUNNING_BROWSER_TASK_ID: browser.taskId,
      P7_EXISTING_FILE_TASK_ID: pdf.taskId, P7_EXISTING_FILE_ID: pdf.fileId,
      P7_ALLOW_BROWSER_WATCH: "1", P7_ALLOW_BROWSER_CONTROL: "1",
      P7_SYNTHETIC_BROWSER_TASK: "1", P7_FILE_IS_PDF: "1",
      P7_FIXTURE_BUTTON_X: String(browser.clickPoint?.x ?? ""),
      P7_FIXTURE_BUTTON_Y: String(browser.clickPoint?.y ?? "") };
    const envPath = resolve(dirname(manifestPath), "p7-vars.sh");
    await fs.writeFile(envPath, Object.entries(values).map(([key, value]) =>
      `export ${key}=${escape(value)}`).join("\n") + "\n", { mode: 0o600 });
    console.log(`P7 synthetic bootstrap complete: project=${project.id}; fixtures=${manifest.tasks.length}`);
    console.log(`Source private QA variables: . ${envPath}`);
  } else {
    if (!existsSync(manifestPath)) throw new Error("No manifest; nothing can be deleted");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (manifest.version !== 1 || manifest.createdBy !== "p7-qa-bootstrap" ||
        manifest.origin !== origin || manifest.owner !== owner ||
        !/^proj_[\w-]+$/.test(manifest.projectId))
      throw new Error("Manifest provenance mismatch; refusing cleanup");
    const response = await ownerClient.get("/api/projects", { failOnStatusCode: false });
    if (!response.ok()) throw new Error("Could not verify owned Project");
    const projects = await response.json();
    const candidate = Array.isArray(projects) ? projects.find(project => project.id === manifest.projectId) : null;
    if (!candidate || candidate.name !== `P7 QA Synthetic ${manifest.runId}`)
      throw new Error("Project name/manifest mismatch; refusing deletion");
    const endpoint = `/api/projects/${encodeURIComponent(manifest.projectId)}/agent/p7-qa`;
    for (const item of manifest.tasks) {
      if (!/^pat_[a-f0-9]{12}$/.test(item.taskId)) throw new Error("Invalid task id in manifest");
      const result = await ownerClient.delete(endpoint, { data: { taskId: item.taskId }, failOnStatusCode: false });
      if (!result.ok() && result.status() !== 404)
        throw new Error(`Task cleanup failed: ${item.taskId} HTTP ${result.status()}`);
    }
    const deleted = await ownerClient.delete(`/api/projects?id=${encodeURIComponent(manifest.projectId)}`);
    if (!deleted.ok()) throw new Error(`Project cleanup HTTP ${deleted.status()}`);
    await fs.rm(manifestPath, { force: true });
    await fs.rm(resolve(dirname(manifestPath), "p7-vars.sh"), { force: true });
    console.log(`Removed exactly one synthetic Project and ${manifest.tasks.length} owned tasks`);
  }
} finally { await Promise.all([ownerClient.dispose(), otherClient.dispose()]); }

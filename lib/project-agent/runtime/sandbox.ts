import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { quotaMessage } from "./workspace-quota";
import { hostPath } from "./host-path";

const IMAGE = () => process.env.PROJECT_AGENT_SANDBOX_IMAGE?.trim() || "project-agent-sandbox:local";
const IDLE_MS = 4 * 60_000;
const intEnv = (name: string, fallback: number) => Math.max(1, Number(process.env[name]) || fallback);
const MAX_CONTAINERS = () => intEnv("PROJECT_AGENT_SANDBOX_MAX_CONTAINERS", 24);
const MAX_CONCURRENT_EXEC = () => intEnv("PROJECT_AGENT_SANDBOX_MAX_EXEC", 6);
const OUTPUT_LIMIT = 12_000;
const WORKSPACES_DIR = path.join(process.cwd(), "data", "project-agent", "workspaces");
const idleTimers = new Map<string, NodeJS.Timeout>();
const lastUsed = new Map<string, number>();
const running = new Set<string>();
const waiting: Array<() => void> = [];
let activeExecs = 0;

/** Caps how many commands run at once on the host (memory and CPU are shared); the rest wait their turn in order. */
async function withExecSlot<T>(task: () => Promise<T>): Promise<T> {
	if (activeExecs >= MAX_CONCURRENT_EXEC()) await new Promise<void>((resolve) => waiting.push(resolve));
	else activeExecs += 1;
	try { return await task(); } finally {
		const next = waiting.shift();
		if (next) next(); else activeExecs -= 1;
	}
}

/** Idle containers are cheap to rebuild (the workspace lives on disk), so when the host is full the least recently used one makes room. */
async function makeRoom(keep: string) {
	while (running.size >= MAX_CONTAINERS()) {
		const victim = [...running].filter((name) => name !== keep).sort((a, b) => (lastUsed.get(a) ?? 0) - (lastUsed.get(b) ?? 0))[0];
		if (!victim) return;
		running.delete(victim);
		clearTimeout(idleTimers.get(victim));
		idleTimers.delete(victim);
		await docker(["rm", "-f", victim], 15_000);
	}
}

export interface SandboxResult { output: string; exitCode: number; timedOut: boolean }

const docker = (args: string[], timeoutMs = 60_000) => new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
	execFile("docker", args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
		resolve({ stdout: String(stdout), stderr: String(stderr), code: error ? (typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 1) : 0 });
	});
});

export const containerName = (chatId: string) => `pa-sbx-${createHash("sha256").update(chatId).digest("hex").slice(0, 12)}`;
export const workspaceDir = (chatId: string) => path.join(WORKSPACES_DIR, createHash("sha256").update(chatId).digest("hex").slice(0, 12));

/** Resolves a path the model gave inside the chat workspace; anything that escapes it is rejected. */
export function resolveWorkspacePath(chatId: string, relative: string): string {
	const root = workspaceDir(chatId);
	const target = path.resolve(root, relative.replace(/^\/?work\//, "").replace(/^\/+/, ""));
	if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Path is outside the sandbox workspace");
	return target;
}

const SWEEP_EVERY_MS = 60 * 60_000;
let lastSweep = 0;

/** Deletes workspaces nobody touched for PROJECT_AGENT_WORKSPACE_TTL_DAYS (default 7); inputs are staged again on every task and deliverables are already saved elsewhere. */
async function sweepOldWorkspaces() {
	if (Date.now() - lastSweep < SWEEP_EVERY_MS) return;
	lastSweep = Date.now();
	const cutoff = Date.now() - intEnv("PROJECT_AGENT_WORKSPACE_TTL_DAYS", 7) * 86_400_000;
	for (const entry of await fs.readdir(WORKSPACES_DIR).catch(() => [] as string[])) {
		if (running.has(`pa-sbx-${entry}`)) continue;
		const directory = path.join(WORKSPACES_DIR, entry);
		const stat = await fs.stat(directory).catch(() => null);
		if (stat?.isDirectory() && stat.mtimeMs < cutoff) await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * The 4-minute idle limit is enforced by timers in this process, so a restart (or a dev hot reload) forgets them and leaves
 * containers running. Every use refreshes the workspace folder's modification time, so a container whose own workspace
 * folder has been untouched for well over the idle limit is orphaned. Containers of other checkouts have no folder here and are left alone.
 */
let lastContainerSweep = 0;
async function sweepStaleContainers() {
	if (Date.now() - lastContainerSweep < 2 * 60_000) return;
	lastContainerSweep = Date.now();
	const listed = await docker(["ps", "--filter", "name=pa-sbx-", "--format", "{{.Names}}"], 15_000);
	const stale: string[] = [];
	for (const name of listed.stdout.split("\n").map((line) => line.trim()).filter((line) => /^pa-sbx-[0-9a-f]{12}$/.test(line))) {
		if (running.has(name)) continue;
		const stat = await fs.stat(path.join(WORKSPACES_DIR, name.slice("pa-sbx-".length))).catch(() => null);
		if (stat && Date.now() - stat.mtimeMs > IDLE_MS * 2.5) stale.push(name);
	}
	if (stale.length) await docker(["rm", "-f", ...stale], 30_000);
}

function scheduleStop(name: string) {
	clearTimeout(idleTimers.get(name));
	lastUsed.set(name, Date.now());
	const timer = setTimeout(() => { running.delete(name); void docker(["rm", "-f", name]); idleTimers.delete(name); }, IDLE_MS);
	timer.unref();
	idleTimers.set(name, timer);
}

/** One warm container per chat: started in about a second, reused by every command and every later turn, removed when idle. */
export async function ensureSandbox(chatId: string): Promise<string> {
	const name = containerName(chatId);
	const root = workspaceDir(chatId);
	await fs.mkdir(path.join(root, "inputs"), { recursive: true });
	await fs.mkdir(path.join(root, "outputs"), { recursive: true });
	await fs.mkdir(path.join(root, ".tmp"), { recursive: true });
	await fs.chmod(root, 0o777).catch(() => {});
	for (const sub of ["inputs", "outputs", ".tmp"]) await fs.chmod(path.join(root, sub), 0o777).catch(() => {});
	const state = await docker(["inspect", "-f", "{{.State.Running}}", name], 10_000);
	if (state.code !== 0 || state.stdout.trim() !== "true") {
		await docker(["rm", "-f", name], 15_000);
		running.delete(name);
		await makeRoom(name);
		const network = process.env.PROJECT_AGENT_SANDBOX_NETWORK?.trim();
		const started = await docker([
			"run", "-d", "--name", name, "--cpus", process.env.PROJECT_AGENT_SANDBOX_CPUS?.trim() || "2", "--memory", process.env.PROJECT_AGENT_SANDBOX_MEMORY?.trim() || "3g",
			"--pids-limit", "512", "--security-opt", "no-new-privileges", "--cap-drop", "ALL", ...(network ? ["--network", network] : []),
			"-v", `${hostPath(root)}:/work`, IMAGE(),
		]);
		if (started.code !== 0) throw new Error(`Could not start the sandbox: ${started.stderr.trim().slice(0, 300)}`);
	}
	running.add(name);
	await fs.utimes(root, new Date(), new Date()).catch(() => {});
	void sweepOldWorkspaces();
	void sweepStaleContainers().catch(() => undefined);
	scheduleStop(name);
	return name;
}

function clip(text: string): string {
	if (text.length <= OUTPUT_LIMIT) return text;
	const half = Math.floor(OUTPUT_LIMIT / 2);
	return `${text.slice(0, half)}\n... [${text.length - OUTPUT_LIMIT} characters omitted] ...\n${text.slice(-half)}`;
}

/** readOnly (reviewer sub-agents): a throwaway container with /work mounted read-only and a private /tmp, so the command cannot change the workspace. */
export async function execInSandbox(chatId: string, command: string, timeoutSec = 120, readOnly = false): Promise<SandboxResult> {
	const name = await ensureSandbox(chatId);
	const over = await quotaMessage(workspaceDir(chatId), command);
	if (over) return { output: over, exitCode: 1, timedOut: false };
	const seconds = Math.min(Math.max(Math.round(timeoutSec) || 120, 5), 600);
	const network = process.env.PROJECT_AGENT_SANDBOX_NETWORK?.trim();
	const args = readOnly
		? ["run", "--rm", "--cpus", "1", "--memory", "1g", "--pids-limit", "256", "--security-opt", "no-new-privileges", "--cap-drop", "ALL", ...(network ? ["--network", network] : []), "--tmpfs", "/tmp:size=256m,mode=1777", "-e", "HOME=/tmp", "-v", `${workspaceDir(chatId)}:/work:ro`, "-w", "/work", IMAGE(), "timeout", "-k", "5", String(seconds), "bash", "-c", command]
		: ["exec", "-w", "/work", name, "timeout", "-k", "5", String(seconds), "bash", "-c", command];
	const result = await withExecSlot(() => docker(args, (seconds + 20) * 1000));
	scheduleStop(name);
	return { output: clip(`${result.stdout}${result.stderr ? `${result.stdout ? "\n" : ""}[stderr]\n${result.stderr}` : ""}`.trim()) || "(no output)", exitCode: result.code, timedOut: result.code === 124 || result.code === 137 };
}

export async function stopSandbox(chatId: string): Promise<void> {
	const name = containerName(chatId);
	clearTimeout(idleTimers.get(name));
	idleTimers.delete(name);
	running.delete(name);
	await docker(["rm", "-f", name], 15_000);
}

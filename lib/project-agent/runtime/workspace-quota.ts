import { execFile } from "node:child_process";

const CHECK_EVERY_MS = 30_000;
const checked = new Map<string, { at: number; bytes: number }>();

export function workspaceLimitBytes(): number {
	const megabytes = Number(process.env.PROJECT_AGENT_WORKSPACE_MAX_MB);
	return (Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 2048) * 1024 * 1024;
}

function diskUsage(directory: string): Promise<number> {
	return new Promise((resolve) => execFile("du", ["-sk", directory], { timeout: 15_000 }, (error, stdout) => resolve(error ? 0 : Number(stdout.split(/\s/)[0]) * 1024 || 0)));
}

/** Size of a chat workspace, re-measured at most every 30 s so commands stay fast. */
export async function workspaceBytes(directory: string): Promise<number> {
	const last = checked.get(directory);
	if (last && Date.now() - last.at < CHECK_EVERY_MS) return last.bytes;
	const bytes = await diskUsage(directory);
	checked.set(directory, { at: Date.now(), bytes });
	return bytes;
}

/** Message for the agent when the workspace is over its cap, else null. Cleanup commands (rm, du, ls, find) still run. */
export async function quotaMessage(directory: string, command: string): Promise<string | null> {
	const limit = workspaceLimitBytes();
	const bytes = await workspaceBytes(directory);
	if (bytes <= limit || /^\s*(rm|du|ls|find)\b/.test(command)) return null;
	const mb = (value: number) => Math.round(value / 1024 / 1024);
	return `Workspace is ${mb(bytes)} MB, over the ${mb(limit)} MB limit. Delete large temporary files in /work (rm, then du -sh /work/* to find them) before running anything else.`;
}

import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { containerName } from "../runtime/sandbox";
import { LIVE_FORWARD_SCRIPT } from "./forward-script";

export interface ForwardRequest { method: string; path: string; headers: Record<string, string>; body?: Buffer }
export interface ForwardResponse { status: number; headers: [string, string][]; body: ReadableStream<Uint8Array> }

const FIRST_BYTE_MS = 30_000;
const TOTAL_MS = 120_000;
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

/**
 * Reaches a server inside the task's sandbox through docker exec, which works the same on a laptop and on the server and needs no
 * published ports or container IPs. Each request is one short exec; streaming (server-sent events, websockets) is not supported.
 */
export function forwardToSandbox(chatKey: string, port: number, request: ForwardRequest, signal?: AbortSignal): Promise<ForwardResponse> {
	if ((request.body?.byteLength ?? 0) > MAX_REQUEST_BYTES) return Promise.reject(new Error("Request body is too large for the live preview"));
	return new Promise((resolve, reject) => {
		const child = spawn("docker", ["exec", "-i", containerName(chatKey), "python3", "-c", LIVE_FORWARD_SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
		let stderr = "", settled = false, head = Buffer.alloc(0);
		const kill = () => { try { child.kill("SIGKILL"); } catch { /* already gone */ } };
		const fail = (message: string) => { if (!settled) { settled = true; clearTimeout(first); kill(); reject(new Error(message)); } };
		const first = setTimeout(() => fail("The sandbox server did not answer in time"), FIRST_BYTE_MS);
		const total = setTimeout(kill, TOTAL_MS);
		signal?.addEventListener("abort", kill, { once: true });
		child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-400); });
		child.on("error", (error) => fail(`Could not run docker: ${error.message}`));
		child.on("close", () => clearTimeout(total));
		child.stdin.on("error", () => undefined);
		child.stdin.end(JSON.stringify({ port, method: request.method, path: request.path, headers: request.headers, body: request.body ? request.body.toString("base64") : "" }));
		child.stdout.on("data", function onData(chunk: Buffer) {
			if (settled) return;
			head = Buffer.concat([head, chunk]);
			const newline = head.indexOf(0x0a);
			if (newline < 0) { if (head.byteLength > 64 * 1024) fail("Malformed answer from the sandbox"); return; }
			settled = true; clearTimeout(first); child.stdout.off("data", onData); child.stdout.pause();
			try {
				const meta = JSON.parse(head.subarray(0, newline).toString("utf8")) as { status: number; headers: [string, string][] };
				const rest = head.subarray(newline + 1);
				const stream = Readable.from((async function* () { if (rest.byteLength) yield rest; for await (const part of child.stdout) yield part as Buffer; })());
				const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
				resolve({ status: meta.status, headers: meta.headers, body });
			} catch { kill(); reject(new Error("Malformed answer from the sandbox")); }
		});
		child.on("close", (code) => { if (!settled) { settled = true; clearTimeout(first); reject(new Error(code === 1 && /No such container|is not running/i.test(stderr) ? "The sandbox is not running; ask the agent to start the server again" : `Sandbox request failed (${stderr.trim().slice(0, 160) || `exit ${code}`})`)); } });
	});
}

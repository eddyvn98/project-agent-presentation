import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.PROJECT_AGENT_DATA_DIR?.trim() || path.join(process.cwd(), "data", "project-agent");
const TTL_MS = 4 * 60 * 60_000;
let cachedSecret: string | null = null;

/** The app's own secret when it has one; otherwise a random one kept next to the task data so links survive a restart. */
function secret(): string {
	if (cachedSecret) return cachedSecret;
	const fromEnv = process.env.PROJECT_AGENT_LIVE_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
	if (fromEnv) return (cachedSecret = fromEnv);
	const file = path.join(DATA_DIR, ".live-preview-secret");
	try { cachedSecret = fs.readFileSync(file, "utf8").trim(); } catch { cachedSecret = ""; }
	if (!cachedSecret) {
		cachedSecret = randomBytes(32).toString("hex");
		fs.mkdirSync(DATA_DIR, { recursive: true });
		fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
	}
	return cachedSecret;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** A link that opens one task's sandbox port without cookies, so a sandboxed frame can load it; it expires and cannot reach anything else. */
export function signLiveToken(projectId: string, taskId: string, port: number, now = Date.now()): string {
	const expires = now + TTL_MS;
	const payload = `${projectId}.${taskId}.${port}.${expires}`;
	return `${expires}.${sign(payload)}`;
}

export function verifyLiveToken(token: string, projectId: string, taskId: string, port: number, now = Date.now()): boolean {
	const [expiresText, signature] = token.split(".");
	const expires = Number(expiresText);
	if (!signature || !Number.isFinite(expires) || expires < now) return false;
	const expected = sign(`${projectId}.${taskId}.${port}.${expires}`);
	const a = Buffer.from(signature), b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

export const LIVE_PORT_MIN = 1024;
export const LIVE_PORT_MAX = 65535;
export const isLivePort = (port: number) => Number.isInteger(port) && port >= LIVE_PORT_MIN && port <= LIVE_PORT_MAX;

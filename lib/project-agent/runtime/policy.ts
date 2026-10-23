import type { RuntimeAction } from "./actions";

export interface PolicyContext { readOnly?: boolean; depth?: number }
export interface ActionOutcome { text: string; failed?: boolean }

const UPLOAD_FLAGS = /(?:^|\s)(?:-F|--form|-T|--upload-file|--post-file)\b|(?:^|\s)(?:-d|--data(?:-binary|-raw|-urlencode)?)\s*=?\s*['"]?@/;
const RULES: Array<{ name: string; test: RegExp; reason: string }> = [
	{ name: "wipe-workspace", test: /\brm\s+(?:-\w*[rf]\w*\s+)+(?:['"]?(?:\/|~|\$HOME|\/work\/?|\/work\/inputs\/?|\/work\/outputs\/?|\.\.?|\*)['"]?)(?:\s|$|;|&|\|)/, reason: "deleting the whole workspace, its inputs or outputs" },
	{ name: "remote-code", test: /\b(?:curl|wget)\b[^\n|;]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/, reason: "running a script piped from the internet" },
	{ name: "device-write", test: /\b(?:mkfs\w*|dd\s[^\n]*of=\/dev\/)|>\s*\/dev\/(?:sd|nvme|disk)/, reason: "writing to a disk device" },
	{ name: "fork-bomb", test: /:\s*\(\s*\)\s*\{\s*:\s*\|/, reason: "a fork bomb" },
];

function extraRules(): RegExp[] {
	try { return (JSON.parse(process.env.PROJECT_AGENT_DENY_PATTERNS || "[]") as string[]).map((source) => new RegExp(source, "i")); } catch { return []; }
}

/** Egress of workspace files to a third party: the sandbox has network access over confidential files. */
function uploadsFiles(command: string): boolean {
	if (process.env.PROJECT_AGENT_ALLOW_UPLOADS === "1") return false;
	return command.split(/\n|&&|;|\|\|/).some((part) => /\b(?:curl|wget)\b/.test(part) && UPLOAD_FLAGS.test(part) && /https?:\/\/(?!localhost|127\.|0\.0\.0\.0)/.test(part));
}

/** Pre-action hook: deterministic, independent of the model. Returns the refusal text for the model, or null to allow. */
export function denyReason(context: PolicyContext, action: RuntimeAction): string | null {
	if (context.readOnly) {
		if (action.action === "write_file" || action.action === "generate_image") return "You are a reviewer: you may not write files or generate images. Report what should change instead.";
		if (action.action === "browser" && !["open", "back", "snapshot", "extract", "screenshot", "console", "network", "wait"].includes(action.op)) return "You are a reviewer: browser sessions are read-only. Report what should change instead.";
		if (action.action === "pdf" && !["info", "text", "search", "health"].includes(action.op)) return "You are a reviewer: you may not change PDFs. Report what should change instead.";
	}
	// A wait's check command is a shell command like any other.
	const command = action.action === "shell" ? action.command : action.action === "wait" ? action.until : undefined;
	if (!command) return null;
	for (const rule of RULES) if (rule.test.test(command)) return `Policy: this command was not run (${rule.reason}). Choose a narrower command.`;
	if (uploadsFiles(command)) return "Policy: this command was not run (it uploads files to an external host). Work locally; the user downloads deliverables from /work/outputs.";
	if (extraRules().some((rule) => rule.test(command))) return "Policy: this command was not run (blocked by the deployment's deny rules).";
	return null;
}

const SECRETS = [/\bsk-[A-Za-z0-9_-]{20,}/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g, /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /(\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)\s*=\s*)\S{8,}/g];

/** Post-action hook: secrets seen in tool output never reach the model prompt (and so never reach Dify logs). */
export function redactSecrets(text: string): string {
	return SECRETS.reduce((result, pattern) => result.replace(pattern, (...match) => (typeof match[1] === "string" && match.length > 3 ? `${match[1]}[redacted]` : "[redacted]")), text);
}

/** Runs one action through the pre hook (deny) and the post hook (redact); a denial counts as a failed action and is logged for audit. */
export async function withPolicy(context: PolicyContext & { onStep?(step: { tool: string; detail: string }): void }, action: RuntimeAction, run: () => Promise<ActionOutcome & Record<string, unknown>>): Promise<ActionOutcome & Record<string, unknown>> {
	const reason = denyReason(context, action);
	if (reason) {
		context.onStep?.({ tool: "policy_denied", detail: `${action.action}: ${reason.slice(0, 160)}` });
		return { text: reason, failed: true };
	}
	const outcome = await run();
	return { ...outcome, text: redactSecrets(outcome.text), ...(typeof outcome.rawOutput === "string" ? { rawOutput: redactSecrets(outcome.rawOutput) } : {}) };
}

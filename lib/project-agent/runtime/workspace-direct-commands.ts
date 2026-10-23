import { WORKSPACE_RUNTIME_ACTION_SCHEMAS, type PropertySchema } from "@/lib/workspace-agent/actionSchema";
import { selectWorkspaceCapabilityCategories } from "@/lib/workspace-agent/capabilitySelection";
import { WORKSPACE_READ_ONLY_COMMANDS } from "@/lib/workspace-agent/runtimeSafety";
import { describeWorkspaceCapabilities, isWorkspaceCapabilityCategory, WORKSPACE_CAPABILITY_CATEGORIES } from "@/lib/workspace-command-capabilities";

const MAX_CHARS = 30_000;
const MAX_FIELDS = 24;

function fieldType(schema: PropertySchema | undefined, depth = 0): string {
	if (!schema) return "any";
	if (schema.enum) return schema.enum.slice(0, 14).join("|");
	if (schema.type === "array") return `${fieldType(schema.items, depth + 1)}[]`;
	if (schema.type === "object") {
		const entries = Object.entries(schema.properties ?? {});
		if (!entries.length || depth >= 2) return "object";
		return `{${entries.slice(0, 12).map(([key, value]) => `${key}:${fieldType(value, depth + 1)}`).join(", ")}${entries.length > 12 ? ", ..." : ""}}`;
	}
	return schema.type;
}

/** One command as a compact signature: required fields carry a star; commands without an explicit schema are described by their category guidance. */
export function commandLine(name: string): string {
	const schema = WORKSPACE_RUNTIME_ACTION_SCHEMAS[name];
	const properties = Object.entries(schema?.properties ?? {}).filter(([key]) => key !== "type");
	const read = WORKSPACE_READ_ONLY_COMMANDS.has(name) ? " (read-only)" : "";
	if (!properties.length) return `- ${name}${read}`;
	const fields = properties.slice(0, MAX_FIELDS).map(([key, value]) => `${key}${schema.required.includes(key) ? "*" : ""}:${fieldType(value)}`).join(", ");
	return `- ${name}${read} {${fields}${properties.length > MAX_FIELDS ? ", ..." : ""}}`;
}

// The shared guidance is written for the older Workspace Agent, which receives board summaries and a workspace_read tool; here the agent reads with workspace_view and confirms through the user's message.
const DIRECT_REWRITES: Array<[RegExp, string]> = [
	[/To edit one slide exactly, read it first:[\s\S]*?Single-slide commands:/, "To edit a slide exactly, read it first: workspace_view with blockIds:[<deck id>] shows each slide id, name, complete html and notes. Edit by sending the whole changed html. Single-slide commands:"],
	[/Pass new fields inside params when the tool schema does not expose them directly\. /g, "Fields a command's signature does not list are rejected. "],
	[/Read the table summary for sheet IDs and names first\./g, "Read the table with workspace_view blockIds:[<table id>] for its sheet ids and names first."],
	[/Read tableMeta before editing\./g, "Read the table with workspace_view blockIds:[<table id>] before editing."],
	[/\(from docLines in the read\)/g, "(from the doc line ids that workspace_view lists)"],
	[/Read docs through docText\./g, "Read docs with workspace_view blockIds:[<doc id>]."],
	[/\(the attachment text, or workspace_knowledge_search results\)/g, "(text you read from the attachments or the web)"],
	[/Deleting most of the board returns 409 bulk_delete_needs_confirmation: ask the user, and retry with confirmBulkDelete true only after a clear yes\./g, "Deleting most of the board needs confirmBulkDelete:true on the delete command; workspace_apply runs it only after the user's message clearly asks to delete and names the exact block ids, so ask in your final answer first."],
	[/ask the user to confirm the exact email, role or link change first and pass confirm true\./g, "ask the user in your final answer to confirm the exact email, role or link change; after their reply send the command with confirm:true (workspace_apply checks that their message names the target)."],
	[/in the board summary to report progress/g, "in workspace_view to report progress"],
];

export function directGuidance(category: string, guidance: string): string {
	const rewritten = DIRECT_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), guidance);
	return category === "presentation" ? `Saved frames are listed in the Frames line of workspace_view; target one by its exact frameId or unique frameName, and reorder_frames must list every saved frame id exactly once. ${rewritten}` : rewritten;
}

const menu = () => `Categories: ${WORKSPACE_CAPABILITY_CATEGORIES.join(", ")}. Ask again with {"action":"workspace_commands","categories":[...]} for the ones you need (for example table, presentation, content).`;

/** Command guidance and schemas for the requested categories (or the ones a free-text query points at), so the base prompt stays small. */
export function describeWorkspaceCommands(request: { categories?: string[]; query?: string }): { text: string; failed?: boolean } {
	const requested = (request.categories ?? []).filter(isWorkspaceCapabilityCategory);
	const unknown = (request.categories ?? []).filter((name) => !isWorkspaceCapabilityCategory(name));
	let capabilities = requested.length ? describeWorkspaceCapabilities(requested).map((item) => ({ ...item, guidance: directGuidance(item.category, item.guidance) })) : [];
	if (!capabilities.length && request.query) {
		const selected = selectWorkspaceCapabilityCategories(request.query);
		capabilities = selected.length < WORKSPACE_CAPABILITY_CATEGORIES.length ? describeWorkspaceCapabilities(selected).map((item) => ({ ...item, guidance: directGuidance(item.category, item.guidance) })) : [];
	}
	if (!capabilities.length) return { text: `${unknown.length ? `Unknown categories: ${unknown.join(", ")}. ` : ""}${request.query || requested.length ? "No category matched. " : "Name the categories you need. "}${menu()}`, failed: true };
	const sections = capabilities.map((item) => `## ${item.category}\n${item.guidance}\nCommands (* required, field:type):\n${item.commands.map(commandLine).join("\n")}${item.imageFlow ? `\nImage flow options: ${JSON.stringify(item.imageFlow).slice(0, 3000)}` : ""}${item.videoFlow ? `\nVideo flow options: ${JSON.stringify(item.videoFlow).slice(0, 3000)}` : ""}`);
	const text = `Send these as workspace_apply {"actions":[{"type":"<command>", ...fields}]}. Fields not listed are rejected for commands with a signature; commands without one take the fields their guidance names.\n\n${sections.join("\n\n")}`;
	return { text: text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n[cut: ask for fewer categories at a time]` : text };
}

import { resolveCategoryProvider } from "@/app/config/categoryProviderResolver";
import { listProjectConversationsForUser, listVisibleProjectConversations, type VisibleProjectConversation } from "@/lib/projects/shared-conversations";
import { getProjectAccess, listProjectsSharedWith, listOwnedProjects, projectHasSharing } from "@/lib/capabilities/project-sharing";
import { listChatSessions } from "@/services/mongodb/chatSessions.repo";
import type { ChatSessionListItem } from "@/types/chat-sessions.types";

const CHAT_API = (process.env.PROJECT_AGENT_DIFY_API_BASE ?? "http://localhost/v1");
const MAX_CHATS = 24;
const MAX_TURNS = 6;
const MAX_CONTEXT_CHARS = 20_000;
const MAX_CONCURRENT = 4;
const MAX_DEFAULT_MEMORY_CHATS = 12;
const MAX_DEFAULT_MEMORY_CHARS = 12_000;

interface DifyHistoryMessage {
	query?: string;
	answer?: string;
	created_at?: number;
}

function clean(value: unknown): string {
	return typeof value === "string"
		? value.replace(/^<think>[\s\S]*?(?:<\/think>|$)/, "").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		: "";
}

async function readChat(
	conversationId: string,
	createdByEmail: string,
	apiKey: string,
): Promise<string> {
	const url = new URL(`${CHAT_API}/messages`);
	url.searchParams.set("conversation_id", conversationId);
	url.searchParams.set("user", createdByEmail);
	url.searchParams.set("limit", "100");
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${apiKey}` },
		cache: "no-store",
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) return "";
	const payload = await response.json() as { data?: DifyHistoryMessage[] };
	const messages = (payload.data ?? []).filter((message) => message.query || message.answer)
		.sort((left, right) => (left.created_at ?? 0) - (right.created_at ?? 0))
		.slice(-MAX_TURNS);
	const turns = messages.map((message) => [
		message.query ? `User: ${clean(message.query)}` : "",
		message.answer ? `Assistant: ${clean(message.answer)}` : "",
	].filter(Boolean).join("\n")).filter(Boolean);
	return turns.length ? `### Shared Project chat ${conversationId.slice(-8)}\n${turns.join("\n")}` : "";
}

export async function loadProjectChatContext(projectId: string, callerEmail: string): Promise<string> {
	const links = await listProjectConversationsForUser(projectId, callerEmail);
	if (!links?.length) return "";
	const { apiKey } = resolveCategoryProvider("CHAT_KEY");
	if (!apiKey) return "";
	const chats = links.slice(0, MAX_CHATS);
	const contexts: string[] = [];
	for (let offset = 0; offset < chats.length; offset += MAX_CONCURRENT) {
		const batch = chats.slice(offset, offset + MAX_CONCURRENT);
		contexts.push(...await Promise.all(batch.map((link) =>
			readChat(link.conversationId, link.createdByEmail, apiKey).catch(() => ""),
		)));
	}
	const available = contexts.filter(Boolean);
	if (!available.length) return "";
	const allowance = Math.floor(MAX_CONTEXT_CHARS / available.length);
	return available.map((context) => context.length <= allowance ? context : context.slice(-allowance))
		.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

export function selectDefaultMemorySessions(
	sessions: ChatSessionListItem[],
	links: VisibleProjectConversation[],
	projectModes: Map<string, "DEFAULT" | "PROJECT_ONLY">,
	currentProjectId: string,
): ChatSessionListItem[] {
	const linksByConversation = new Map<string, VisibleProjectConversation[]>();
	for (const link of links) {
		const existing = linksByConversation.get(link.conversationId) ?? [];
		existing.push(link);
		linksByConversation.set(link.conversationId, existing);
	}
	return sessions.filter((session) => {
		if (session.category !== "CHAT_KEY") return false;
		const projectLinks = linksByConversation.get(session.difyConversationId) ?? [];
		if (projectLinks.some((link) => link.projectId === currentProjectId)) return false;
		return !projectLinks.some((link) => projectModes.get(link.projectId) !== "DEFAULT");
	});
}

export async function loadDefaultMemoryContext(projectId: string, callerEmail: string): Promise<string> {
	try {
		const access = await getProjectAccess(projectId, callerEmail);
		if (!access || access.role !== "OWNER" || access.project.memoryMode !== "DEFAULT" || access.project.hasShared) return "";
		if (await projectHasSharing(projectId)) return "";
		const { apiKey } = resolveCategoryProvider("CHAT_KEY");
		if (!apiKey) return "";
		const [sessions, links, owned, shared] = await Promise.all([
			listChatSessions({ userId: callerEmail, categories: ["CHAT_KEY"], limit: 100 }),
			listVisibleProjectConversations(callerEmail),
			listOwnedProjects(callerEmail),
			listProjectsSharedWith(callerEmail),
		]);
		const projectModes = new Map<string, "DEFAULT" | "PROJECT_ONLY">();
		for (const project of owned) projectModes.set(project.id, project.hasShared || project.memoryMode !== "DEFAULT" ? "PROJECT_ONLY" : "DEFAULT");
		for (const project of shared) projectModes.set(project.id, "PROJECT_ONLY");
		const eligible = selectDefaultMemorySessions(sessions.items, links, projectModes, projectId)
			.sort((left, right) => Date.parse(String(right.updatedAt)) - Date.parse(String(left.updatedAt)))
			.slice(0, MAX_DEFAULT_MEMORY_CHATS);
		const contexts = await Promise.all(eligible.map((session) => readChat(session.difyConversationId, callerEmail, apiKey).catch(() => "")));
		const available = contexts.filter(Boolean);
		if (!available.length) return "";
		const perChatLimit = Math.floor(MAX_DEFAULT_MEMORY_CHARS / available.length);
		return available.map((context) => context.length <= perChatLimit ? context : context.slice(-perChatLimit))
			.join("\n\n").slice(0, MAX_DEFAULT_MEMORY_CHARS);
	} catch {
		return "";
	}
}

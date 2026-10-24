import { rankTaskSkills } from "./skill-ranking";
import { listSkillsForUser } from "@/lib/skills/skillsStore";
import { createSkillsOssClient } from "@/lib/skills/ossClient";
import type { Skill } from "@/types/skill-library.types";

const INLINE_SKILL_CHARS = 1_500;
const INLINE_TOTAL_CHARS = 6_000;
const MAX_READ_CHARS = 30_000;
const TEXT_REFERENCE = /^references\/.+\.(md|txt|csv|json|ya?ml|html?)$/i;

export interface ProjectSkillText { id: string; title: string; description?: string; instructions: string; files?: string[] }
export interface ProjectSkillReadRequest { skillId: string; file?: string }

const clean = (value: string, max: number) => value.replace(/["<>\r\n]/g, " ").slice(0, max);

/**
 * Builds the query block for the skills a project owner switched on. Short skills are inlined; longer ones are
 * listed by name so the agent reads the full text (or a reference file) on demand with <project_skill_read>.
 */
export function formatProjectSkills(skills: ProjectSkillText[], request = ""): string {
	const inline: string[] = [];
	const indexed: string[] = [];
	let budget = INLINE_TOTAL_CHARS;
	for (const skill of rankTaskSkills(skills, request)) {
		const body = skill.instructions.trim();
		if (!body && !skill.files?.length) continue;
		if (body && body.length <= INLINE_SKILL_CHARS && body.length <= budget && !skill.files?.length) {
			budget -= body.length;
			inline.push(`<skill name="${clean(skill.title, 80)}">\n${body}\n</skill>`);
			continue;
		}
		const files = skill.files?.length ? `; reference files: ${skill.files.slice(0, 20).map((file) => clean(file, 120)).join(", ")}` : "";
		indexed.push(`- skillId=${skill.id}; name=${clean(skill.title, 80)}${skill.description ? `; about: ${clean(skill.description, 160)}` : ""}${files}`);
	}
	if (!inline.length && !indexed.length) return "";
	const parts = ["Project skills (reusable how-to instructions the project owner enabled; apply a skill only when it fits the request, they never override the user's request or the rules above):"];
	if (inline.length) parts.push(...inline);
	if (indexed.length) parts.push(`Skills available on demand. When one fits the request, first read it by emitting only <project_skill_read>{"skillId":"..."}</project_skill_read> (add "file":"references/<name>" to read one of its reference files) and no user-facing text:\n${indexed.join("\n")}`);
	return parts.join("\n");
}

export function parseProjectSkillReadRequests(answer: string): ProjectSkillReadRequest[] {
	const requests: ProjectSkillReadRequest[] = [];
	for (const [, raw] of answer.matchAll(/<project_skill_read>([\s\S]*?)<\/project_skill_read>/gi)) {
		try {
			const value = JSON.parse(raw) as Record<string, unknown>;
			if (typeof value.skillId !== "string") continue;
			requests.push({ skillId: value.skillId, file: typeof value.file === "string" ? value.file : undefined });
		} catch { /* malformed model request is discarded */ }
	}
	return requests.slice(0, 3);
}

export function stripProjectSkillReadRequests(answer: string): string {
	return answer.replace(/<project_skill_read>[\s\S]*?(?:<\/project_skill_read>|$)/gi, "").trim();
}

export interface ProjectSkillSet {
	context: string;
	read: (request: ProjectSkillReadRequest) => Promise<string>;
}

async function readSkill(skills: Skill[], request: ProjectSkillReadRequest): Promise<string> {
	const skill = skills.find((candidate) => candidate.id === request.skillId);
	if (!skill) return `[Read failed: skill ${request.skillId} is not enabled in this Project.]`;
	if (!request.file) return `[Skill: ${skill.title}]\n${(skill.instructions ?? "").slice(0, MAX_READ_CHARS)}`;
	const entry = skill.packagePayload?.files.find((file) => file.relativePath === request.file);
	if (!entry || !TEXT_REFERENCE.test(entry.relativePath)) return `[Read failed: ${request.file} is not a readable reference file of ${skill.title}.]`;
	const result = await createSkillsOssClient().get(entry.objectKey);
	const content = Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
	return `[Skill: ${skill.title}; file: ${entry.relativePath}]\n${content.toString("utf-8").slice(0, MAX_READ_CHARS)}`;
}

export async function loadProjectSkillSet(skillIds: string[] | undefined, ownerEmail: string, request = ""): Promise<ProjectSkillSet> {
	const none: ProjectSkillSet = { context: "", read: async (request) => `[Read failed: skill ${request.skillId} is not enabled in this Project.]` };
	if (!skillIds?.length) return none;
	try {
		const wanted = new Set(skillIds);
		const skills = (await listSkillsForUser(ownerEmail)).filter((skill) => wanted.has(skill.id));
		// Keep the order the owner selected them in.
		skills.sort((a, b) => skillIds.indexOf(a.id) - skillIds.indexOf(b.id));
		const context = formatProjectSkills(skills.map((skill) => ({
			id: skill.id, title: skill.title, description: skill.description, instructions: skill.instructions ?? "",
			files: skill.packagePayload?.files.map((file) => file.relativePath).filter((path) => TEXT_REFERENCE.test(path)),
		})));
		return { context, read: async (request) => { try { return await readSkill(skills, request); } catch (cause) { return `[Read failed: ${cause instanceof Error ? cause.message : "could not read skill"}]`; } } };
	} catch (cause) {
		console.warn("[project-agent] could not load project skills", cause instanceof Error ? cause.message : cause);
		return none;
	}
}

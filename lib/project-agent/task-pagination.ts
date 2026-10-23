const TASK_ID_PATTERN = /^pat_[a-f0-9]{12}$/;

export interface ProjectAgentTaskCursor {
	createdAt: string;
	id: string;
}

export function encodeProjectAgentTaskCursor(cursor: ProjectAgentTaskCursor): string {
	return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeProjectAgentTaskCursor(value: string | null): ProjectAgentTaskCursor | null {
	if (!value) return null;
	if (value.length > 256) throw new Error("Invalid Project Agent history cursor");
	try {
		const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ProjectAgentTaskCursor>;
		if (typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string" || !TASK_ID_PATTERN.test(parsed.id)) {
			throw new Error("Invalid Project Agent history cursor");
		}
		return { createdAt: parsed.createdAt, id: parsed.id };
	} catch {
		throw new Error("Invalid Project Agent history cursor");
	}
}

import { useState } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";

/** Copies a task's answer to the clipboard and shows a brief "copied" state. */
export function useCopyResult(onError: (message: string) => void) {
	const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
	async function copyResult(task: PublicProjectAgentTask) {
		try {
			await navigator.clipboard.writeText(task.resultText ?? "");
			setCopiedTaskId(task.id);
			window.setTimeout(() => setCopiedTaskId((current) => current === task.id ? null : current), 1500);
		} catch { onError("Could not copy to the clipboard."); }
	}
	return { copiedTaskId, copyResult };
}

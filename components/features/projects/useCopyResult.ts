import { useState } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";

function fallbackCopyText(text: string): boolean {
	if (typeof document === "undefined") return false;
	const textArea = document.createElement("textarea");
	textArea.value = text;
	textArea.style.position = "fixed";
	textArea.style.top = "-9999px";
	textArea.style.opacity = "0";
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	try {
		const success = document.execCommand("copy");
		document.body.removeChild(textArea);
		return success;
	} catch {
		document.body.removeChild(textArea);
		return false;
	}
}

/** Copies a task's answer to the clipboard and shows a brief "copied" state. */
export function useCopyResult(onError: (message: string) => void) {
	const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
	async function copyResult(task: PublicProjectAgentTask) {
		const text = task.resultText ?? "";
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
				await navigator.clipboard.writeText(text);
			} else if (!fallbackCopyText(text)) {
				throw new Error("Clipboard write failed");
			}
			setCopiedTaskId(task.id);
			window.setTimeout(() => setCopiedTaskId((current) => current === task.id ? null : current), 1500);
		} catch {
			if (fallbackCopyText(text)) {
				setCopiedTaskId(task.id);
				window.setTimeout(() => setCopiedTaskId((current) => current === task.id ? null : current), 1500);
			} else {
				onError("Could not copy to the clipboard.");
			}
		}
	}
	return { copiedTaskId, copyResult };
}

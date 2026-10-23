import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";

/** Sends "redo this image" with the marked copy attached: waits for the attachment state to settle, then submits the composer. */
export function useProjectAgentImageRedo(pendingFiles: File[], setPendingFiles: Dispatch<SetStateAction<File[]>>, promptRef: MutableRefObject<string | null>, formRef: RefObject<HTMLFormElement | null>) {
	const waiting = useRef<{ file: File; text: string } | null>(null);
	useEffect(() => {
		const redo = waiting.current;
		if (!redo || !pendingFiles.includes(redo.file)) return;
		waiting.current = null;
		promptRef.current = redo.text;
		formRef.current?.requestSubmit();
	}, [pendingFiles, promptRef, formRef]);
	return useCallback((marked: File, instruction: string, original: ProjectAgentTaskFile) => {
		waiting.current = { file: marked, text: `Redo the image ${original.name}. The attached file ${marked.name} is that image with the area to change painted in orange; the orange paint is only a marker and must not appear in the result. Requested change: ${instruction}\nUse generate_image with the attached image as a reference (add the original from outputs/generated if it is still in the workspace), keep everything outside the marked area as it is, then look at the result and deliver it.` };
		setPendingFiles([marked]);
	}, [setPendingFiles]);
}

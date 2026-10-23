"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, UserRound } from "lucide-react";
import { ProjectPanelSection } from "./ProjectPanelSection";
import type { ProjectMemoryMode } from "@/stores/useProjectStore";

export function ProjectMemorySection({ memoryText, memoryMode = "PROJECT_ONLY" }: { memoryText: string; memoryMode?: ProjectMemoryMode }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<ProjectPanelSection label="Memory" privacyLabel={memoryMode === "DEFAULT" ? "Default memory" : "Project only"} privacyIcon={memoryMode === "DEFAULT" ? UserRound : Lock}>
			{memoryText ? <div>
				<p className={`text-sm text-gray-600 dark:text-gray-400 leading-6 ${expanded ? "" : "line-clamp-3"}`}>{memoryText}</p>
				{memoryText.length > 120 && <button onClick={() => setExpanded((value) => !value)} className="mt-2 flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400">
					{expanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show more</>}
				</button>}
			</div> : <p className="text-[12px] text-gray-400 dark:text-gray-500 italic leading-relaxed">Project memory will show here after a few chats.</p>}
		</ProjectPanelSection>
	);
}

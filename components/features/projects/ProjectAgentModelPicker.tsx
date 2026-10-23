"use client";

import { useEffect } from "react";
import { AIActionLauncher } from "@/components/child-components/ai-select-models";
import { WORKSPACE_DIFY_COMPACT_MODEL_IDS } from "@/lib/ai-model-catalog";
import { useAgentComposerStore } from "@/stores/useAgentComposerStore";

// Module-level so the memoised launcher sees equal props on every keystroke of the composer.
const HIDDEN_GROUPS = ["google"] as const;
const DEFAULT_LABEL = "Claude Sonnet 5.5";
const selectModel = (modelId: string | null) => useAgentComposerStore.getState().setModelId(modelId);

/** Model picker of the Project Agent composer; the choice applies to the next task and is remembered. */
export function ProjectAgentModelPicker() {
	const modelId = useAgentComposerStore((state) => state.modelId);
	useEffect(() => { useAgentComposerStore.getState().loadModelId(); }, []);
	return <div className="origin-right scale-90">
		<AIActionLauncher variant="ghost" hiddenGroupIds={HIDDEN_GROUPS} visibleModelIds={WORKSPACE_DIFY_COMPACT_MODEL_IDS} compact showCapabilities={false} showLegend={false} value={modelId} onValueChange={selectModel} defaultLabel={DEFAULT_LABEL} />
	</div>;
}

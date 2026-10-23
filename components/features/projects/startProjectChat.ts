import { useMessageStore } from "@/stores/useMessageStore";
import { clearProjectAgentConversationId } from "@/lib/project-agent/conversation-session";
import { NEW_PROJECT_AGENT_VIEW_ID, selectProjectAgentView } from "@/lib/project-agent/view-session";

/** Opens an empty chat inside the project, clearing any chat that was open before. */
export function startProjectChat(projectId: string): void {
	clearProjectAgentConversationId(projectId);
	selectProjectAgentView(projectId, NEW_PROJECT_AGENT_VIEW_ID);
	useMessageStore.getState().setTitleNewChat("New chat");
	useMessageStore.getState().clearMessages();
	for (const key of ["conversation_id", "conversation_category", "conversation_user"]) sessionStorage.removeItem(key);
}

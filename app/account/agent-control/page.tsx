import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { AgentBrowserPolicyManager } from "@/components/features/projects/AgentBrowserPolicyManager";
import { AgentNotificationChannels } from "@/components/features/projects/AgentNotificationChannels";
import { AgentApprovalInbox } from "@/components/features/projects/AgentApprovalInbox";
import { PersonalSessionVaultManager } from "@/components/features/projects/PersonalSessionVaultManager";
import { PersonalAgentMemoryManager } from "@/components/features/projects/PersonalAgentMemoryManager";
import { AgentProactiveSuggestions } from "@/components/features/projects/AgentProactiveSuggestions";

export default function AgentControlCenter() {
  return <ProtectedRoute><main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
    <AgentAccountNav current="/account/agent-control" />
    <header><h1 className="text-xl font-semibold">Agent Control Center</h1>
      <p className="text-sm text-slate-500">Approve sensitive actions, manage account permissions, memory and automation suggestions across Projects.</p></header>
    <AgentApprovalInbox />
    <AgentNotificationChannels />
    <AgentBrowserPolicyManager />
    <PersonalSessionVaultManager />
    <PersonalAgentMemoryManager />
    <AgentProactiveSuggestions />
  </main></ProtectedRoute>;
}

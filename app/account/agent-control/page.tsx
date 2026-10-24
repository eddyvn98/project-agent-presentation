import { AgentApprovalInbox } from "@/components/features/projects/AgentApprovalInbox";
import { PersonalSessionVaultManager } from "@/components/features/projects/PersonalSessionVaultManager";
export default function AgentControlCenter() {
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
    <header><h1 className="text-xl font-semibold">Agent Control Center</h1>
      <p className="text-sm text-slate-500">Manage your Agent's permissions and approve sensitive actions across all Projects.</p></header>
    <AgentApprovalInbox />
    <PersonalSessionVaultManager />
  </main>;
}

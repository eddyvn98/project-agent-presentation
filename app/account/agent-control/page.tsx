import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { AgentBrowserPolicyManager } from "@/components/features/projects/AgentBrowserPolicyManager";
import { AgentNotificationChannels } from "@/components/features/projects/AgentNotificationChannels";
import { AgentApprovalInbox } from "@/components/features/projects/AgentApprovalInbox";
import { PersonalAgentMemoryManager } from "@/components/features/projects/PersonalAgentMemoryManager";
import { AgentProactiveSuggestions } from "@/components/features/projects/AgentProactiveSuggestions";

export default function AgentControlCenter() {
  return <ProtectedRoute><main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <AgentAccountNav current="/account/agent-control" />
    <header className="max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Your agent</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agent settings</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Manage approvals, notifications, browsing permissions and memory in one place.
      </p>
    </header>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4"><AgentApprovalInbox /><AgentNotificationChannels />
        <AgentProactiveSuggestions /></div>
      <div className="space-y-4"><AgentBrowserPolicyManager />
        <PersonalAgentMemoryManager />
        <a href="/account/browser-sessions" className="block rounded-2xl border border-slate-200 p-4 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
          <strong>Website sessions</strong>
          <p className="mt-1 text-slate-500">Review saved browser permissions and revoke access.</p>
        </a>
      </div>
    </div>
  </main></ProtectedRoute>;
}

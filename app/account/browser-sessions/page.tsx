import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { PersonalSessionVaultManager } from "@/components/features/projects/PersonalSessionVaultManager";
export default function BrowserSessionsPage() {
  return <ProtectedRoute><main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <AgentAccountNav current="/account/browser-sessions" />
    <header className="max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Browser access</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Website sessions</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Review websites your agent can use, control unattended access and revoke saved sessions.</p>
    </header>
    <PersonalSessionVaultManager />
  </main></ProtectedRoute>;
}

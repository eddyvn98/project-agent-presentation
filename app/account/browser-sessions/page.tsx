import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { PersonalSessionVaultManager } from "@/components/features/projects/PersonalSessionVaultManager";
export default function BrowserSessionsPage() {
  return <ProtectedRoute><main className="mx-auto max-w-4xl px-4 py-6">
    <AgentAccountNav current="/account/browser-sessions" />
    <PersonalSessionVaultManager />
  </main></ProtectedRoute>;
}

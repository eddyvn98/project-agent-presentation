import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { AgentObservabilityDashboard } from "@/components/features/projects/AgentObservabilityDashboard";
export default function AgentObservabilityPage() {
  return <ProtectedRoute><main className="mx-auto max-w-5xl px-4 py-6">
    <AgentAccountNav current="/account/agent-observability" />
    <AgentObservabilityDashboard />
  </main></ProtectedRoute>;
}

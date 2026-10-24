import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { AgentWorkflowBuilder } from "@/components/features/projects/AgentWorkflowBuilder";
export default function AgentWorkflowsPage() {
  return <ProtectedRoute><main className="mx-auto max-w-5xl px-4 py-6">
    <AgentAccountNav current="/account/agent-workflows" />
    <AgentWorkflowBuilder />
  </main></ProtectedRoute>;
}

import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { AgentHarnessLab } from "@/components/features/projects/AgentHarnessLab";
export default function AgentHarnessPage() {
  return <ProtectedRoute><main className="mx-auto max-w-5xl px-4 py-6">
    <AgentAccountNav current="/account/agent-harness" />
    <AgentHarnessLab />
  </main></ProtectedRoute>;
}

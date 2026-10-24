import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { AgentBenchmarkLab } from "@/components/features/projects/AgentBenchmarkLab";
export default function AgentBenchmarkPage() {
  return <ProtectedRoute><main className="mx-auto max-w-5xl px-4 py-6">
    <AgentAccountNav current="/account/agent-benchmark" />
    <AgentBenchmarkLab />
  </main></ProtectedRoute>;
}

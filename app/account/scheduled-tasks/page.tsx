import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { ScheduledAgentManager } from "@/components/features/projects/ScheduledAgentManager";
export default function ScheduleSettings() {
  return <ProtectedRoute><main className="mx-auto max-w-5xl px-4 py-6">
    <AgentAccountNav current="/account/scheduled-tasks" />
    <ScheduledAgentManager />
  </main></ProtectedRoute>;
}

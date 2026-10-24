import ProtectedRoute from "@/components/features/auth/protected-route";
import { AgentAccountNav } from "@/components/features/projects/AgentAccountNav";
import { PersonalAgentSkillRegistry } from "@/components/features/projects/PersonalAgentSkillRegistry";
export default function AgentSkillsPage() {
  return <ProtectedRoute><main className="mx-auto max-w-5xl px-4 py-6">
    <AgentAccountNav current="/account/agent-skills" />
    <PersonalAgentSkillRegistry />
  </main></ProtectedRoute>;
}

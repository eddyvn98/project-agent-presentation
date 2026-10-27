import { createRoot } from "react-dom/client";
import { AgentAccountNav, type AgentAccountPage } from "../components/features/projects/AgentAccountNav";
import { PersonalAgentSkillRegistry } from "../components/features/projects/PersonalAgentSkillRegistry";
import { AgentWorkflowBuilder } from "../components/features/projects/AgentWorkflowBuilder";
import { ScheduledAgentManager } from "../components/features/projects/ScheduledAgentManager";
import { AgentApprovalInbox } from "../components/features/projects/AgentApprovalInbox";
import { AgentNotificationChannels } from "../components/features/projects/AgentNotificationChannels";
import { AgentBrowserPolicyManager } from "../components/features/projects/AgentBrowserPolicyManager";
import { PersonalAgentMemoryManager } from "../components/features/projects/PersonalAgentMemoryManager";
import { PersonalSessionVaultManager } from "../components/features/projects/PersonalSessionVaultManager";
import "./agent-ui.css";

type View = "skills" | "workflows" | "schedules" | "settings" | "sessions";
const selected = new URLSearchParams(location.search);
const view = (["skills", "workflows", "schedules", "settings", "sessions"].includes(selected.get("view") || "")
  ? selected.get("view") : "skills") as View;
if (selected.get("dark") === "1") document.documentElement.classList.add("dark");
const destinations: Record<View, AgentAccountPage> = {
  skills: "/account/agent-skills", workflows: "/account/agent-workflows",
  schedules: "/account/scheduled-tasks", settings: "/account/agent-control",
  sessions: "/account/browser-sessions",
};
function Settings() {
  return <section className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Agent settings</h1>
      <p className="text-sm text-slate-500">Manage approvals, browser access and memory.</p></header>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4"><AgentApprovalInbox/><AgentNotificationChannels/></div>
      <div className="space-y-4"><AgentBrowserPolicyManager/><PersonalAgentMemoryManager/></div>
    </div>
  </section>;
}
function App() {
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6" data-agent-ui-qa={view}>
    <AgentAccountNav current={destinations[view]}/>
    {view === "skills" ? <PersonalAgentSkillRegistry/> :
      view === "workflows" ? <AgentWorkflowBuilder/> :
      view === "schedules" ? <ScheduledAgentManager/> :
      view === "settings" ? <Settings/> :
      <section className="space-y-5"><h1 className="text-2xl font-semibold">Website sessions</h1>
        <PersonalSessionVaultManager/></section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App/>);

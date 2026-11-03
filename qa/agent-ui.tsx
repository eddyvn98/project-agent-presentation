import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ProjectAgentDesignHandoff } from "../components/features/projects/ProjectAgentDesignHandoff";
import { collectDesignHandoffs } from "../lib/project-agent/design-handoff";
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

type View = "skills" | "workflows" | "schedules" | "settings" | "sessions" | "design";
const selected = new URLSearchParams(location.search);
const view = (["skills", "workflows", "schedules", "settings", "sessions", "design"].includes(selected.get("view") || "")
  ? selected.get("view") : "skills") as View;
if (selected.get("dark") === "1") document.documentElement.classList.add("dark");
const destinations: Record<View, AgentAccountPage> = {
  skills: "/account/agent-skills", workflows: "/account/agent-workflows",
  schedules: "/account/scheduled-tasks", settings: "/account/agent-control",
  sessions: "/account/browser-sessions", design: "/account/agent-control",
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
function DesignQA() {
  const id = "abcdefabcdef";
  const formats = ["design.json", "pdf", "dxf", "glb", "preview.png", "web.html", "ifc"];
  const files = formats.map((ext) => ({ id: ext, name: "design-" + id + "." + ext,
    size: 1024, mimeType: ext === "preview.png" ? "image/png" : "application/octet-stream" }));
  const { handoffs } = collectDesignHandoffs(files);
  const [opened, setOpened] = useState("");
  const [draft, setDraft] = useState("");
  return <section className="mx-auto max-w-xl space-y-4" aria-label="Design handoff QA">
    <h1 className="text-xl font-semibold">Design handoff mobile QA</h1>
    {handoffs.map((design) => <ProjectAgentDesignHandoff key={design.id}
      design={design}
      fileHref={(file) => "/api/qa/design/" + file.id}
      onPreview={(file) => setOpened(file.name)}
      onEdit={setDraft} />)}
    {opened && <div role="status">Preview opened: {opened}</div>}
    <textarea aria-label="Design change draft" value={draft}
      onChange={(event) => setDraft(event.target.value)} className="w-full rounded border p-3" />
  </section>;
}
function App() {
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6" data-agent-ui-qa={view}>
    <AgentAccountNav current={destinations[view]}/>
    {view === "design" ? <DesignQA/> :
      view === "skills" ? <PersonalAgentSkillRegistry/> :
      view === "workflows" ? <AgentWorkflowBuilder/> :
      view === "schedules" ? <ScheduledAgentManager/> :
      view === "settings" ? <Settings/> :
      <section className="space-y-5"><h1 className="text-2xl font-semibold">Website sessions</h1>
        <PersonalSessionVaultManager/></section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App/>);

import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ProjectAgentDesignHandoff } from "../components/features/projects/ProjectAgentDesignHandoff";
import { collectDesignHandoffs } from "../lib/project-agent/design-handoff";
import "./agent-ui.css";

function DesignHandoffQA() {
  const id = "abcdefabcdef";
  const formats = ["design.json", "pdf", "dxf", "glb", "preview.png", "web.html", "ifc"];
  const files = formats.map(ext => ({ id: ext, name: "design-" + id + "." + ext,
    size: 1024, mimeType: ext === "preview.png" ? "image/png" : "application/octet-stream" }));
  const { handoffs } = collectDesignHandoffs(files);
  const [opened, setOpened] = useState("");
  const [draft, setDraft] = useState("");
  return <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
    <h1 className="text-xl font-semibold">Design handoff mobile QA</h1>
    {handoffs.map(design => <ProjectAgentDesignHandoff key={design.id}
      design={design}
      fileHref={file => file.name.endsWith(".design.json")
        ? "/api/projects/qa/agent/tasks/qa/files/" + file.id : "/api/qa/design/" + file.id}
      onPreview={file => setOpened(file.name)}
      onEdit={setDraft}/>)}
    {opened && <div role="status">Preview opened: {opened}</div>}
    <textarea aria-label="Design change draft" value={draft}
      onChange={event => setDraft(event.target.value)}
      className="w-full rounded border p-3" />
  </main>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Design QA root was not found.");
createRoot(root).render(<DesignHandoffQA/>);

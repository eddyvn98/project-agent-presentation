import { createRoot } from "react-dom/client";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { enhancedMarkdown } from "./content";
import "./style.css";

createRoot(document.getElementById("root")!).render(<main>
  <p className="mb-6 text-xs uppercase tracking-wide text-slate-500">Presentation lab · synthetic demo</p>
  <ProjectAgentAnswer markdown={enhancedMarkdown} presentation images={{
    "/demo/marker.svg": { size: "inline", caption: "A single marker, shown at illustration scale.", source: { url: "https://example.com/illustration", label: "Synthetic artwork" } },
    "/demo/reference.svg": { size: "reference", caption: "A larger synthetic reference figure with three labeled regions." },
  }} />
</main>);

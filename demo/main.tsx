import { createRoot } from "react-dom/client";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { enhancedMarkdown } from "./content";
import "./style.css";

// A valid chart is opt-in so ordinary demo traffic does not load Recharts.
const chartFixture = {
  type: "chart", kind: "bar", title: "Synthetic chart", caption: "Illustrative values only.",
  categories: ["A", "B"], series: [{ name: "Example", values: [2, 4] }],
};
const search = new URLSearchParams(window.location.search);
const showChart = search.has("chart");
const plain = search.has("plain");
const answer = plain ? "A short synthetic answer with no formulas, diagrams or charts." :
  showChart ? enhancedMarkdown + "\n\n## Optional chart\n\n" +
  "```agent-ui\n" + JSON.stringify(chartFixture) + "\n```\n" : enhancedMarkdown;

createRoot(document.getElementById("root")!).render(<main>
  <p className="mb-6 text-xs uppercase tracking-wide text-slate-500">Presentation lab · synthetic demo</p>
  <ProjectAgentAnswer markdown={answer} presentation images={{
    "/demo/marker.svg": { size: "inline", caption: "A single marker, shown at illustration scale.", source: { url: "https://example.com/illustration", label: "Synthetic artwork" } },
    "/demo/reference.svg": { size: "reference", caption: "A larger synthetic reference figure with three labeled regions." },
  }} />
</main>);

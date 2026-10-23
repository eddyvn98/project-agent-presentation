import { useEffect, useState } from "react";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { enhancedMarkdown } from "./content";
import { ConversationDemo } from "./ConversationDemo";
import type { ProjectAgentTaskSource } from "../src/lib/project-agent/types";

const sources: ProjectAgentTaskSource[] = [{
  url: "https://example.com/reference", title: "Synthetic reference", fetchedAt: "2026-10-23T00:00:00Z",
  sourceType: "page", excerpt: "This is illustrative source metadata, not a factual reference.",
}];
const chartFixture = {
  type: "chart", kind: "bar", title: "Synthetic chart", caption: "Illustrative values only.",
  categories: ["A", "B"], series: [{ name: "Example", values: [2, 4] }],
};

export function DemoApp() {
  const search = new URLSearchParams(window.location.search);
  const chat = search.has("chat");
  const showChart = search.has("chart");
  const plain = search.has("plain");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  const answer = plain ? "A short synthetic answer with no formulas, diagrams or charts." :
    showChart ? enhancedMarkdown + "\n\n## Optional chart\n\n```agent-ui\n" + JSON.stringify(chartFixture) + "\n```\n" : enhancedMarkdown;
  return <div className={`demo-app ${chat ? "demo-app--chat" : ""}`}>
    <header className="demo-header">
      <a className="demo-brand" href="/">Presentation lab</a>
      <nav aria-label="Demo views">
        <a href="/" aria-current={!chat && !plain && !showChart ? "page" : undefined}>Answer</a>
        <a href="/?chat=1" aria-current={chat ? "page" : undefined}>Conversation</a>
        <a href="/?plain=1" aria-current={plain ? "page" : undefined}>Plain text</a>
        <a href="/?chart=1" aria-current={showChart ? "page" : undefined}>Chart</a>
      </nav>
      <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
        {theme === "light" ? "Dark" : "Light"}
      </button>
    </header>
    {chat ? <ConversationDemo /> : <main className="demo-answer">
      <p className="demo-kicker">Synthetic content · response presentation</p>
      <ProjectAgentAnswer markdown={answer} presentation actions showSources sources={plain ? undefined : sources} images={{
        "/demo/marker.svg": { size: "inline", caption: "A single marker, shown at illustration scale.", source: { url: "https://example.com/illustration", label: "Synthetic artwork" } },
        "/demo/reference.svg": { size: "reference", caption: "A larger synthetic reference figure with three labeled regions." },
      }} />
    </main>}
  </div>;
}

import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { LONG_CHAT_BATCH, longChatWindow } from "../lib/project-agent/long-chat-window";
import "./style.css";

const messages = Array.from({ length: 5000 }, (_, i) => {
  const kind = i % 41;
  const markdown = kind === 0
    ? "## Diagram\n" + "~~~mermaid\nflowchart LR\n A[Input] --> B{Valid?}\n B --> C[Result]\n~~~"
    : kind === 1 ? "## Formula\n\n\\[E=mc^2\\]\n\n| Case | Value |\n|---|---:|\n| A | 125 |"
    : kind === 2 ? "## Code\n\n~~~ts\nconst answer = 42;\n~~~"
    : kind === 3 ? "## Image\n\n![Synthetic marker](/demo/marker.svg)"
    : "Synthetic answer " + i + ". This data is not a real conversation.";
  return { id: "turn-" + i, prompt: "Synthetic user prompt " + i, markdown };
});
function LongChatQa() {
  const [limit, setLimit] = useState(LONG_CHAT_BATCH);
  const scrollRef = useRef<HTMLDivElement>(null);
  const preserve = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const prior = preserve.current, container = scrollRef.current;
    if (prior && container) container.scrollTop = prior.top + container.scrollHeight - prior.height;
    preserve.current = null;
  }, [limit]);
  const visible = longChatWindow(messages, limit);
  return <main className="mx-auto w-full max-w-3xl p-3">
    <h1 className="mb-2 font-semibold">Long chat test — synthetic 5,000 turns</h1>
    <p role="status" data-testid="qa-stats">Loaded {messages.length}; mounted {visible.length}</p>
    <div ref={scrollRef} data-testid="qa-scroll" className="h-[72vh] overflow-y-auto rounded-xl border p-3">
      {messages.length > visible.length && <button className="mb-4 rounded-full border px-3 py-2"
        onClick={() => { const node = scrollRef.current; if (node) preserve.current = {
          height: node.scrollHeight, top: node.scrollTop }; setLimit(v => v + LONG_CHAT_BATCH); }}>
        Show earlier loaded messages
      </button>}
      {visible.map(message => <article data-testid="qa-message" data-id={message.id}
        key={message.id} className="mb-5 rounded-lg border p-3">
        <p className="mb-2 text-sm font-medium">{message.prompt}</p>
        <ProjectAgentAnswer markdown={message.markdown}/>
      </article>)}
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<LongChatQa />);

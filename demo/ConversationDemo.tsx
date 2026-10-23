import { useEffect, useRef, useState } from "react";
import { ProjectAgentMessage } from "../src/components/ProjectAgentMessage";
import { ProjectAgentTranscript } from "../src/components/ProjectAgentTranscript";
import { ProjectAgentProgress } from "../src/components/ProjectAgentProgress";
import { ProjectAgentReplyProvider } from "../src/components/ProjectAgentReply";
import type { AnswerFeedback } from "../src/components/ProjectAgentAnswerActions";
import type { ResponseState } from "../src/components/ProjectAgentResponseStatus";
import { chatAnswer, alternativeAnswer, chatSources } from "./chat-content";
import { replacePresentationFence } from "../src/lib/project-agent/replace-presentation-fence";
import { JsonCardPreview } from "./JsonCardPreview";

export function ConversationDemo() {
  const [user, setUser] = useState("Show me a complete response with a figure, a table, readable code and a draft I can reuse.");
  const [answer, setAnswer] = useState(chatAnswer);
  const [status, setStatus] = useState<ResponseState>("complete");
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback>(null);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState("");
  const [replies, setReplies] = useState<string[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fixture = useRef(chatAnswer);
  const stop = () => { if (interval.current !== null) clearInterval(interval.current); interval.current = null; };
  useEffect(() => stop, []);
  const replay = () => {
    stop(); setVersion(0); setAnswer(""); setStatus("streaming"); setNote("Replaying supplied text. No model request is made.");
    let position = 0;
    interval.current = setInterval(() => {
      position += 60;
      setAnswer(fixture.current.slice(0, position));
      if (position >= fixture.current.length) { stop(); setStatus("complete"); }
    }, 65);
  };
  return <div className="demo-conversation">
    <div className="demo-scenario-controls" aria-label="Synthetic response states">
      <button type="button" onClick={replay}>Replay streaming</button>
      <button type="button" disabled={status !== "streaming"} onClick={() => { stop(); setStatus("stopped"); }}>Stop</button>
      <button type="button" onClick={() => { stop(); setStatus("error"); }}>Show error</button>
      <button type="button" onClick={() => { stop(); setStatus("complete"); setVersion(0); setAnswer(fixture.current); }}>Show complete</button>
      <span role="status">{note}</span>
    </div>
    <ProjectAgentReplyProvider value={(text) => { setReplies((current) => [...current, text]); setNote("Added your response to this local demo."); }}>
      <ProjectAgentTranscript conversationKey="synthetic-demo">
        <ProjectAgentMessage messageId="demo-user" role="user" markdown={user} onEdit={(text) => { setUser(text); setNote("Message edited in this demo."); }} />
        <ProjectAgentMessage messageId="demo-assistant" role="assistant" markdown={answer}
          status={status} statusDetail={status === "error" ? "Synthetic connection error. The partial response remains available." : undefined}
          sources={chatSources} outline images={{ "/demo/reference.svg": {
            caption: "Synthetic figure: the original labels remain available when enlarged.", width: 900, height: 500,
          } }}
          beforeAnswer={<ProjectAgentProgress steps={[
            { id: "read", label: "Read the supplied example", state: "complete" },
            { id: "respond", label: "Prepare response", state: status === "streaming" ? "active" : status === "error" ? "error" : status === "stopped" ? "pending" : "complete",
              detail: "These are explicit demo states, not model reasoning." },
          ]} />}
          onQuote={({ text }) => { setQuote(text); setNote("Selection available below the conversation."); }}
          onDocumentSave={({ originalSource, title, body }) => {
            const replacement = `${title ? `title: ${title}\n` : ""}${body}\n`;
            fixture.current = replacePresentationFence(fixture.current, "agent-doc", originalSource, replacement);
            setAnswer(fixture.current); setNote("Draft saved in this demo only.");
          }}
          onCodeSave={({ originalCode, language, code }) => {
            fixture.current = replacePresentationFence(fixture.current, language, originalCode, code);
            setAnswer(fixture.current); setNote("Code saved in this demo only.");
          }}
          renderCodePreview={({ code, language }) => language === "json" ? <JsonCardPreview code={code} /> :
            <p>This demo has a preview adapter for JSON cards only.</p>}
          actions={{ feedback, onFeedback: (next) => { setFeedback(next); setNote("Feedback updated in this demo."); }, onRetry: replay,
            onBranch: () => { setReplies((current) => [...current, "Synthetic branch point selected. A real host would open its own branch here."]); } }}
          variants={{ index: version, count: 2, onChange: (index) => { stop(); setStatus("complete"); setVersion(index); setAnswer(index ? alternativeAnswer : fixture.current); } }} />
        {replies.map((text, index) => <ProjectAgentMessage key={index} messageId={`demo-reply-${index}`} role="user" markdown={text} />)}
      </ProjectAgentTranscript>
    </ProjectAgentReplyProvider>
    {quote && <aside className="demo-quote"><strong>Selected text</strong><p>{quote}</p><button type="button" onClick={() => setQuote("")}>Dismiss</button></aside>}
    <p className="demo-scope-note">Presentation demo · synthetic content · no model, account or network workflow connected.</p>
  </div>;
}

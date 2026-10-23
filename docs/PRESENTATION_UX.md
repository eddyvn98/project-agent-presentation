# Presentation UX and host integration

This guide describes the implementation on `gpt/presentation-upgrade`. It covers response and conversation **presentation**, not a full chat application. The host supplies the actual content, identity, state, capabilities, and persistence. Current changes await local validation; no test/build/typecheck/CI run is claimed here.

## 1. Choose the integration level

| Entry point | Use it for | Ownership |
| --- | --- | --- |
| `ProjectAgentAnswer` | One assistant answer with Markdown and rich content | Host owns source text, state, metadata and actions |
| `ProjectAgentMessage` | A user or assistant message, with optional actions and versions | Host owns stable message IDs, message edits, versions and attachments |
| `ProjectAgentTranscript` | A bounded, scrollable list of message components | Host owns the list, conversation key, loading older history and composer |
| `ProjectAgentMarkdownProvider` + stable component map | An existing host ReactMarkdown pipeline | Host also configures parsing, safe plugins, styles and streaming policy |
| `createProjectAgentMarkdownComponents` | The legacy Markdown adapter | Memoize its result; the provider is preferred for metadata that changes while streaming |
| Direct visual components | A specific writing/code/table/source/image surface | Host supplies the data and any optional adapters |

Use stable, unique `id`/`messageId` values. In a React message list, key components by the owning conversation/message/version identity when those represent different responses. Do not reuse an identity for unrelated messages: forms, selections, previews, and asynchronous callbacks belong to one response scope.

## 2. Answer integration

```tsx
import { ProjectAgentAnswer } from "../src";

<ProjectAgentAnswer
  id={message.id}
  markdown={message.markdown}
  status={message.status}
  statusDetail={message.statusDetail}
  sources={message.sources}
  showSources
  outline
  actions={{
    onRetry: () => host.retry(message.id),
    onBranch: () => host.branch(message.id),
    onSave: () => host.saveResponse(message.id),
    onShare: () => host.shareResponse(message.id),
    onFeedback: (vote) => host.recordFeedback(message.id, vote),
    feedback: message.feedback,
  }}
  onQuote={({ text }) => host.setQuotedText(text)}
/>
```

`message` and `host` are application objects, not services provided by this package. Implement only callbacks your application actually supports. Promise-returning callbacks must resolve when the action has been accepted and reject when it fails; an empty callback incorrectly reports success.

### Answer props

| Prop | Default / contract |
| --- | --- |
| `markdown` | Required source text; prose order is preserved |
| `id` | Optional stable answer identity; generated if omitted |
| `status` | `complete`, `streaming`, `stopped`, or `error`; explicit status takes precedence over `streaming` |
| `streaming` | Convenience boolean; absent explicit `status`, true means `streaming` |
| `statusDetail` | Optional factual host status message |
| `sources` | Host-supplied `ProjectAgentTaskSource[]`; never fetched by the renderer |
| `images`, `resolveImage` | Image presentation metadata and host file-resolution adapter |
| `actions` | Defaults to false; true enables copy; an object adds supported callbacks |
| `showSources` | Defaults to false; adds the source list when metadata exists and the answer is not streaming |
| `outline` | Defaults to false; shows heading navigation when at least three H1–H3 headings are available |
| `links` | `auto` by default in `ProjectAgentAnswer`; `citations` preserves the citation-oriented link style |
| `presentation` | Defaults to false; enables reader-controlled H2 section presentation for completed multi-section answers |
| `onQuote` | Optional selected-text callback; does not automatically send a message |
| `onDocumentSave` | Optional writing-fence save adapter, described below |
| `onCodeSave` | Optional code-fence save adapter, described below |
| `renderCodePreview` | Optional trusted host preview renderer for code fences |
| `className` | Optional host styling hook |

`AnswerActionHandlers` also supports `copyText` for an exact host copy payload and `onReadAloud` for a host speech implementation. Feedback is `"up"`, `"down"`, or `null`; selecting the current vote clears it. There is no built-in speech service, branching store, share link, model retry, or feedback endpoint.

## 3. Messages, transcript and replies

```tsx
import {
  ProjectAgentMessage, ProjectAgentProgress,
  ProjectAgentReplyProvider, ProjectAgentTranscript,
} from "../src";

<div style={{ height: "70dvh", minHeight: 0 }}>
  <ProjectAgentReplyProvider value={(text) => host.sendMessage(text)}>
    <ProjectAgentTranscript conversationKey={conversation.id}>
      <ProjectAgentMessage
        key={userMessage.id}
        messageId={userMessage.id}
        role="user"
        markdown={userMessage.markdown}
        onEdit={(markdown) => host.editMessage(userMessage.id, markdown)}
      />
      <ProjectAgentMessage
        key={assistantMessage.id}
        messageId={assistantMessage.id}
        role="assistant"
        markdown={assistantMessage.markdown}
        status={assistantMessage.status}
        sources={assistantMessage.sources}
        beforeAnswer={<ProjectAgentProgress steps={host.visibleActivity} />}
        variants={{
          index: assistantMessage.variantIndex,
          count: assistantMessage.variantCount,
          onChange: (index) => host.selectVariant(assistantMessage.id, index),
        }}
      />
    </ProjectAgentTranscript>
  </ProjectAgentReplyProvider>
</div>
```

Give the transcript a bounded height or a constrained flex parent. It follows content growth only while the reader is near the bottom. Scrolling upward exposes **Jump to latest**. Switching `conversationKey` resets following behavior; it does not fetch history. The transcript is a labeled keyboard-focusable region, and it does not make every streamed token a live announcement.

User messages display as preserved plain text in a compact bubble. Assistant messages use `ProjectAgentAnswer`. `ProjectAgentMessage` defaults to `actions={true}` and `showSources={true}` for assistant answers. `name`, `meta`, `attachments`, and `beforeAnswer` accept host presentation content. The host remains responsible for actual attachment upload/download permissions.

Message edits wait for `onEdit` to succeed. Version navigation is controlled by the host through a zero-based `index` and a valid `count`; clicking a version does not fabricate another answer. Each valid version receives a separate answer identity, including when its text matches another version. Input composition is respected by the editing shortcut.

`ProjectAgentReplyProvider` is a React context provider: use its **`value`** prop. `ReplyHandler` receives one text string and returns `void | Promise<void>`. Forms and follow-ups call it only after explicit interaction. Without a provider, follow-ups are unavailable and completed forms can be copied instead. Do not supply a provider that claims to send without a real host action.

`ProjectAgentProgress` accepts `{ id, label, state, detail? }[]`, where state is `pending`, `active`, `complete`, or `error`. These are host-supplied activity summaries, not model reasoning or simulated tool events. Its details disclosure is reader-controlled.

## 4. Sources and image metadata

```tsx
const sources = [{
  url: "https://example.com/reference",
  title: "Example reference",
  sourceType: "page" as const,
  fetchedAt: "2026-10-23T00:00:00Z",
  publishedAt: "2026-10-01",
  excerpt: "Replace this example with an excerpt actually supplied by your source.",
}];

<ProjectAgentAnswer
  markdown={markdown}
  sources={sources}
  showSources
  resolveImage={(path) => host.resolveAuthorizedImage(path)}
  images={{
    "outputs/figure.png": {
      size: "reference",
      caption: "Describe what the reader should notice.",
      width: 900,
      height: 500,
      source: { url: "https://example.com/figure", label: "Example attribution" },
    },
  }}
/>
```

The values above are examples. `url`, `title`, `sourceType`, and `fetchedAt` are required source fields; `sourceType` is `page` or `search`. `query`, `publishedAt`, and `excerpt` are optional. The renderer does not invent publication dates, fetch excerpts, rank source reliability, or verify a claim against a link.

In `links="auto"`, a descriptive link without matching supplied source metadata stays a normal link; known sources and citation-style links use compact source controls. `links="citations"` selects the historical citation-oriented behavior. The source list deduplicates eligible URLs and excludes unsafe URLs; it does not add new references.

Mouse hover opens a source preview after a short delay; moving into the preview keeps it open. Passive previews do not move keyboard focus on opening or closing. Clicking the chip pins an already visible preview instead of toggling it shut, and focuses its source link. Keyboard and touch activation retain the normal click interaction; Escape/outside dismissal follows the popover's focus behavior.

Image keys use the **original Markdown image path**. `inline` images fit a smaller illustration slot; `reference` is the larger default. Width/height metadata reserves aspect-ratio space when both are known. Captions and source links stay available if an image fails. Zoom changes the displayed dimensions, with scroll access to the enlarged content, reset, keyboard controls, and a source link in the viewer. The host must return authorized URLs for local files.

## 5. Writing blocks and saving

A fenced `agent-doc` contains optional `title: ...` metadata on its first line followed by Markdown. The inline card preserves the full draft and provides copying, Markdown download, and an expanded reader.

```tsx
import { ProjectAgentDocumentCard } from "../src";

<ProjectAgentDocumentCard
  source={documentFenceSource}
  onSave={async ({ originalSource, title, body }) => {
    await host.persistDocumentEdit({
      messageId, originalSource, title, body,
    });
  }}
/>
```

For Markdown-rendered blocks, pass the equivalent adapter through `ProjectAgentAnswer.onDocumentSave` or the fourth argument of `createProjectAgentMarkdownComponents`.

The exact change shape is `{ originalSource: string; title: string; body: string }`. `originalSource` is the owning fence content, not the whole answer. The host should locate that fence in the correct message/version, reject an ambiguous or stale update, persist it, and update the rendered source. When `title` is empty, omit the optional title header while serializing the replacement.

The exported `replacePresentationFence(markdown, language, originalSource, replacementSource)` can prepare that replacement. It requires exactly one matching completed fence, preserves its container/info string and line-ending style, and enlarges its delimiters when the replacement contains fence markers. It throws for missing, incomplete or ambiguous blocks. It only returns updated Markdown; the host must still persist it. The conversation demo uses it for both writing and code saves.

There is no edit button without `onSave`. Editing supports title/body fields, Markdown preview, save/cancel/reset and keyboard submission. The block reports success only after the callback resolves. Failed saves retain the draft. Source changes during editing are surfaced as a conflict rather than silently overwriting the new source. Drafts are transient component state until confirmed by the host; there is no localStorage or server persistence layer in this package.

Raw HTML is skipped in both the draft view and its preview. Markdown download saves text, not executable markup.

The inline body, expanded reader and edit preview have separate Markdown scopes for headings/footnotes. Nested content in a writing block does not inherit the outer answer's save callbacks, preventing an inner fence from being mistaken for the owning response's editable block.

## 6. Code editing and previews

```tsx
import { ProjectAgentCodeBlock } from "../src";

<ProjectAgentCodeBlock
  language="json"
  code={code}
  streaming={isStreaming}
  onSave={(change) => host.persistCodeEdit({ messageId, ...change })}
  renderPreview={({ code: source, language }) => {
    if (language !== "json") return null;
    try { return <pre>{JSON.stringify(JSON.parse(source), null, 2)}</pre>; }
    catch { return <p>The JSON is incomplete or invalid.</p>; }
  }}
/>
```

`onSave` receives `{ originalCode: string; language: string; code: string }` and returns `void | Promise<void>`. The host owns persistence and the owning message/version. If repeated identical fences make the target ambiguous, resolve the block identity in your application or reject the edit. The component waits for confirmation, keeps rejected drafts retryable, detects source conflicts, and disables editing while code is streaming.

For code fences inside an answer, use the equivalent `ProjectAgentAnswer.onCodeSave` and `ProjectAgentAnswer.renderCodePreview` props. `ProjectAgentMessage` forwards these answer props as well. Custom Markdown hosts place them in the provider's `options` object.

`renderPreview` receives `{ code: string; language: string }` and returns a React node. A Code/Preview switch appears only when this adapter exists. A null/unsupported result or render error produces an unavailable state while the source remains accessible. The JSON example above uses data parsing and escaped React text only.

This package does **not** evaluate code, run Python, install packages, create an iframe sandbox, grant network access, or sanitize arbitrary host renderers. Supply trusted preview components or your application's independently managed sandbox; never feed untrusted source into `eval`, `new Function`, or an unrestricted HTML execution surface merely to implement a preview button.

Even without these adapters, code supports copying, plain-text download, wrapping, line numbers, long-snippet disclosure and enlargement. Unknown languages degrade to readable source. Completed code uses deferred highlighting; streaming content stays readable without pretending a partial snippet is ready to execute.

## 7. Streaming and failure behavior

Use `status` when the host distinguishes success, interruption, and errors. A boolean `streaming` alone cannot distinguish a stopped response from a completed one.

`prepareStreamingPresentation` preserves ordinary prose and ordinary code as they arrive. An unclosed `agent-ui`, `agent-doc`, or Mermaid fence is withheld until a matching closing fence arrives. A partial opening fence line is withheld because its eventual language is not yet known. This policy also preserves the readable prefix when a response stops or fails.

The complete state renders supplied content normally. If the producer ends with malformed structured content, repair it in the host or show the available fallback; the renderer cannot reconstruct a missing explanation. The host should pass the true error detail rather than allowing a loading state to continue indefinitely.

Optional math and visual renderer failures leave readable source/explanation available. Charts reject invalid numerical observations rather than substituting zero. Pie charts and unplottable ranges expose their supplied data. Table exports preserve formula-like strings as text. Copy/download failures have visible or live-region feedback instead of a false success toast.

## 8. Styling, parsing and performance

`ProjectAgentAnswer` supports GFM and lazy KaTeX. `$...$` is inline math and `$$` on separate lines is display math. Escape literal currency signs as `\$`; code spans and fences remain literal. Raw HTML is skipped. Mermaid uses its strict renderer configuration.

When using your own Markdown pipeline, keep the exported component map stable and update its metadata through the provider:

```tsx
import {
  ProjectAgentMarkdownProvider, projectAgentMarkdownComponents,
} from "../src";

<div className="agent-answer">
  <ProjectAgentMarkdownProvider
    sources={sources}
    resolveImage={resolveImage}
    images={images}
    options={{ links: "auto", headingIdPrefix: answerId, streaming: isStreaming, onDocumentSave,
      onCodeSave, renderCodePreview }}
  >
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}
      remarkRehypeOptions={{ clobberPrefix: `${answerId}-content-` }}
      components={projectAgentMarkdownComponents}>
      {safeStreamingMarkdown}
    </ReactMarkdown>
  </ProjectAgentMarkdownProvider>
</div>
```

Here `safeStreamingMarkdown` comes from your streaming policy or `prepareStreamingPresentation(markdown).text`. `ReactMarkdown`, `remarkGfm`, and the host adapters are imported/provided by the host. Add math plugins/styles explicitly if your custom pipeline needs math, and use unique heading/footnote scopes for each Markdown instance. The high-level `ProjectAgentAnswer` supplies its own scoping and streaming policy.

For per-block code status in a custom pipeline, pass `streamingCodeStartLine: stream.codeStartLine ?? null` in `options`, where `stream` is the helper result for the Markdown actually being rendered. If normalization adds/removes lines, recalculate this value after normalization. The line number is one-based. `null` means no open ordinary-code fence; omitting the option retains the legacy behavior that applies `streaming` to all code blocks. The high-level answer already forwards this distinction.

The legacy factory remains `createProjectAgentMarkdownComponents(sources, resolveImage, images, options)`. Memoize that result with stable dependencies. Recreating its map produces new React component types and can reset interactive state; use the provider and stable map for frequently changing source metadata, callbacks and streaming flags.

Presentation CSS uses host variables: `--agent-presentation-background`, `--agent-presentation-muted-background`, `--agent-presentation-foreground`, `--agent-presentation-muted`, `--agent-presentation-border`, `--agent-presentation-focus`, `--agent-presentation-width`, and `--agent-presentation-font-size`. Transcript width can use `--agent-transcript-width`. The `.dark` ancestor supplies default dark colors; keep theme tokens available to portal content as well.

Math, charts, Mermaid and syntax highlighting are deferred. The high-level answer keeps one Markdown renderer while loading math plugins, preserving readable notation and existing controls; a failed plugin load exposes a retry action. No bundle-size or frame-rate claim has been measured for this upgrade. Follow the local handoff to review lazy loading, real scrolling behavior, viewport edges, keyboard paths and actual exports.

## 9. Scope and public reference

The package can approximate documented response surfaces while remaining provider-neutral. It cannot establish parity for ChatGPT's model decisions, private component compiler, source retrieval, execution services, memory, projects, sharing, speech or persistence.

The design references are [Intelligent UI](https://openai.com/index/gpt-6-for-everyone/), [writing and code blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt), [source interactions](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt), and [release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes). Their available features vary by product/account and rollout. They support feature-oriented review, not a claim of exact visual matching or complete product parity.

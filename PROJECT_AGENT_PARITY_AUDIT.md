# Project Agent / ChatGPT Projects parity review — 2026-10-24

Branch: `gpt/full-project-agent`. Source snapshot only: host auth, MongoDB, Dify/workflow and sandbox deployment are not reproduced in this repository. **This pass intentionally did not run tests, builds, CI or signed-in browser QA.** These changes are not production-verified.

Reference: [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt) and [Project-only memory](https://help.openai.com/en/articles/8590148-memory-in-chatgpt). These documents describe a product reference, not an assertion of implementation parity.

## Inspected domains

| Domain | Present in snapshot | Remaining differences / acceptance boundary |
| --- | --- | --- |
| Project shell | Project workspace, instructions, files/sources, chat list, sharing, move/pin/rename, memoryMode controls | Host permission and responsive UX need browser audit; cross-app Google Drive/Slack connector parity is not implemented here |
| Chat lifecycle | Project Agent conversation view, attachments, queue, stop, steering, feedback, reply, generated files, preview | Reopen/sync now pages older conversations but needs multi-user and long-history host QA |
| Memory and retrieval | Shared Project chat context, Project Agent work, project knowledge and optional default-memory gating | Retrieval is lexical and bounded, **not** a semantic global memory engine; relevance scoring may miss synonyms |
| Artifacts | PDF/Office rich files, saved deliverables, source previews, visual checks, runtime/workspace integration | Real backend, file persistence, rendering, provider behavior and Office API need integration QA |
| Tools/research | Runtime actions and ordinary Dify SSE bridge, web tools, data/code, scripts, built-in skills | Ordinary Dify workflow must pass current `query` to the model; no native provider tool registration is added; deep research workflow and online connector parity remain partial |
| Safety | Project access checks in API, disabled-tool guidance, bounded calculator/source reads | End-to-end authorization, prompt injection, tenant boundaries and shared-project behavior require host verification |
| Presentation | Markdown/math/charts, attachments, interactive response blocks, project chat UX | Visual and accessibility parity is not established by source review |

## Changes in this pass

1. **Relevant Project history**: Project chat excerpts and earlier Agent results now score overlapping meaningful words from the current request. Recent history remains a fallback for follow-ups. Excerpts retain chat identity and the latest turns. Ranking is purely local and stays within already-authorized Project data; no new provider or vector search is required.
2. **Older Agent context**: prior Agent tasks are sampled from up to three existing cursor pages (60 tasks) rather than only the newest 20; the actual prompt still includes at most eight capped results.
3. **Project chat browser**: the Project home list now supports explicit “Load older Agent chats” using the existing server cursor; changing project or search cancels stale requests and resets paging.
4. **Long conversation view**: the active conversation polls the newest page while retaining previously fetched pages. Opening an older chat performs a bounded one-time scan (up to six older pages); “Load earlier messages” can page further without repeating the scan on every 1.5s refresh.
5. **Answer policy by intent**: avoid requiring five to ten publishers for elementary questions or forcing diagrams/tables on every topic. Keep sources actually inspected and appropriately strong source verification for time-sensitive and deep research. This changes model guidance, not its provider.

## Boundaries and follow-up QA

- The Project Agent task endpoint already implements cursor search/pagination; no new Mongo query contract is required. The sidebar intentionally remains a recent-chat shortcut; the Project home is the older-history browser.
- Pagination spans tasks rather than conversation groups; cross-page grouping merges records by stable conversation ID. Very old chats may require manually loading additional pages. For a large database, a dedicated conversation-filtered Mongo query would avoid scanning unrelated tasks when reopening a very old chat.
- Project-only memory restriction already exists in `loadDefaultMemoryContext`: it checks owner, `memoryMode === DEFAULT`, `hasShared` and `projectHasSharing` before importing personal chats. This pass preserves that boundary.
- No client state schema, project access service, remote provider, credentials, storage schema, Dify workflow or tool permissions were changed.
- **Not executed**: focused unit regressions, host TypeScript, line guard, browser flows, real remote Dify, large-history performance, shared member visibility and CI. Regression source for relevance was added but deliberately not run.
- Before shipping: test 100+ task chats and search navigation, long chat opens while new task completes, owner/CHAT collaborator access and project-only memory, SSE calculator with actual Dify workflow, file read-back, mobile scrolling, stopped task handling, and multi-tab concurrency.

## Next highest-value work

P0: Run host QA for history refresh and Dify bridge, then add a conversation-specific indexed Mongo read endpoint if cursor scanning proves costly. P1: source provenance and citation affordances across uploaded and connected files; source-backed answer verification and long-memory relevance; project settings and permissions UX. P2: provider/app connectors, richer multimodal voice/project workflows and full accessibility/performance parity. No feature is claimed complete solely because its UI entry point exists.

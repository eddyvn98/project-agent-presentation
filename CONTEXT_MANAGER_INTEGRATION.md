# Context-output management for Project Agent

Integration branch: `gpt/full-project-agent`. This is an **original app-hosted implementation inspired by ideas in** [mksglu/context-mode](https://github.com/mksglu/context-mode). It does **not** vendor that project's Elastic-2.0 source code or add its MCP/SQLite dependencies.

## Why

Previously the sandbox shell returned a clipped 12,000-character result to the runtime. Once clipped, content outside the excerpt was unavailable. The app now retains the **captured** output in host-private, per-Project/per-chat storage and gives the model a compact preview with an opaque reference, rather than silently dropping everything in the middle.

## Action protocol

The sandbox runtime advertises two new read-only actions:

```json
{"action":"search_output","id":"out_<20 lowercase hexadecimal characters>","query":"error","limit":5}
{"action":"read_output","id":"out_<20 lowercase hexadecimal characters>","offset":0,"length":4000}
```

- Inputs are validated in `runtime/actions.ts`. Search is literal case-insensitive matching and returns character offsets and excerpts; read returns an exact character slice (at most 7,000 characters). These are not arbitrary file paths or shell commands.
- When a tool observation exceeds 8,000 UTF-8 bytes, the host saves a redacted copy and returns a preview with a real ID and the number of bytes retained vs returned. Other outcomes still pass through; native Office/image sources and tool-result metadata remain on their existing paths.
- Captured shell output is separated from the previously clipped 12,000-character display. The underlying Docker command has a 16 MiB process-output buffer. An upstream buffer overflow is marked explicitly; **captured** is not a guarantee that unlimited process output exists. Host storage limits each capture to 8 MiB and labels incomplete captures.
- Other large app-hosted tool observations are captured when returned through the standard runtime action loop. A native Dify tool running entirely inside remote Dify is **not** intercepted by this change.
- Any failed output-store write produces an explicit truncated-output warning rather than a fake retrievable ID.

## Checkpoint and metrics

After each ordinary runtime action, the lead agent writes a bounded host-side checkpoint containing the task ID, step, action kind, status, redacted observation excerpt, and any visible output ID. Context compact and lost-conversation recovery append this evidence to the fresh request. These are execution observations, **not independent verification** that a generated answer is correct.

Runtime metrics now include `context_captures`, `context_kept_bytes` and `context_returned_bytes`. These measure output-volume reduction at the transport boundary, **not model token savings**. Sub-agent observations can be externalized before returning to the lead.

## Storage and security

Storage lives under `data/project-agent/context-outputs/<sha256(projectId,chatId)>` outside the mounted `/work` sandbox. Filenames are random output IDs; directory permissions are 0700 and files are 0600. Secret-redaction is applied to both the returned preview and stored content **before persistence**, including sub-agent output. Existing `withPolicy` checks remain in place.

Retrieval always derives storage scope from the authorized running task's Project and chat, never from model-supplied paths. Expired output is unreadable after seven days. Up to 32 text captures are retained per scope; an opportunistic hourly cleanup prunes abandoned scopes. Deleting a Project Agent chat via the existing task-store deletion path removes its output scope. Checkpoint file is stored in the same scope.

The storage is **local to the Next.js host filesystem**, not durable across changing containers or multiple web replicas without a shared volume or a host storage adapter. Do not deploy it to ephemeral/serverless storage expecting durable cross-instance retrieval. Host storage encryption/retention policy and access audit still need deployment review.

## Compatibility boundary

- No changes to remote Dify workflow, API keys, installed Python runtimes or imported `context-mode` plugins.
- The ordinary-Dify calculator bridge and source-reading continuations retain their existing contracts. Remote Dify tools are opaque to the host; full interception would require moving tool dispatch onto the application side or modifying the remote workflow.
- The existing Project knowledge BM25/vector search is kept intact. This is an output/history layer, not a replacement knowledge database.
- Every new source file remains under 300 lines.

## Focused QA pending (intentionally not executed in this pass)

1. Run `npm run test:agent` in a clean snapshot and host TypeScript/build checks.
2. Run `tests/agent/context-output-store.test.ts` for isolation, redaction, search/read, action validation, checkpoints and deletion.
3. Replay authenticated browser runtime: long shell logs (>12 KB), output references, searching middle-only errors, model compact/restart, cancellation and multiple chat scopes.
4. Confirm Office/image and large-PDF read-back paths still work with the new wrapper; verify disabled-tool groups and reviewer mode.
5. QA concurrent writers, volume mounts, retention and privacy boundaries in the real host. Compare prompt tokens and answer correctness against a baseline before claiming savings.

**No tests, CI or production smoke runs were executed in this change**, per the user's temporary hold on testing.

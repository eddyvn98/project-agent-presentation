# UI-TARS Desktop + SuperSplat adaptation (opt-in)

## Decision and source inspection

- **UI-TARS Desktop / Agent TARS** ([repository](https://github.com/bytedance/UI-TARS-desktop),
  Apache-2.0) uses a model/operator abstraction with screenshot- and
  coordinate-based GUI actions; Agent TARS also supports a DOM + GUI
  browser strategy and action/event streams. Our existing Project
  Agent already has Playwright, DOM refs, visual fallback, owner-only
  Browser Watch, P8 maker/checker, approvals and Stop fencing. Replacing
  those components with a second control runtime risks duplicate
  sessions, approvals and conflicting browser ownership. **Do not
  install their Electron app, nut-js operator or VLM model here.**
- **SuperSplat** ([repository](https://github.com/playcanvas/supersplat),
  MIT) is a browser-based Gaussian-splat editor, not a general slide
  renderer. It offers native browser WebMCP tools, notably
  `get_scene`, camera control, selection, transform and export. The
  upstream `docs/webmcp.md` describes **24 tools**; WebMCP needs
  experimental browser support and is NOT a universal MCP server.
  Standalone HTML/ZIP viewer export is available.
- No third-party source has been copied, no extra runtime package
  was installed, and no additional model/API keys are required.

## Implemented: safer screenshot coordinates (UI-TARS principle)

`visual.ts` now records viewport width/height, device pixel ratio
(DPR), browser visual zoom and scroll with each masked screenshot.
`visual_click` rejects a frame if any value has changed since
observation. Points still use normalized 0..1 coordinates in the
**CSS viewport** and cannot bypass the existing sensitive-control,
irreversible-action or approval checks. This is an improvement to the
existing visual fallback, not computer-wide control or a new model.

## Implemented: read-only SuperSplat scene inspection

Browser Agent supports exactly one new action:

```json
{"action":"browser","op":"inspect_scene"}
```

The runtime runs only the current tab's native WebMCP `get_scene`
tool with an empty argument object; it never forwards a model-supplied
tool name, mutation schema or arbitrary script to WebMCP.
Host must explicitly enable it:

```bash
export PROJECT_AGENT_BROWSER_WEBMCP_READONLY=1
export PROJECT_AGENT_BROWSER_WEBMCP_ORIGINS=https://superspl.at
```

**Default OFF.** Origin allowlisting accepts only exact HTTPS origins
(or explicitly configured loopback HTTP origins), no credentials or
arbitrary URLs. Browser Watch and policy hooks remain active; output
is capped at 8000 characters, labeled *untrusted web page data* and
does not count as a P8 no-progress action. Native feature unavailable,
tool missing, timeout or `ok:false` fails visibly. Page-side tool
implementations can still change independently; only allow trusted
origins and never interpret the scene read as goal completion.

This is a **read-only adapter**, not a bridge for all 24 tools:
`delete_selection`, import/export, camera and editing operations
are deliberately not exposed. No hidden browser feature flags or
experimental WebMCP shim are installed. On ordinary Chromium
without native WebMCP, the tool reports unavailable and the agent
can still use DOM/visual observation.

## Implemented: optional interactive 3D viewer in chat

A complete host-provided standalone viewer can appear as an opt-in
rich block between paragraphs:

```agent-ui
{"type":"scene3d","title":"Reconstructed lobby","caption":"Synthetic 3D Gaussian splat","viewerUrl":"/api/projects/qa-demo/agent/files/lobby.html"}
```

The parser accepts only a bounded **same-origin authenticated
Project-file HTML path**; external URLs, embedded credentials,
queries, fragments, traversal and other file types are rejected.
Even a valid block remains **inert by default**: the host must
explicitly pass `enable3DViewer={true}` to `ProjectAgentAnswer`
(or `ProjectAgentRichBlock`) after verifying its authenticated
viewer-serving route and strict CSP. No host opt-in means a quiet
visual fallback, not an iframe. The HTML is not loaded until the user clicks `Open 3D viewer`.
The iframe uses `sandbox="allow-scripts"` (NO
`allow-same-origin`, forms, top-navigation or popups) and
`referrerPolicy="no-referrer"`; closing unmounts the iframe.

Example app-side usage after QA:

```tsx
<ProjectAgentAnswer
  markdown={answer}
  enable3DViewer={safeViewerHostRouteConfigured}
/>
```

**Host dependency / security contract:** This repository implements
the presentation component, **not** a new file-serving backend, scene
exporter or GPU renderer. The host must explicitly validate asset
ownership and serve a **self-contained** exported HTML viewer from
an authenticated Project-file route with strict headers, including
`Content-Security-Policy: sandbox allow-scripts`,
`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`
and appropriate framing restrictions. The response-side CSP sandbox
matters even for direct navigation outside the embedding iframe;
never serve arbitrary executable user HTML at the privileged app
origin without response-side sandboxing. If the host lacks that
safe route, do not produce `scene3d` blocks; use a source link or
static screenshot. Opaque origin can prevent fetching external
assets, hence the requirement for a standalone self-contained viewer.

This is NOT native PLY/SOG/SPZ rendering in React; SuperSplat or
another tool must first export the standalone viewer, and a real
host browser must verify it. No public online SuperSplat account or
uploads are required.

## Tests and exact acceptance

```bash
npm run test:inspiration:agent
npm run test:inspiration:presentation
npx tsc --noEmit
npm run check:lines
git diff --check
```

The focused source tests cover viewport/DPR/zoom/scroll invalidation,
normalized coordinates, strict scene origin allowlisting, read-only
native tool choice, fail-closed unsupported/errors, disabled no-progress
accounting, internal 3D viewer URL policy, click-to-load, and iframe
sandbox attributes.

**Not proved by source tests:** functioning native WebMCP on a
supported Chrome build, loading a real SuperSplat exported scene,
host CSP response policy, Playwright screenshot coordinate fidelity
on live pages, Dify/Entra production or any multi-worker crash recovery.

## Integration boundary and rollout

Port source files into the isolated AI-WEB-CHAT QA worktree. First run
focused source tests. Validate visual frame invalidation using a synthetic
resizable page, and validate `scene3d` with a locally served synthetic
self-contained WebGL/HTML viewer and verified CSP headers. Optionally
run `inspect_scene` in a disposable WebMCP-enabled browser profile
on a controlled SuperSplat scene. Record exact origin, browser flags,
runtime SHA, network scope and observed PASS/FAIL/SKIP. The QA must
remain separate from P8/G1 acceptance; **P8 development accepted, G2
crash/recovery remains OPEN**, and production release is not approved.

No CI, main/staging changes, real external actions or PR/merge
are required for the source implementation.

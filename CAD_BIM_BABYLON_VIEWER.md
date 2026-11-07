# CAD/BIM Babylon.js viewer — focused integration (2026-11-07)

## Scope
- The exported `design-<12-hex>.web.html` now embeds the **actual exported GLB** and uses Babylon.js UMD + GLB loader (both pinned to 9.28.0) rather than Three.js.
- Mobile-focused viewer offers 3D orbit, top-down orthographic **2D plan view**, Fit, wall visibility and model-element picking. The renderer uses the viewer device GPU, not the 8-core host.
- GLB nodes have semantic names for floor, walls and labeled furniture. This is **inspection**, not direct in-canvas BIM authoring.
- Existing source JSON, PDF, DXF, GLB, optional IFC and design_edit remain unchanged and continue to be separately downloadable.
- Generated filenames use 12 contiguous hexadecimal digits so the existing handoff/edition validators accept newly generated designs.
- PNG preview selects colors by **glTF material name** rather than numeric mesh position; unknown materials get a fallback color.

## Trust and operational constraints
- Rendered HTML is kept in an opaque-origin sandbox with the existing interactive HTML CSP: no cookies, parent DOM, project API, external connect-src or remote model URLs.
- The GLB is embedded inline as a base64 data URI. Library scripts are fetched from version-pinned jsDelivr URLs, so initial viewer load requires Internet access and the host CSP already permits jsDelivr. For production, bundle/self-host the audited JS bundles and adjust CSP after review.
- This is a concept model, **not construction-ready CAD or native Revit**. IFC output still depends on IfcOpenShell in the sandbox. The old rendered artifacts remain unchanged; new exports use the new viewer.
- Do not auto-merge/deploy into the AI-WEB-CHAT host without signed-in authorization QA, physical Android GPU QA and Revit/AutoCAD opening checks.

## Focused validation
- `npm run typecheck && npm run check:lines`
- `npx vitest run --config vitest.agent.config.ts tests/agent/headless-design.test.ts tests/agent/headless-design-edit.test.ts tests/agent/mobile-design-handoff.test.ts tests/agent/mobile-capture-review.test.tsx`
- `npx playwright test --config playwright.agent-ui.config.ts tests/agent-ui-browser/design-handoff.spec.mjs`
- Test new and revised exports in the host preview: 2D/3D switch, rotate/pinch, Fit, Walls, selected node labels, orientation, dimensions, mobile fullscreen and iframe CSP behavior.
- Confirm viewer behaves sensibly without WebGL and with CDN blocked (PDF/GLB remain available), and that old Three.js exports still open.

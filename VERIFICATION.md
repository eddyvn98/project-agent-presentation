# Presentation upgrade verification

Verified on 2026-10-23 from the `gpt/presentation-upgrade` working tree, based on main commit `a6c20251e646a3cdb5be8eebaa50cbeba7774a83`.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed, zero TypeScript errors; includes source, demo, tests and tooling configs |
| `npm test` | 25 passed in 1 test file |
| `npm run check:lines` | Passed: all source/demo/test files under 300 lines |
| `npm run build:demo` | Passed; both synthetic SVG assets confirmed in `dist/demo/` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/presentation-chromium npm run test:e2e` | 12 passed: 6 scenarios × desktop and mobile; 8.6 seconds |
| `git diff --check` | Passed |

Browser execution used packaged Chromium 153.0.8010.0 with Playwright 1.64.1. The default Playwright browser download returned an invalid/truncated archive in this session, so the checks used a temporary npm-packaged Chromium executable. That executable and its dependency are not part of the repository. CI installs the regular Playwright Chromium build; CI results are separate from these locally executed checks.

Browser scenarios assert math and hierarchy, bounded image widths/no document overflow, actual image zoom dimensions and Escape/focus return, all eight explorer states plus legible enlarged labels, successful Mermaid rendering and real zoom, compact citation viewport bounds/focus, and image/visual failure fallbacks. Desktop viewport: 1280×720; mobile: Pixel 7, 393×727. Visual review also covered the mobile answer and image dialog; explorer previews were adjusted to fit the column and place readable labels below the scene.

Component coverage includes untrusted HTML/URLs and TeX macros, literal code, accessible MathML, caption/source metadata, local-image adapters, malformed filenames, missing/non-numeric/non-finite chart data, genuine zeros, optional-block recovery, a simulated visual render exception and keyboard citation access.

The demo build emits a warning about chunks over 500 kB from the rendering dependencies. No provider/backend integrations, real scientific datasets or real external-source claims were introduced. Main was not merged or modified.

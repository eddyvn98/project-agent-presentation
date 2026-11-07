# CAD/BIM P0 release acceptance — real host / physical phone

**Never use customer Projects or production credentials for these checks.** Keep PR #29 Draft until all applicable gates below are evidenced. The automated CI jobs cover unit/fuzz, real Chromium/Python exporter, IFC and **real MongoDB persisted archive with a fresh process**. This file covers only host-local and hardware checks not available in that CI.

## One-command signed-in host API acceptance (requires isolated QA Project)

This reuses `playwright.host.config.ts` and its existing login-state/security restrictions. It **does mutate the isolated QA Project** by approving and archiving a completed design, so use a disposable QA task and verify you are on the QA host.

Required environment:

- `P7_HOST_BASE_URL`: localhost Next.js host origin (for example `http://127.0.0.1:3005`)
- `P7_PROJECT_ID`: disposable QA Project id
- `P7_OWNER_STORAGE_STATE`: existing Playwright owner-login JSON
- `P7_NONMEMBER_STORAGE_STATE`: existing nonmember-login JSON
- `CAD_QA_TASK_ID`: completed QA design task id (`pat_...`)
- `CAD_QA_SOURCE_FILE_ID`: source `.design.json` task-file UUID (not the CAD file name)

Run from the full AI-WEB-CHAT host checkout **after syncing this branch**:

```sh
npm run check:host:p7
npx playwright test --config playwright.host.config.ts tests/host-browser/cad-archive.api.spec.ts --project=host-api
```

The test fails (never skips or fakes success) when authentication or prerequisites are missing. It checks owner vs nonmember access, owner-only approval, byte-bound SHA-256, persistent archive listing, exact download integrity for each actual file, and idempotent save retry. It does **not** substitute for full Dify end-to-end task creation.

## Real phone and signed-in app acceptance (manual)

1. On the isolated QA host, sign in as Project owner. Ask AI to generate an interior concept from a small room prompt/photo. Check the **real output** includes PDF, DXF, GLB, source JSON, and optionally IFC.
2. In the viewer on an **actual Android phone**, orbit, pinch to zoom, switch 2D/3D, select a specific element, and toggle walls. Confirm no blank canvas or browser console error; capture device model/browser version.
3. Open **Edit on floor plan**. Drag one furniture item with a finger; resize it, reset, then attempt a move that causes a furniture/door collision. Confirm AI flags it and the human-review gate blocks release.
4. Use **Auto-fix layout · preview only**. Verify AI proposal changes the correct item without deleting furniture or silently overwriting original JSON. Approve only after inspecting dimensions.
5. Submit an explicit `design_edit`. Confirm new PDF/DXF/GLB/JSON are regenerated and the old attachments remain byte-for-byte unchanged.
6. Sign in as Project owner, click **Approve release** then **Save approved CAD/BIM bundle to Project**. Verify the archive appears in **Saved CAD/BIM versions** with downloadable files.
7. Close chat and browser, restart the Next.js host and worker, reopen the same Project in a **new chat** and use **Ask AI to revise this saved version**. Check the generated revision has a different source SHA-256 and requires **new** human approval.
8. Sign in as a nonmember. Try the archive listing and every archived download URL; all must return 401/403/404. If the Project has a member role, verify they cannot approve owner-only release.
9. Try two tabs editing the same source. Each revision must be a new immutable version; concurrent identical saves must return the same archive ID. Changed files must never reuse an earlier approval.
10. Test unsupported device / blocked CDN / WebGL unavailable: PDF/GLB downloads remain available and the user receives an explicit viewer error.

### Capture in QA report

Record: host commit, task/project IDs (redacted in shared report), device/browser version, screenshots, actual generated filenames/checksums, signed-in auth outcomes, and Playwright report. Clean up disposable QA Project only after evidence is retained.

## Release conditions

- Host's MongoDB must persist `projectAgentDesignApprovals`, `projectAgentCadArchives`, and `projectAgentCadChunks` between restarts and must have a durable backup policy.
- CAD binary store is isolated from Knowledge text indexing. A failed partial archive must never appear as a released version; SHA mismatch must stop download.
- Publishing is owner-authorized, bound to the current source checksum, and restricted to a completed design task.
- Do not enable 300-employee rollout until multiworker stress, file retention/capacity, cleanup, monitoring and rollback are measured on the actual deployment.
- CAD/BIM exports remain conceptual and require professional measurement/code compliance review before construction.

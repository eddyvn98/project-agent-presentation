# P8 owner-only active Chromium host closeout (Next.js 14.2.16)

**Host synthetic acceptance CLOSED, based on local-agent report dated 2026-10-25.**
The previous `409: Agent has not opened a browser session yet` fixture
blocker was resolved in the isolated Next 14 host closeout; it was not
established as a product defect. L2 and L1 each passed 1/1. This file
remains the reproducible runbook, not a production approval.
See [P8 status and outstanding gates](P8_STATUS.md) for exact provenance.

Host integration was reported on `AI-WEB-CHAT` branch
`feat/project-agent-local-business`: P8 code `4aec99a4`,
status/index `ca65a8e104664536216183d8bfd102f730ea9376`,
from Presentation source `8ae555e541cd2fc596b543ffb850254166f79e32`.
P7+P8 focused 115 PASS / 1 SKIP; P8 guard/session 8/8 PASS;
TypeScript, Mongo schema and line/diff checks PASS.
Local QA reports synthetic data and environments were removed afterward.
These are operator-reported results and were not independently rerun here.

## Design

- P7 synthetic `POST /agent/p7-qa` with `kind=p8_browser` creates ONLY
  a QA task record in Mongo (`status=running`). No Dify, runner or browser
  starts in this API route.
- **The actual authenticated `/tasks/{taskId}/browser/control` POST route**
  owns the `qa_prepare` action. It opens a real Chromium session,
  loads the existing CSP-restricted P7 HTML via `page.setContent`,
  captures a masked JPEG and returns a synthetic click point. A QA-only
  context router denies all outbound web requests; the closeout requires
  `networkAttempts=0` through prepare, takeover and handback.
- QA session is registered in a process-local bridge to survive separate
  Next route module instances in the **same** OS process. Browser Watch,
  takeover control and P8 numeric loop state use process-global maps, still
  owner-protected by existing HTTP route authorization. No disk/profile
  export, no credentials, no external page navigation or network requests.
- New `qa_step` **click** invokes the actual `runBrowserAction`, then
  P8's independent DOM progress checker. `no_progress` deliberately
  returns a synthetic no-op without changing DOM to exercise L1/L2
  decisions; it is NOT counted as successfully completing a browser task.
- **Real** `takeover`, normalized screenshot `click`, `release` and
  the final resumed DOM click still use the existing `humanBrowserOperation`
  path, not a mocked control endpoint.
- Three-minute one-shot fixture TTL with cleanup. Explicit `qa_cleanup`
  and P7 DELETE remove only that synthetic task, Browser Watch frames,
  Chromium session, control state and P8 loop state.
- No cross-process session sharing: on a multi-OS-process host the QA
  closeout should FAIL rather than silently create a new, untracked
  browser. Do not mistake this local QA bridge for production multi-host
  agent sessions.

## Required isolated host process

Run from a disposable AI-WEB-CHAT QA clone with its own Mongo/PostgreSQL
and synthetic login setup; **never** the active dev host on port 3004.
Keep **one Next.js QA server instance** at the chosen origin (3005 or 3006).
Warm relevant routes *before* starting active-session tests to avoid Next
dev recompilation replacing modules while testing.

Server environment (example: port 3006):

```bash
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_P7_QA_FIXTURE=1
PROJECT_AGENT_P7_QA_PROJECT_ID=YOUR_SYNTHETIC_QA_PROJECT_ID
PROJECT_AGENT_P8_LOOP=1
PROJECT_AGENT_P8_LOOP_REPORT_ONLY=0
PROJECT_AGENT_P8_QA_SESSION=1
P8_QA_ISOLATED_HOST=1
P8_QA_ALLOWED_ORIGIN=http://127.0.0.1:3006
```

Never put a real Dify/Entra key in the test host. The test fixture is
network-free and does not start a model worker. Only the exact
`[P7_SYNTHETIC_QA] p8 browser fixture - local synthetic data only`
task is allowed. Normal employee tasks are rejected. Both browser
control and task creation require exact local Origin and synthetic owner.

## QA terminal: owner and nonmember with valid synthetic NextAuth

```bash
export P7_ISOLATED_QA=1
export P7_HOST_BASE_URL=http://127.0.0.1:3006
export P7_PROJECT_ID=YOUR_SYNTHETIC_QA_PROJECT_ID
export P7_OWNER_STORAGE_STATE=/secure/path/owner.json
export P7_OWNER_EMAIL=owner@project-agent.test
export P7_NONMEMBER_STORAGE_STATE=/secure/path/nonmember.json
export P7_OTHER_EMAIL=nonmember@project-agent.test
export P8_QA_ISOLATED_HOST=1
export P8_QA_ALLOW_CLOSEOUT=1
export P8_QA_ALLOWED_ORIGIN=$P7_HOST_BASE_URL
export P8_QA_EXPECT_REPORT_ONLY=0

npm run test:p8:qa:unit
npm run test:p8:unit
npx tsc --noEmit
npm run check:lines
git diff --check

npm run test:host:p8:closeout
```

The closeout command validates **both real synthetic NextAuth sessions**
against `/api/auth/session` before allowing any mutation. It creates the
task itself, runs checks, cleans the fixture in `finally`, and does not
touch other QA tasks. The owner must see 200/JPEG/loop, while nonmember
must receive 404 for Watch, image and control. The same Next process must
retain the Chromium session through takeover, manual click, release and
resumed agent click. Expect a final counter of 3.

### Report-only comparison (L1)

To validate the L1 no-block behavior, **restart only the isolated QA
server** with `PROJECT_AGENT_P8_LOOP_REPORT_ONLY=1`, set
`P8_QA_EXPECT_REPORT_ONLY=1` in the terminal, and rerun
`npm run test:host:p8:closeout`. Four no-progress synthetic attempts
must be observed but **not blocked**. In L2, the fourth is blocked and
human takeover is possible. Do not change `process.env` of a running
shared host to switch modes; doing so would invalidate the evidence.

## Failure interpretation

- 403 on `qa_prepare`: exact Origin, synthetic owner/Project, dev flags
  or task marker missing. Never disable owner checks to bypass it.
- 409 `Agent has not opened a browser session yet`: either active-session
  bridge is missing in the host port or traffic is split across OS
  processes. Inspect one-process QA topology and compile/load order first.
- 200 fixture probe but browser GET has no loop/Watch: state maps are
  duplicated between route bundles/processes. Verify global bridge port
  and avoid hot reloading while running.
- 404 for nonmember is correct. An owner 404 means QA authentication,
  Project membership or task ownership is wrong.
- Before concluding the model stalled, distinguish the artificial
  `no_progress` checker case from a real DOM action.
- A pass here proves the **synthetic browser/control path**, not
  real Dify execution, semantic goal completion, multi-worker recovery
  or production readiness.

Report commit SHA for Presentation and integrated host,
Next version, Chromium version, exact PASS/FAIL/SKIP and whether cleanup
left the isolated QA database/project empty. Stop only QA instances and
delete only synthetic data. The operator reports that P8 was already pushed
to the non-release host integration branch. **Do not initiate additional CI,
PR/merge, staging, production actions or external services for this closeout.**

**Evidence precision:** the fixture's `pid` property is Node/Next
`process.pid`, not Chromium's operating-system PID. `networkAttempts=0`
covers requests intercepted from the QA browser context; it is not an
OS-level audit of all outbound traffic.

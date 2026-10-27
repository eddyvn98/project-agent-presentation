# L5B / L9B / L10 automated QA

**L5B**: Chromium Playwright measures DOM node count, JS heap, initial render time, expansion time and heap across three reloads for 5,000 synthetic turns at 390px and 1280px. The browser stores JSON metrics in the l5b-ui-performance artifact. These are intentionally loose CI safety ceilings, not production performance SLAs.

**L9B**: Hindsight and XERJ hostile text attempts to close reference tags or inject a fake system role. The runtime checkpoint is escaped as inert text before insertion in an agent prompt, and source adapters use escaped references. This verifies string and scope boundaries; it cannot prove that an actual LLM never obeys a persuasive attack.

**L10**: 96 accelerated lease cycles represent 48 hours of virtual time, running eight chat scopes on multiple MongoDB connections. Tests abandoned leases, recovery after expiry, Stop fencing, stale completions, checkpoint retention and client reconnect. It is not a 48-hour wall-clock soak and does not use a real model or Next.js host.

**NOT RUN** in this environment: L6 real Dify memory recall, L3C/host full acceptance, multi-hour wall-clock soak, production RAM/CPU measurements.
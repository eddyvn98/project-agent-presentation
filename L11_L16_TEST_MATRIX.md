# L11-L16 QA acceptance

| Test | Coverage that can run in Presentation CI | Deliberately not claimed |
|---|---|---|
| L11 Crash consistency | Real isolated Mongo, before-commit failures, lost acknowledgement, idempotent checkpoint replay, compaction single-publish, fail-closed delete | Real payment/browser side effects and real host kill mid-transaction |
| L12 Isolation fuzz | 20 synthetic owners over 5 Projects, 800 writes and competing compaction scopes | Identity-provider authorization or actual employees |
| L13 Upgrade/migration | Corrupt old checkpoint rejected without mutation; expired record withheld; current schema restored only through explicit cleanup or new write | Full historical Mongo schema migrations and real rollback deployments |
| L14 Adversarial input | Poisoned tool-output boundary escaping, invalid JSON/action parsing and Unicode scope restrictions | Proof that an actual LLM never obeys persuasive text |
| L15 UI regression | 7 reload runs with DOM/heap relative regression bounds on 5,000 synthetic turns | Production FPS and permanent device-specific performance baseline |
| L16 Leak tests | 12 browser-context create/close cycles and 100 file captures + cleanup | Production multi-day process RSS and real Next worker handles |

These QA jobs operate only on isolated CI MongoDB, ephemeral browser contexts and generated synthetic data. Production host and real model E2E are out of scope.
# L17–L22 QA results and limits

| Gate | Executable in Presentation CI | Not claimed |
|---|---|---|
| L17 | Private/special-use IPv4/v6, DNS mixed records, credentialled URLs, redirects and WebSocket restrictions | Real hostile websites or full browser escape exploit |
| L18 | Fragmented UTF-8 SSE, invalid/incomplete/error events, bounded payloads and duplicate tool-progress fencing | Genuine network partition and reconnect with live Dify |
| L19 | 1,000 synthetic scheduled Mongo rows, 8 competing CAS claims per due occurrence, UTC/timezone/DST form checks | Full scheduler production dispatch, Telegram notifications and external agents |
| L20 | AES-256-GCM encrypted file Vault, cross-user scope, revocation including lost master key, bad destinations, file permissions | Real employee tokens or platform-specific keychain integration |
| L21 | BrowserSlotPool fairness, aborted queued tabs, manual takeover/handback, Stop and action rate limits | Shared Steel/CDP multi-tab live host user session |
| L22 | 120 composite Mongo checkpoint+compaction+scheduler cases, Stop and crash-expired lease, cleanup of remaining data | Full Next.js two-host + live model + browser/scheduler integration |

L19 and L22 exercise the exact Mongo CAS data shapes used by the scheduler and core checkpoint/compaction modules. The scheduler queue scenario is synthetic and does not run production dispatchDueSchedules. Test reports are written into the workflow's l19-l22-scheduler-chaos artifact. Environment must be an isolated MongoDB container on 127.0.0.1:27019; the script refuses other destinations and validates its unique database marker before cleanup.
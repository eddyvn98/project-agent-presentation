#!/usr/bin/env node
/** Isolated, restartable model-evaluation worker. Never runs user browser tools. */
import { setTimeout as sleep } from "node:timers/promises";
const origin = process.env.PROJECT_AGENT_SCHEDULER_URL;
const secret = process.env.PROJECT_AGENT_SCHEDULER_SECRET;
const interval = Math.max(60_000, Number(process.env.PROJECT_AGENT_HARNESS_TICK_MS) || 300_000);
if (!origin || !secret || secret.length < 32 ||
  !(/^https:\/\//i.test(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(origin))) {
  process.stderr.write("[harness] HTTPS host origin and 32+ character secret required\n");
  process.exit(1);
}
const endpoint = new URL("/api/internal/project-agent/harness-tick",origin).href;
let live = true;
process.on("SIGINT", () => { live = false; });
process.on("SIGTERM", () => { live = false; });
while(live) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, { method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(570_000) });
    if (!response.ok) process.stderr.write("[harness] HTTP "+response.status+"\n");
    else process.stdout.write("[harness] "+new Date().toISOString()+" "+JSON.stringify(await response.json())+"\n");
  } catch(error) { process.stderr.write("[harness] "+(error instanceof Error?error.message:"request failed")+"\n"); }
  if(live) await sleep(Math.max(1000,interval-(Date.now()-started)));
}

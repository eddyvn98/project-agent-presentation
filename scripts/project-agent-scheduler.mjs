#!/usr/bin/env node
/**
 * Persistent scheduler heartbeat for a deployed Project Agent host.
 * Run under systemd, PM2 or container restart policy; no UI tab is required.
 */
import { setTimeout as sleep } from "node:timers/promises";

const url = process.env.PROJECT_AGENT_SCHEDULER_URL;
const secret = process.env.PROJECT_AGENT_SCHEDULER_SECRET;
const interval = Math.max(15_000, Math.min(300_000, Number(process.env.PROJECT_AGENT_SCHEDULER_TICK_MS) || 60_000));
if (!url || !secret || secret.length < 32 ||
  !(/^https:\/\//i.test(url) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(url))) {
  process.stderr.write("[scheduler] Missing URL or 32+ character secret\n");
  process.exit(1);
}
let running = true;
process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });
const endpoint = new URL("/api/internal/project-agent/schedule-tick", url).href;
while (running) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      process.stderr.write(`[scheduler] Tick refused HTTP ${response.status}\n`);
    } else {
      const result = await response.json();
      process.stdout.write(`[scheduler] ${new Date().toISOString()} ${JSON.stringify(result)}\n`);
    }
  } catch (cause) {
    process.stderr.write(`[scheduler] Tick unavailable: ${cause instanceof Error ? cause.message : "network error"}\n`);
  }
  const remaining = Math.max(1000, interval - (Date.now() - started));
  if (running) await sleep(remaining);
}

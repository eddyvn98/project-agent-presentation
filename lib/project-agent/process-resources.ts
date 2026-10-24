import { browserResourceSnapshot } from "./runtime/browser-agent/session";

/** Process-local capacity telemetry. Never include task ids, users or browsing content. */
export function processAgentResources() {
  const memory = process.memoryUsage();
  return {
    at: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    ...browserResourceSnapshot(),
  };
}

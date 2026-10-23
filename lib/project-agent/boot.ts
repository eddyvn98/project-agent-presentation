import { randomUUID } from "node:crypto";

const state = globalThis as typeof globalThis & { __projectAgentBoot?: { id: string; running: Map<string, Promise<void>> } };
state.__projectAgentBoot ??= { id: randomUUID(), running: new Map() };
/** Identifies this server process (kept across dev hot reloads) so tasks left running by an earlier process can be told apart. */
export const PROJECT_AGENT_BOOT_ID = state.__projectAgentBoot.id;
export const runningProjectAgentTasks = state.__projectAgentBoot.running;

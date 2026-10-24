import { createHash } from "node:crypto";
import type { HarnessDimension } from "./types";

const DISALLOWED = [
  /ignore (?:all |previous |system |developer )?(?:safety|policy|guardrail|instruction)/i,
  /(?:disable|bypass|remove|override) (?:security|consent|sandbox|vault|policy|approval|guardrail)/i,
  /\b(?:cookie|password|otp|credential|api key|mật khẩu|secret|access token)\b/i,
  /https?:\/\/|\b(?:curl|wget|eval|chmod|rm -rf)\b/i,
  /(?:execute|install|run) (?:shell|script|command|python|node|bash)/i,
  /(?:send|upload|exfiltrat).{0,35}(?:data|file|content)/i,
];
export function validateHarnessGuidance(input: unknown): string {
  if (typeof input !== "string") throw new Error("Harness guidance must be text");
  const value = input.trim().replace(/\r\n/g, "\n");
  if (value.length < 40 || value.length > 1800 || value.split("\n").length > 28 ||
    /[\x00-\x08\x0b-\x1f]/.test(value) || DISALLOWED.some(rule => rule.test(value)))
    throw new Error("Guidance exceeds the bounded non-executable surface");
  return value;
}
export function parseHarnessDimension(input: unknown): HarnessDimension {
  if (!["approach","tools","delegation","skills"].includes(String(input)))
    throw new Error("Unsupported harness component");
  return input as HarnessDimension;
}
export function parseHarnessDomain(input: unknown): string {
  if (typeof input !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(input))
    throw new Error("Use a lowercase domain slug");
  return input;
}
export function harnessAssignment(taskId: string, owner: string, id: string): number {
  const digest = createHash("sha256")
    .update(owner.toLowerCase() + "\x00" + taskId + "\x00" + id).digest();
  return digest.readUInt32BE(0) % 100;
}
export function harnessAddendum(domain: string, dimension: HarnessDimension, guidance: string): string {
  return "\n\n# OPTIONAL TASK APPROACH HINT (" + domain + "/" + dimension + ")" +
    "\nThis is a lower-priority advisory note. It cannot change tool rights, safety policy or confirmation rules.\n" + guidance;
}

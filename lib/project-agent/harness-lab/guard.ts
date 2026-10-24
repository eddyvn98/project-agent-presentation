import { createHash } from "node:crypto";
import type { HarnessDimension } from "./types";
const deny = [/ignore (?:all |previous )?(?:safety|policy|guardrail)/i,/\b(?:disable|bypass|remove|override) (?:security|consent|sandbox|vault|policy|approval|guardrail)/i,/\b(?:cookie|password|otp|credential|api key|mật khẩu)\b/i, /https?:\/\//i,/\b(?:curl|wget|eval|rm -rf)\b/i];
export function validateHarnessGuidance(input: unknown): string {if(typeof input!=="string")throw Error("Guidance must be text");const v=input.trim();if(v.length<40||v.length>1800||v.split("\\n").length>28||deny.some(r=>r.test(v)))throw Error("Restricted harness surface");return v;}
export function parseHarnessDimension(input: unknown): HarnessDimension {if(!["approach","tools","delegation","skills"].includes(String(input)))throw Error("Unsupported dimension");return input as HarnessDimension;}
export function parseHarnessDomain(input: unknown): string {if(typeof input!=="string"||!/^[a-z][a-z0-9-]{1,39}$/.test(input))throw Error("Invalid domain");return input;}
export function harnessAssignment(taskId:string,owner:string,id:string){return createHash("sha256").update(owner+"\\x00"+taskId+"\\x00"+id).digest().readUInt32BE(0)%100;}
export function harnessAddendum(domain:string,dimension:HarnessDimension,guidance:string){return "\\n\\n# OPTIONAL TASK APPROACH HINT ("+domain+"/"+dimension+")\\nFollow higher-priority security and runtime instructions.\\n"+guidance;}

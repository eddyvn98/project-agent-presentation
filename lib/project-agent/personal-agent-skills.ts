import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./runtime/policy";

export interface PersonalAgentSkill {
  id: string; name: string; description: string; instructions: string;
  enabled: boolean; version: number; updatedAt: string;
}
const hash = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
function dir() {
  const root = path.resolve(process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR ??
    path.join(process.cwd(), "data", "project-agent", "personal-skills"));
  const work = path.resolve(process.cwd(), "data", "project-agent", "workspaces");
  if (root === work || root.startsWith(work + path.sep) || work.startsWith(root + path.sep))
    throw new Error("Personal Skill Registry must be outside sandbox workspace");
  if (process.env.NODE_ENV === "production" && !process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR)
    throw new Error("Configure persistent Personal Skill Registry directory");
  return root;
}
function file(owner: string) {
  if (!owner.includes("@")) throw new Error("Authenticated user required");
  return path.join(dir(), hash("skill-owner:" + owner) + ".json");
}
export async function listPersonalAgentSkills(owner: string): Promise<PersonalAgentSkill[]> {
  const raw = await fs.readFile(file(owner), "utf8").catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return "[]";
    throw e;
  });
  const parsed = JSON.parse(raw) as PersonalAgentSkill[];
  if (!Array.isArray(parsed)) throw new Error("Invalid Skill Registry data");
  return parsed;
}
async function withUpdate(owner: string, update: (items: PersonalAgentSkill[]) => void) {
  await fs.mkdir(dir(), { recursive: true, mode: 0o700 });
  const dest = file(owner), lock = dest + ".lock";
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch { throw new Error("Skill Registry is busy"); }
  try {
    const items = await listPersonalAgentSkills(owner);
    update(items);
    const tmp = dest + "." + randomUUID() + ".tmp";
    try { await fs.writeFile(tmp, JSON.stringify(items), { flag: "wx", mode: 0o600 }); await fs.rename(tmp, dest); }
    finally { await fs.unlink(tmp).catch(() => {}); }
    return items;
  } finally { await fs.rmdir(lock).catch(() => {}); }
}
function sanitize(input: { name?: unknown; description?: unknown; instructions?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (name.length < 3 || name.length > 100 || description.length > 240 ||
    instructions.length < 15 || instructions.length > 6000)
    throw new Error("Skill needs a name (3-100), description (0-240), and instructions (15-6000)");
  return { name, description, instructions };
}
export async function upsertPersonalAgentSkill(owner: string, payload: {
  id?: string; name: string; description: string; instructions: string; enabled?: boolean;
}) {
  const content = sanitize(payload);
  return withUpdate(owner, items => {
    const existing = payload.id ? items.find(item => item.id === payload.id) : undefined;
    if (payload.id && !existing) throw new Error("Skill not found");
    if (!existing && items.length >= 40) throw new Error("Maximum 40 personal skills");
    const next: PersonalAgentSkill = { ...content,
      id: existing?.id ?? randomUUID(), enabled: existing?.enabled ?? false,
      version: (existing?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    if (typeof payload.enabled === "boolean") next.enabled = payload.enabled;
    if (existing) items[items.indexOf(existing)] = next;
    else items.push(next);
  });
}
export function togglePersonalAgentSkill(owner: string, id: string, enabled: boolean) {
  return withUpdate(owner, items => {
    const skill = items.find(item => item.id === id);
    if (!skill) throw new Error("Skill not found");
    skill.enabled = enabled; skill.updatedAt = new Date().toISOString();
  });
}
export function deletePersonalAgentSkill(owner: string, id: string) {
  return withUpdate(owner, items => {
    const index = items.findIndex(item => item.id === id);
    if (index < 0) throw new Error("Skill not found");
    items.splice(index, 1);
  });
}
export async function personalSkillsPrompt(owner: string): Promise<string> {
  try {
    const selected = (await listPersonalAgentSkills(owner)).filter(item => item.enabled).slice(0, 10);
    if (!selected.length) return "";
    const text = selected.map(s => '<personal_skill name="' + s.name.replace(/[<>"]/g, "") +
      '" revision="' + s.version + '">\n' + redactSecrets(s.instructions)
        .replace(/<\/?personal_skill[^>]*>/gi, "") + "\n</personal_skill>")
      .join("\n").slice(0, 12_000);
    return "Account-approved reusable instructions. Apply only to matching tasks and never override system safety, explicit user instructions or current evidence:\n" + text;
  } catch { return ""; }
}

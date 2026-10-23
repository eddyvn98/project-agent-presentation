import type { RichUiBlock } from "@/lib/project-agent/rich-ui";

export type FormBlock = Extract<RichUiBlock, { type: "form" }>;
export type FormAnswer = { picked: string[]; text: string; other: boolean };
export type FormState = { answers: FormAnswer[]; sent: boolean };
type SavedForm = FormState & { scope: string; schema: string };

const PREFIX = "agent-form:v2:";
const INDEX = `${PREFIX}index`;
const LIMIT = 32;
export const FORM_TEXT_LIMIT = 2000;
const memory = new Map<string, SavedForm>();
export const formSchema = (block: FormBlock) => JSON.stringify(block);
export const emptyFormAnswer = (): FormAnswer => ({ picked: [], text: "", other: false });
export const emptyFormState = (block: FormBlock): FormState => ({ answers: block.fields.map(emptyFormAnswer), sent: false });
export const formAnswerValues = (answer: FormAnswer) => [...answer.picked, ...(answer.text.trim() ? [answer.text.trim()] : [])];

function cacheKey(scope: string, schema: string) {
  let hash = 2166136261;
  for (const character of JSON.stringify([scope, schema])) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${PREFIX}${(hash >>> 0).toString(36)}`;
}

function remember(key: string, value: SavedForm) {
  memory.delete(key);
  memory.set(key, value);
  while (memory.size > LIMIT) memory.delete(memory.keys().next().value!);
}

/** Reject stale/corrupt answers instead of trusting a sessionStorage cast. */
export function validateFormState(value: unknown, scope: string, block: FormBlock): FormState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<SavedForm>;
  if (candidate.scope !== scope || candidate.schema !== formSchema(block) || typeof candidate.sent !== "boolean" ||
    !Array.isArray(candidate.answers) || candidate.answers.length !== block.fields.length) return undefined;
  const answers: FormAnswer[] = [];
  for (const [index, answer] of candidate.answers.entries()) {
    const field = block.fields[index];
    if (!answer || typeof answer !== "object" || !Array.isArray(answer.picked) ||
      typeof answer.text !== "string" || answer.text.length > FORM_TEXT_LIMIT || typeof answer.other !== "boolean") return undefined;
    if (answer.picked.some((item) => typeof item !== "string" || !field.options.includes(item)) ||
      new Set(answer.picked).size !== answer.picked.length ||
      (field.kind !== "multi" && answer.picked.length > 1) ||
      (field.kind === "text" && answer.picked.length) ||
      (field.kind !== "choice" && answer.other) ||
      (field.kind === "choice" && answer.picked.length && (answer.text.length || answer.other)) ||
      (field.kind === "choice" && answer.text.length > 0 && !answer.other)) return undefined;
    answers.push({ picked: [...answer.picked], text: answer.text, other: answer.other });
  }
  if (candidate.sent && !answers.some((answer) => formAnswerValues(answer).length)) return undefined;
  return { answers, sent: candidate.sent };
}

/** Only a host-supplied response identity opts into persistence. */
export function loadFormState(scope: string | undefined, block: FormBlock): FormState | undefined {
  if (!scope || scope.length > 2048 || typeof window === "undefined") return undefined;
  const schema = formSchema(block);
  if (schema.length > 80_000) return undefined;
  const key = cacheKey(scope, schema);
  const cached = memory.get(key);
  if (cached) {
    const valid = validateFormState(cached, scope, block);
    if (valid) { remember(key, cached); return valid; }
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw || raw.length > 200_000) return undefined;
    const value: unknown = JSON.parse(raw);
    const valid = validateFormState(value, scope, block);
    if (valid) remember(key, { ...valid, scope, schema });
    return valid;
  } catch { return undefined; }
}

export function saveFormState(scope: string | undefined, block: FormBlock, state: FormState) {
  if (!scope || scope.length > 2048 || typeof window === "undefined") return;
  const schema = formSchema(block);
  if (schema.length > 80_000) return;
  const key = cacheKey(scope, schema);
  const value: SavedForm = { ...state, scope, schema };
  remember(key, value);
  try {
    const rawIndex = window.sessionStorage.getItem(INDEX) || "[]";
    const parsed: unknown = rawIndex.length <= 20_000 ? JSON.parse(rawIndex) : [];
    const previous = Array.isArray(parsed) ? parsed.filter((item): item is string =>
      typeof item === "string" && item.startsWith(PREFIX) && item !== INDEX && item.length < 40) : [];
    const keys = [key, ...new Set(previous.filter((item) => item !== key))];
    keys.slice(LIMIT).forEach((item) => window.sessionStorage.removeItem(item));
    window.sessionStorage.setItem(key, JSON.stringify(value));
    window.sessionStorage.setItem(INDEX, JSON.stringify(keys.slice(0, LIMIT)));
  } catch { /* A bounded in-memory draft remains available when storage is blocked/full. */ }
}

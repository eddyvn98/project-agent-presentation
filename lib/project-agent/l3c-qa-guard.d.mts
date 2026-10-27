export interface L3cQaContext {
  env?: Record<string, string | undefined>; projectId: string; chatId: string;
  owner: string; caller: string; projectName: string; method: string;
  originHeader: string | null; origin: string;
}
export function l3cQaAllowed(value: L3cQaContext): boolean;

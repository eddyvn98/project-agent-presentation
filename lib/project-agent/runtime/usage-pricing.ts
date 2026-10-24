export interface TokenPrice { inputPerMillion: number; outputPerMillion: number }
function table(): Record<string, TokenPrice> {
  try {
    const parsed = JSON.parse(process.env.PROJECT_AGENT_MODEL_PRICING_JSON ?? "{}") as Record<string, TokenPrice>;
    return Object.fromEntries(Object.entries(parsed).filter(([key, item]) =>
      /^[a-z0-9._/-]{1,100}$/i.test(key) && item &&
      Number.isFinite(item.inputPerMillion) && Number.isFinite(item.outputPerMillion) &&
      item.inputPerMillion >= 0 && item.outputPerMillion >= 0));
  } catch { return {}; }
}
export function estimatedModelCost(model: string, inputTokens: number, outputTokens: number): number | null {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || inputTokens < 0 || outputTokens < 0) return null;
  const rate = table()[model];
  if (!rate) return null;
  return (inputTokens * rate.inputPerMillion + outputTokens * rate.outputPerMillion) / 1_000_000;
}
export function enforceTaskBudget(inputTokens: number, outputTokens: number, model: string): void {
  const tokenBudget = Number(process.env.PROJECT_AGENT_TASK_MAX_TOKENS ?? 0);
  const limit = Number(process.env.PROJECT_AGENT_TASK_MAX_COST_USD ?? 0);
  if (Number.isFinite(tokenBudget) && tokenBudget > 0 && inputTokens + outputTokens > tokenBudget)
    throw new Error("The task token budget was reached. No more actions will be executed.");
  if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0))
    throw new Error("Invalid model token usage; task cost cannot be verified.");
  const cost = estimatedModelCost(model, inputTokens, outputTokens);
  if (limit > 0 && cost === null && process.env.PROJECT_AGENT_STRICT_COST_BUDGET === "1")
    throw new Error("Model pricing is unknown; strict task cost budget blocks further actions.");
  if (cost !== null && Number.isFinite(limit) && limit > 0 && cost > limit)
    throw new Error("The configured task cost budget was reached. No more actions will be executed.");
}
export function routeModelSelector(query: string): string | undefined {
  if (process.env.PROJECT_AGENT_MODEL_ROUTING !== "1") return undefined;
  const simple = process.env.PROJECT_AGENT_MODEL_SIMPLE_SELECTOR?.trim();
  const complex = process.env.PROJECT_AGENT_MODEL_COMPLEX_SELECTOR?.trim();
  const complexTask = /debug|refactor|repository|architecture|deploy|code review|research|investigat|kiểm thử|kiến trúc|mã nguồn|nghiên cứu|tối ưu/i.test(query);
  const model = complexTask ? complex : simple;
  return model && /^[a-z0-9._/-]{1,80}$/i.test(model) ? model : undefined;
}

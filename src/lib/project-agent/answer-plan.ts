/** Deterministic presentation hints for a host agent; never a substitute for reasoning. */
export type AnswerIntent = "explain" | "debug" | "calculate" | "compare" | "plan" | "write" | "research" | "general";
export type AnswerVisual = "none" | "table" | "chart" | "diagram" | "explorer" | "illustration";
export type AnswerAudience = "child" | "beginner" | "expert" | "general";
export interface AnswerPlan {
  intent: AnswerIntent;
  audience: AnswerAudience;
  visual: AnswerVisual;
  needsSources: boolean;
  needsAssumptions: boolean;
  sections: string[];
  instructions: string[];
}
const match = (text: string, pattern: RegExp) => pattern.test(text);
export function planAgentAnswer(prompt: string, audience?: AnswerAudience): AnswerPlan {
  const text = prompt.slice(0, 6000).toLowerCase();
  const code = match(text, /\b(debug|bug|stack trace|typescript|javascript|code|syntaxerror|typeerror)\b|\b(code|const|function)\s+[a-z_$]|lỗi (code|js|hàm)/);
  const calculation = match(text, /\b(tính|calculate|compute|lãi kép|phần trăm|percent|interest|đơn giá|doanh thu trung bình)\b/);
  const comparison = match(text, /\b(so sánh|compare|versus|vs\.?|đối chiếu)\b/);
  const drafting = match(text, /\b(viết (giúp|hộ|tin nhắn|email|thư)|soạn|draft|rewrite|viết lại)\b/);
  const planning = match(text, /\b(lập kế hoạch|triển khai|roadmap|kế hoạch|plan|architecture)\b/);
  const research = match(text, /\b(nguồn|dẫn chứng|cite|reference|quy chuẩn|luật|regulation|latest|hiện hành)\b/);
  const intent: AnswerIntent = code ? "debug" : calculation ? "calculate" : comparison ? "compare" :
    drafting ? "write" : planning ? "plan" : research ? "research" :
    match(text, /\b(giải thích|vì sao|tại sao|explain|how does|what is)\b/) ? "explain" : "general";
  const detectedAudience = audience ?? (match(text, /lớp [1-9]|học sinh|children|kid/) ? "child" :
    match(text, /người mới|beginner|không chuyên/) ? "beginner" :
    match(text, /chuyên sâu|expert|technical/) ? "expert" : "general");
  const phase = match(text, /pha mặt trăng|moon phase|giai đoạn|eight phases|8 pha|chu kỳ/);
  const physical = match(text, /trái đất|mặt trăng|mặt trời|earth|moon|solar|quỹ đạo|orbit|cấu tạo/);
  const trend = match(text, /xu hướng|trend|theo (ngày|tuần|tháng)|over time|time series/);
  const visual: AnswerVisual = intent === "debug" || intent === "write" ? "none" :
    phase ? "explorer" : physical && intent === "explain" ? "diagram" :
    (intent === "compare" && match(text, /\b(chi phí|giá|cost|feature|tính năng)\b/)) ? "table" :
    (trend && intent !== "general") ? "chart" :
    (intent === "calculate" && match(text, /từng năm|by year|theo năm/)) ? "table" : "none";
  const needsSources = research || match(text, /mới nhất|202[4-9]|hiện tại|theo quy định/);
  const needsAssumptions = ["calculate", "compare", "plan", "research"].includes(intent);
  const sections = intent === "debug" ? ["Cause", "Fix", "Verification"] :
    intent === "calculate" ? ["Formula", "Calculation", "Assumptions"] :
    intent === "compare" ? ["Criteria", "Trade-offs", "Recommendation"] :
    intent === "plan" ? ["Goal", "Steps", "Risks"] : ["Answer", "Explanation"];
  const instructions = [
    "Answer directly in prose; use optional visual blocks only when they teach something the prose cannot.",
    "Keep supplied facts separate from assumptions and unknowns; never fabricate figures, evidence or sources.",
    ...(needsSources ? ["Cite authoritative sources for externally verifiable claims and state uncertainty."] : []),
    ...(visual !== "none" ? [`A ${visual} may help, but omit it if not justified by real data.`] : []),
    ...(detectedAudience === "child" ? ["Use familiar concrete examples, define technical terms and avoid jargon."] : []),
  ];
  return { intent, audience: detectedAudience, visual, needsSources, needsAssumptions, sections, instructions };
}

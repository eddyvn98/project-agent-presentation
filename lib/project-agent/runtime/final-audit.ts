import type { Span } from "./trace";
export interface FinalAuditInput { answer: string; trace: Span[]; attempts: number; workflowStep?: boolean; workflowOutcome?: "complete" | "needs_input"; needsInput?: string; }
const claimedTest = /\b(tests? (?:all )?pass(?:ed)?|build (?:was )?successful|verified in browser|i (?:ran|tested|verified) the)\b|đã (?:kiểm thử|chạy test|test|biên dịch|xác minh trên trình duyệt).{0,35}(?:thành công|pass|đạt)/iu;
const claimedBrowse = /\b(i (?:visited|opened|checked) (?:the )?(?:website|webpage|page)|i searched the web)\b|tôi đã (?:mở|truy cập|tra cứu) (?:website|trang web)/iu;
/** Deterministic check: never claim a test or web verification without tool evidence. */
export function auditFinalAnswer({ answer, trace, attempts, workflowStep, workflowOutcome, needsInput }: FinalAuditInput): string | null {
  if (workflowStep && !((workflowOutcome === "complete" && !needsInput) ||
      (workflowOutcome === "needs_input" && Boolean(needsInput?.trim()))))
    return "Workflow final requires workflowOutcome=complete, or workflowOutcome=needs_input with needsInput question. Do not claim completion while waiting for data.";
  if (attempts > 0) return null;
  const actions = trace.filter(item => item.kind === "action" && item.ok).map(item => item.name);
  if (claimedTest.test(answer) && !actions.some(name => ["shell","browser","render","workspace_apply"].includes(name)))
    return "Your answer claims successful verification without a verification tool. Run a supported tool or explicitly say testing was not performed.";
  if (claimedBrowse.test(answer) && !actions.some(name => ["web_search","web_fetch","browser"].includes(name)))
    return "Your answer claims live web research without browsing evidence. Browse or state that live verification was not performed.";
  return null;
}

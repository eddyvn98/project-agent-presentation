import type { ActivityLanguage } from "./activity-language";

export type TaskIssueKind = "review" | "access" | "loop" | "browser" | "service" | "timeout" | "network";
export interface TaskIssue {
  kind: TaskIssueKind;
  needsReview: boolean;
  canRetryWithoutInspection: boolean;
  message: string;
}
const patterns: Array<[TaskIssueKind, RegExp]> = [
  ["review", /lease (?:was lost|expired|changed)|worker interrupted|external (?:effects|actions?).*review|side effects.*(?:uncertain|review)|(?:incomplete|truncated|broken) (?:Dify |model )?stream|model stream ended without completion|batch may or may not have been saved/i],
  ["access", /\b(?:unauthori[sz]ed|forbidden|permission denied|approval denied|access (?:was )?removed|owner mismatch|read.only|origin denied)\b/i],
  ["loop", /kept replying without a valid action|same action was sent|actions failed in a row|two-action cycle|replay was stopped|loop.blocked|used all \d+ steps/i],
  ["browser", /chromium|browser session is closed|browser capacity wait timed out|page (?:crashed|was closed)|target closed/i],
  ["service", /\b(?:502|503|504)\b|bad gateway|gateway time.?out|service unavailable/i],
  ["timeout", /terminated|timed? ?out|took longer|ran out of time/i],
  ["network", /fetch failed|network|ECONNRESET|ECONNREFUSED|socket hang up/i],
];

const english: Record<TaskIssueKind, string> = {
  review: "This task may have changed external data before it stopped. Check the destination and saved results before retrying; repeated actions could duplicate changes.",
  access: "The task needs permission or approval. Check access rights and pending approvals before continuing.",
  loop: "The assistant could not find a useful next step. Press Try again with a different approach or a smaller goal; do not repeat the same action.",
  browser: "The browser session became unavailable. Reopen it, inspect the current page and then continue.",
  service: "The AI service is busy or unreachable right now. Press Try again in a moment after checking whether anything was already saved.",
  timeout: "The task took too long and was stopped. Resume from confirmed results or try a smaller piece first.",
  network: "The connection to the AI service was interrupted. Check existing results before using Try again.",
};
const vietnamese: Record<TaskIssueKind, string> = {
  review: "Tác vụ có thể đã thay đổi dữ liệu bên ngoài trước khi dừng. Hãy kiểm tra kết quả đã lưu rồi mới thử lại để tránh thao tác trùng.",
  access: "Tác vụ cần quyền truy cập hoặc phê duyệt. Hãy kiểm tra quyền và yêu cầu đang chờ trước khi tiếp tục.",
  loop: "Agent chưa tìm được bước xử lý hữu ích. Hãy đổi cách tiếp cận hoặc chia nhỏ mục tiêu, không lặp lại thao tác cũ.",
  browser: "Phiên trình duyệt không còn khả dụng. Hãy mở lại, kiểm tra trang hiện tại rồi mới tiếp tục.",
  service: "Dịch vụ AI đang bận hoặc không kết nối được. Hãy kiểm tra dữ liệu đã lưu trước khi thử lại.",
  timeout: "Tác vụ chạy quá lâu và đã dừng. Hãy tiếp tục từ kết quả đã xác minh hoặc chia nhỏ yêu cầu.",
  network: "Kết nối đến dịch vụ AI bị gián đoạn. Hãy kiểm tra kết quả hiện có trước khi thử lại.",
};
/** Language comes from the user's actual turn; unsupported locale messages fall back to English. */
export function taskIssue(error: string, language: ActivityLanguage = "en"): TaskIssue | null {
  const kind = patterns.find(([, pattern]) => pattern.test(error))?.[0];
  if (!kind) return null;
  return {
    kind,
    needsReview: kind === "review",
    canRetryWithoutInspection: kind === "access" || kind === "loop" || kind === "browser" || kind === "timeout",
    message: (language === "vi" ? vietnamese : english)[kind],
  };
}

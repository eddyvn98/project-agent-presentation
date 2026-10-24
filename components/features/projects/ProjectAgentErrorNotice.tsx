import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { taskIssue } from "@/lib/project-agent/task-issue";

/** Plain-language explanation; unknown failures preserve their original message. */
export function friendlyTaskError(error: string, language: ActivityLanguage = "en"): string | null {
  return taskIssue(error, language)?.message ?? null;
}

export function TaskErrorNotice({ error, cancelled, language = "en" }: {
  error: string; cancelled: boolean; language?: ActivityLanguage;
}) {
  if (error.startsWith("Office visual review failed:")) return <details role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
    <summary className="cursor-pointer px-3 py-2 font-medium">Office visual review failed · show details</summary>
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-amber-200/70 px-3 py-2 text-xs dark:border-amber-900/60">{error.replace(/^Office visual review failed:\s*/i, "")}</pre>
  </details>;
  const issue = cancelled ? null : taskIssue(error, language);
  if (issue) return <div role="alert" data-task-issue={issue.kind}
    className={issue.needsReview
      ? "mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
      : "mt-3 text-red-600"}>
    {issue.needsReview && <p className="mb-1 font-semibold">{language === "vi" ? "Cần kiểm tra trước khi thử lại" : "Review before retrying"}</p>}
    <p>{issue.message}</p>
    <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">{language === "vi" ? "Chi tiết kỹ thuật" : "Technical details"}</summary>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words">{error.slice(0, 2000)}</pre>
    </details>
  </div>;
  return <p role="alert" className={`mt-3 whitespace-pre-wrap ${cancelled ? "text-slate-500" : "text-red-600"}`}>{error}</p>;
}

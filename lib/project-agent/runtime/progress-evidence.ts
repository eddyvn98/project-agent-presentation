/** Evidence from a completed app operation, not from the model's own progress prose. */
export function hasVerifiedMilestone(
  action: { action: string },
  outcome: { text: string; failed?: boolean; image?: unknown; images?: unknown[] },
): boolean {
  if (outcome.failed) return false;
  switch (action.action) {
    case "write_file":
      return /^Wrote .+ \(\d+ characters\)\./.test(outcome.text);
    case "workspace_apply":
      return /^((New board created\. )?Saved [1-9]\d* of \d+ command\(s\);)/.test(outcome.text);
    case "render":
      return outcome.image != null;
    case "generate_image":
      return outcome.image != null || Boolean(outcome.images?.length);
    default:
      return false;
  }
}

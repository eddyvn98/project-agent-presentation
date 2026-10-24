import path from "node:path";
import { harnessOff } from "./harness-flags";
const VISUAL_DELIVERABLE = /\.(docx|pptx|xlsx|pdf)$/i;
const normalized = (file: string) => path.posix.normalize(file.replace(/\\/g, "/").replace(/^\/work\//, "").replace(/^\.\//, ""));

/** Tracks per-file rendering after the latest known workspace mutation. */
export class VerificationGate {
  private seen = new Set<string>();
  private legacyRender = false;
  private nudged = false;
  private changed = true;
  noteMutation() { this.changed = true; this.seen.clear(); this.legacyRender = false; }
  /** Optional path preserves old call sites; runtime supplies the exact rendered file. */
  noteRender(file?: string) {
    this.changed = false;
    if (file) this.seen.add(normalized(file));
    else this.legacyRender = true;
  }
  check(files: string[]): string | null {
    if (harnessOff("verify") || this.nudged) return null;
    const visual = files.filter(file => VISUAL_DELIVERABLE.test(file));
    if (!visual.length || (!this.changed && (this.legacyRender || visual.every(file => this.seen.has(normalized(file))))))
      return null;
    this.nudged = true;
    const missing = visual.filter(file => !this.seen.has(normalized(file)));
    return `Before final: ${this.changed ? "you have not rendered the final deliverables since their last change" : "these deliverables were not individually rendered"}: ${missing.join(", ").slice(0, 700)}. Render every final file, inspect its pages, fix problems, then send final again.`;
  }
}

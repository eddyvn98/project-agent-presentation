import { harnessOff } from "./harness-flags";

const VISUAL_DELIVERABLE = /\.(docx|pptx|xlsx|pdf)$/i;

/** Tracks whether the deliverables were rendered and looked at after the last change; asks for that once before accepting final. */
export class VerificationGate {
	private changedSinceRender = true;
	private rendered = false;
	private nudged = false;
	noteMutation() { this.changedSinceRender = true; }
	noteRender() { this.rendered = true; this.changedSinceRender = false; }
	check(files: string[]): string | null {
		if (harnessOff("verify") || this.nudged || !files.some((file) => VISUAL_DELIVERABLE.test(file))) return null;
		if (this.rendered && !this.changedSinceRender) return null;
		this.nudged = true;
		return `Before final: ${this.rendered ? "you changed files after your last render" : "you have not rendered the deliverable yet"}. Render the final file(s) (render action on each deliverable), look at the pages, fix anything that differs from the request or the template, then send final again. For a template comparison you may delegate a reviewer sub-agent to judge the rendered pages.`;
	}
}

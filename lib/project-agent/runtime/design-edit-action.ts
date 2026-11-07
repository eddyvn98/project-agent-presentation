import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { RuntimeInput } from "./run-agent-types";
import { applyDesignEdits, type DesignEdit } from "./design-edit";
import { runDesignAction } from "./design-action";
import { resolveWorkspacePath } from "./sandbox";
import { readArchivedDesignFile, getDesignArchive } from "../design-archive-store";

const DESIGN_SOURCE = /^outputs\/design-[a-f0-9]{12}\.design\.json$/;
const ARCHIVE_SOURCE = /^archive:(cad_[a-f0-9]{24})$/;
const MAX_MODEL_BYTES = 100_000;

/** Edits only an earlier design source within this chat workspace, preserving the original revision. */
export async function runDesignEditAction(input: RuntimeInput, source: string, edits: DesignEdit[]) {
  if (input.readOnly) return { text: "Reviewers cannot modify designs.", failed: true };
  if (!DESIGN_SOURCE.test(source) && !ARCHIVE_SOURCE.test(source)) return {
    text: "design_edit.source must be an output from this chat or an approved archive:cad_<id> from this Project.",
    failed: true,
  };
  try {
    let bytes: Buffer;
    const archive = ARCHIVE_SOURCE.exec(source);
    if (archive) {
      if (!input.projectId || !input.ownerEmail) return {
        text: "Archived design edits require an authenticated Project task context.", failed: true,
      };
      const stored = await getDesignArchive(input.projectId, input.ownerEmail, archive[1]);
      if (!stored) return { text: "Saved design is unavailable in this Project.", failed: true };
      const file = await readArchivedDesignFile(input.projectId, input.ownerEmail,
        archive[1], stored.sourceName);
      if (!file || !file.archive.sourceSha256 || file.archive.sourceSha256 !== createHash("sha256")
        .update(file.bytes).digest("hex"))
        return { text: "Saved design failed integrity verification.", failed: true };
      bytes = file.bytes;
    } else {
      bytes = await fs.readFile(resolveWorkspacePath(input.chatId, source));
    }
    if (!bytes.length || bytes.length > MAX_MODEL_BYTES)
      return { text: "Design source is empty or exceeds its allowed size.", failed: true };
    const original: unknown = JSON.parse(bytes.toString("utf8"));
    const updated = applyDesignEdits(original, edits);
    if ("error" in updated) return { text: "Design edit rejected: " + updated.error +
      ". The previous version was not modified.", failed: true };
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    input.onStep?.({ tool: "design_edit", detail: edits.length + " bounded edit(s) from saved concept" });
    const generated = await runDesignAction(input, updated.spec, { autoRepair: false });
    if (generated.failed) return generated;
    return {
      ...generated,
      text: "New revision created from " + source + " (source sha256 " + digest + "). " +
        "Original design and its PDF/DXF/GLB/IFC remain unchanged. " + generated.text,
    };
  } catch (cause) {
    return { text: "Design edit failed: " +
      (cause instanceof SyntaxError ? "source JSON is malformed" :
        cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT" ?
          "source design does not exist in this chat" : "unable to read the prior version"),
      failed: true };
  }
}

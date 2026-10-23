import { expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/files", () => ({ inferProjectAgentFileMimeType: vi.fn() }));
import { parseProjectAgentRequestedFiles } from "../../lib/project-agent/task-inputs";
const file = { id: "upload-1", name: "synthetic.txt", mimeType: "text/plain", size: 4 };
it("rejects duplicates and invalid source identifiers instead of downgrading them to uploads", () => {
  expect(parseProjectAgentRequestedFiles([file, file])).toHaveProperty("status", 400);
  for (const projectSourceId of ["", "../../private", {}, 7]) {
    expect(parseProjectAgentRequestedFiles([{ ...file, projectSourceId }])).toHaveProperty("status", 400);
  }
});
it.each(["", "../file", "a/b", "a".repeat(129)])("rejects invalid upload id %s", (id) => {
  expect(parseProjectAgentRequestedFiles([{ ...file, id }])).toHaveProperty("status", 400);
});
it("preserves valid uploaded and source attachments and large PDF handling", () => {
  expect(parseProjectAgentRequestedFiles([file])).toEqual({ files: [file] });
  expect(parseProjectAgentRequestedFiles([{ ...file, projectSourceId: "source-1" }])).toEqual({ files: [{ ...file, projectSourceId: "source-1" }] });
  expect(parseProjectAgentRequestedFiles([{ ...file, name: "synthetic.pdf", mimeType: "application/pdf", size: 200 * 1024 * 1024 }])).toHaveProperty("files");
});
it("retains byte, count and aggregate limits", () => {
  expect(parseProjectAgentRequestedFiles([{ ...file, size: 1.5 }])).toHaveProperty("status", 413);
  expect(parseProjectAgentRequestedFiles(Array.from({ length: 21 }, (_, index) => ({ ...file, id: `upload-${index}` })))).toHaveProperty("status", 413);
  expect(parseProjectAgentRequestedFiles(Array.from({ length: 6 }, (_, index) => ({ ...file, id: `upload-${index}`, size: 100 * 1024 * 1024 })))).toHaveProperty("status", 413);
});

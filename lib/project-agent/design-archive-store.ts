import { createHash } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import type { DesignApprovalRecord } from "./design-approval-store";
import { getDesignApprovalState } from "./design-approval-store";
import { collectDesignHandoffs } from "./design-handoff";
import type { ProjectAgentTaskFile } from "./types";

const CHUNK = 192 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_BUNDLE = 80 * 1024 * 1024;
const NAME = /^design-[a-f0-9]{12}\.(design\.json|pdf|dxf|glb|preview\.png|web\.html|ifc)$/;
const ID = /^cad_[a-f0-9]{24}$/;
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export interface ArchivedDesignFile { name: string; mimeType: string; size: number; sha256: string; chunks: number }
export interface ArchivedDesignVersion {
  id: string; projectId: string; ownerEmail: string; taskId: string; sourceFileId: string;
  sourceName: string; sourceSha256: string; files: ArchivedDesignFile[];
  manifestSha256: string; approvedBy: string; approvedAt: string; createdAt: string;
}
type ArchivedRecord = ArchivedDesignVersion & { _id: string };
type ChunkRecord = { _id: string; payload: string; sha256: string };
export interface ArchiveInputFile { name: string; mimeType: string; bytes: Buffer }
export interface ArchiveInput {
  projectId: string; ownerEmail: string; taskId: string; sourceFileId: string;
  sourceName: string; sourceBytes: Buffer; files: ArchiveInputFile[];
}
function archiveId(input: ArchiveInput, sourceSha: string) {
  return "cad_" + digest([input.projectId, input.taskId, input.sourceFileId, sourceSha].join(":")).slice(0, 24);
}
function chunkId(id: string, fileName: string, index: number) {
  return id + ":" + fileName + ":" + index;
}
function validVersion(id: string) { return ID.test(id); }
function assertBundle(input: ArchiveInput): ArchivedDesignFile[] {
  const sourceMatch = NAME.exec(input.sourceName);
  if (!sourceMatch || sourceMatch[1] !== "design.json") throw Error("Invalid CAD/BIM source file");
  if (input.files.length < 4 || input.files.length > 7) throw Error("Incomplete CAD/BIM file group");
  const matched = collectDesignHandoffs(input.files.map((f, index) => ({
    id: String(index), name: f.name, mimeType: f.mimeType, size: f.bytes.length,
  } as ProjectAgentTaskFile)));
  if (matched.handoffs.length !== 1 || matched.handoffs[0].source.name !== input.sourceName ||
    matched.handoffs[0].files.length !== input.files.length) throw Error("Incomplete or mixed CAD/BIM version");
  let total = 0;
  const names = new Set<string>();
  return input.files.map(file => {
    if (!NAME.test(file.name) || names.has(file.name)) throw Error("Duplicate or unsafe file name");
    names.add(file.name);
    const bytes = file.bytes;
    total += bytes.length;
    if (bytes.length < 1 || bytes.length > MAX_FILE || total > MAX_BUNDLE)
      throw Error("CAD/BIM archive exceeds bounded storage size");
    const type = file.name.split(".").pop();
    if (file.name === input.sourceName && !bytes.equals(input.sourceBytes))
      throw Error("CAD/BIM source bytes changed while archiving");
    if (type === "glb" && (bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.length < 12 || bytes.readUInt32LE(8) !== bytes.length)) throw Error("Corrupt GLB artifact");
    if (type === "pdf" && bytes.toString("ascii", 0, 5) !== "%PDF-") throw Error("Corrupt PDF artifact");
    if (type === "png" && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw Error("Corrupt PNG artifact");
    if (type === "ifc" && !bytes.toString("ascii", 0, 64).startsWith("ISO-10303-21;"))
      throw Error("Corrupt IFC artifact");
    return { name: file.name, mimeType: file.mimeType, size: bytes.length, sha256: digest(bytes),
      chunks: Math.ceil(bytes.length / CHUNK) };
  });
}
function serializeManifest(files: ArchivedDesignFile[], input: ArchiveInput) {
  return digest(JSON.stringify({ sourceName: input.sourceName, sourceSha256: digest(input.sourceBytes), files }));
}
function publicRecord(row: ArchivedRecord): ArchivedDesignVersion {
  const { _id: _discard, ...rest } = row;
  return rest;
}
/** Publish metadata last: partial chunk writes never appear as an available version. */
export async function archiveApprovedDesign(input: ArchiveInput): Promise<ArchivedDesignVersion> {
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!ownerEmail || !input.projectId || !input.taskId || !input.sourceFileId)
    throw Error("Missing archive identity");
  const approval = await getDesignApprovalState({
    projectId: input.projectId, taskId: input.taskId, sourceFileId: input.sourceFileId,
    bytes: input.sourceBytes,
  });
  if ("error" in approval || approval.status !== "approved" || !approval.latest)
    throw Error("A human must approve these exact source bytes before archiving");
  const approved: DesignApprovalRecord = approval.latest;
  if (approved.sha256 !== digest(input.sourceBytes)) throw Error("Approval digest mismatch");
  const files = assertBundle(input);
  const id = archiveId(input, approval.sha256);
  const manifestSha256 = serializeManifest(files, input);
  const db = await getMongoAiDb();
  const archives = db.collection<ArchivedRecord>("projectAgentCadArchives");
  const chunks = db.collection<ChunkRecord>("projectAgentCadChunks");
  const existing = await archives.findOne({ _id: id });
  if (existing) {
    if (existing.manifestSha256 !== manifestSha256 || existing.projectId !== input.projectId)
      throw Error("Conflicting archive retry; source revision already has different artifact bytes");
    return publicRecord(existing);
  }
  for (const file of input.files) {
    for (let index = 0, offset = 0; offset < file.bytes.length; index++, offset += CHUNK) {
      const buffer = file.bytes.subarray(offset, Math.min(offset + CHUNK, file.bytes.length));
      const key = chunkId(id, file.name, index);
      const sha256 = digest(buffer);
      await chunks.updateOne({ _id: key },
        { $setOnInsert: { _id: key, payload: buffer.toString("base64"), sha256 } },
        { upsert: true });
    }
  }
  // Verify the complete bytes before making a version visible to readers.
  for (const file of files) {
    const inputFile = input.files.find(f => f.name === file.name)!;
    const restored = await readChunks(chunks, id, file);
    if (!restored.equals(inputFile.bytes)) throw Error("Archive chunk verification failed: " + file.name);
  }
  const record: ArchivedRecord = {
    _id: id, id, projectId: input.projectId, ownerEmail, taskId: input.taskId,
    sourceFileId: input.sourceFileId, sourceName: input.sourceName,
    sourceSha256: approval.sha256, manifestSha256, files,
    approvedBy: approved.reviewer, approvedAt: approved.decidedAt,
    createdAt: new Date().toISOString(),
  };
  await archives.updateOne({ _id: id }, { $setOnInsert: record }, { upsert: true });
  const stored = await archives.findOne({ _id: id });
  if (!stored || stored.manifestSha256 !== manifestSha256) throw Error("Concurrent archive publication conflict");
  return publicRecord(stored);
}
async function readChunks(chunks: ReturnType<Awaited<ReturnType<typeof getMongoAiDb>>["collection"]>,
  id: string, file: ArchivedDesignFile): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let index = 0; index < file.chunks; index++) {
    const row = await chunks.findOne({ _id: chunkId(id, file.name, index) });
    if (!row || typeof row.payload !== "string") throw Error("Archive chunk is missing");
    const bytes = Buffer.from(row.payload, "base64");
    if (digest(bytes) !== row.sha256 || bytes.length < 1 || bytes.length > CHUNK)
      throw Error("Archive chunk integrity error");
    parts.push(bytes);
  }
  const result = Buffer.concat(parts);
  if (result.length !== file.size || digest(result) !== file.sha256)
    throw Error("Archived file SHA-256 mismatch");
  return result;
}
export async function getDesignArchive(projectId: string, ownerEmail: string, id: string) {
  if (!validVersion(id)) return null;
  const db = await getMongoAiDb();
  const stored = await db.collection<ArchivedRecord>("projectAgentCadArchives").findOne({
    _id: id, projectId, ownerEmail: ownerEmail.toLowerCase(),
  });
  return stored ? publicRecord(stored) : null;
}
export async function listDesignArchives(projectId: string, ownerEmail: string) {
  const db = await getMongoAiDb();
  const records = await db.collection<ArchivedRecord>("projectAgentCadArchives")
    .find({ projectId, ownerEmail: ownerEmail.toLowerCase() })
    .sort({ createdAt: -1, _id: -1 }).limit(50).toArray();
  return records.map(publicRecord);
}
export async function readArchivedDesignFile(projectId: string, ownerEmail: string, id: string, name: string) {
  const archive = await getDesignArchive(projectId, ownerEmail, id);
  if (!archive) return null;
  const file = archive.files.find(f => f.name === name);
  if (!file) return null;
  const db = await getMongoAiDb();
  const bytes = await readChunks(db.collection<ChunkRecord>("projectAgentCadChunks"), id, file);
  return { archive, file, bytes };
}

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { MongoClient } from "mongodb";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fingerprint = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceId = "design-abcdefabcdef";
const context = {
  projectId: "qa_project", taskId: "pat_abcdefabcdef",
  sourceFileId: "abcdefab-1234-4123-abcd-0123456789ab", ownerEmail: "owner@qa.example",
};
const model = {
  title: "Mongo archive test", units: "mm",
  room: { width: 6000, depth: 4500, height: 3000, wallThickness: 150 },
  openings: [], furniture: [{
    kind: "table", label: "Table", x: 3000, y: 2200, width: 900,
    depth: 800, height: 750, rotation: 0,
  }],
};
function fixture() {
  const sourceBytes = Buffer.from(JSON.stringify(model));
  const glb = Buffer.alloc(20);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  const files = [
    { name: sourceId + ".design.json", mimeType: "application/json", bytes: sourceBytes },
    { name: sourceId + ".pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4\ntest") },
    { name: sourceId + ".dxf", mimeType: "image/vnd.dxf", bytes: Buffer.from("0\nSECTION\n0\nEOF") },
    { name: sourceId + ".glb", mimeType: "model/gltf-binary", bytes: glb },
    { name: sourceId + ".preview.png", mimeType: "image/png",
      bytes: Buffer.from([137,80,78,71,13,10,26,10,0,1,2]) },
    { name: sourceId + ".ifc", mimeType: "text/plain", bytes: Buffer.from("ISO-10303-21;\n") },
  ];
  return { ...context, sourceName: sourceId + ".design.json", sourceBytes, files };
}
async function verifyPersistent(bundle, versionId) {
  const app = await import(pathToFileURL(bundle).href);
  try {
    const saved = await app.getDesignArchive(context.projectId, context.ownerEmail, versionId);
    if (!saved || saved.files.length !== fixture().files.length)
      throw Error("Restart lost archived CAD/BIM manifest");
    for (const file of fixture().files) {
      const archived = await app.readArchivedDesignFile(context.projectId,
        context.ownerEmail, versionId, file.name);
      if (!archived || !archived.bytes.equals(file.bytes))
        throw Error("Restart changed archived bytes: " + file.name);
    }
    console.log("MONGO_RESTART_REOPEN_PASS", versionId);
  } finally { await app.closeQaDb(); }
}
if (process.argv[2] === "--verify") {
  await verifyPersistent(process.argv[3], process.argv[4]);
} else {
  if (!process.env.CAD_QA_MONGO_URI) throw Error("Set CAD_QA_MONGO_URI for isolated real-Mongo QA");
  const name = "cad_archive_qa_" + randomBytes(6).toString("hex");
  process.env.CAD_QA_DB = name;
  const temp = await mkdtemp(path.join(root, ".cad-archive-qa-"));
  try {
    const adapter = path.join(temp, "mongo-client.ts");
    const entry = path.join(temp, "entry.ts");
    const bundle = path.join(temp, "bundle.mjs");
    await writeFile(adapter, `import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.CAD_QA_MONGO_URI!);
export async function getMongoAiDb() {
  await client.connect();
  return client.db(process.env.CAD_QA_DB!);
}
export async function closeQaDb() { await client.close(); }
`);
    await writeFile(entry, `export * from "@/lib/project-agent/design-archive-store";
export * from "@/lib/project-agent/design-approval-store";
export { getMongoAiDb, closeQaDb } from "@/services/mongodb/client";
`);
    await build({
      entryPoints: [entry], outfile: bundle, bundle: true,
      platform: "node", format: "esm", target: "node24", external: ["mongodb"],
      plugins: [{ name: "host-alias", setup(b) {
        b.onResolve({ filter: /^@\// }, args => ({
          path: args.path === "@/services/mongodb/client" ? adapter :
            path.join(root, args.path.slice(2)),
        }));
      } }],
    });
    const archive = await import(pathToFileURL(bundle).href);
    try {
      const input = fixture();
      const blocked = await archive.getDesignApprovalState({
        ...context, bytes: input.sourceBytes,
      });
      if (blocked.status !== "awaiting_approval") throw Error("Source unexpectedly approved");
      let rejectedWithoutHuman = false;
      try { await archive.archiveApprovedDesign(input); }
      catch { rejectedWithoutHuman = true; }
      if (!rejectedWithoutHuman) throw Error("Archive bypassed human approval");

      const approval = await archive.decideDesignApproval({
        ...context, bytes: input.sourceBytes, reviewer: "OWNER@QA.EXAMPLE", approve: true,
      });
      if (approval.decision !== "approved") throw Error("Failed to persist human approval");

      const concurrent = await Promise.all(Array.from({ length: 6 }, () =>
        archive.archiveApprovedDesign(input)));
      const versionId = concurrent[0].id;
      if (!concurrent.every(v => v.id === versionId)) throw Error("Concurrent publication diverged");
      const db = await archive.getMongoAiDb();
      if (await db.collection("projectAgentCadArchives").countDocuments({}) !== 1)
        throw Error("Concurrent publication duplicated the manifest");
      if (await archive.getDesignArchive("other-project", context.ownerEmail, versionId))
        throw Error("Cross-project archive access allowed");

      const bad = fixture();
      bad.files[2].bytes = Buffer.from("changed-dxf");
      let conflicting = false;
      try { await archive.archiveApprovedDesign(bad); }
      catch { conflicting = true; }
      if (!conflicting) throw Error("Conflicting retry overwrote an archived file");
      await archive.closeQaDb();

      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url),
        "--verify", bundle, versionId], {
        cwd: root, env: process.env, timeout: 25000, encoding: "utf8",
      });
      if (child.status !== 0) throw Error("Fresh-process reopen failed: " + child.stderr);
      console.log(child.stdout.trim());

      const fromDisk = await import(pathToFileURL(bundle).href + "?reopened=1");
      const restoredDb = await fromDisk.getMongoAiDb();
      const key = versionId + ":" + sourceId + ".glb:0";
      await restoredDb.collection("projectAgentCadChunks").updateOne({ _id: key },
        { $set: { payload: Buffer.from("tampered").toString("base64") } });
      let integrityFailed = false;
      try {
        await fromDisk.readArchivedDesignFile(context.projectId, context.ownerEmail,
          versionId, sourceId + ".glb");
      } catch { integrityFailed = true; }
      if (!integrityFailed) throw Error("Corrupt archived GLB passed integrity validation");
      console.log("MONGO_ARCHIVE_CONCURRENT_RETRY_INTEGRITY_PASS", versionId, fingerprint(input.sourceBytes));
    } finally {
      const cleanup = new MongoClient(process.env.CAD_QA_MONGO_URI);
      try {
        await cleanup.connect();
        await cleanup.db(name).dropDatabase();
      } finally {
        await cleanup.close();
        await archive.closeQaDb().catch(() => undefined);
      }
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
}

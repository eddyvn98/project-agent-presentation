import http from "node:http";
import { MongoClient } from "mongodb";
import { CHECKPOINT_COLLECTION, appendSharedCheckpoint, listSharedCheckpoints,
  deleteSharedCheckpoints } from "../lib/project-agent/runtime/checkpoint-core.mjs";
const url = new URL(process.env.L3B_MONGO_URI ?? "");
const dbName = process.env.L3B_DB ?? "", runId = process.env.L3B_RUN_ID ?? "";
if (process.env.L3B_ISOLATED_QA !== "1" || url.protocol !== "mongodb:" ||
    url.hostname !== "127.0.0.1" || url.port !== "27019" ||
    !["", "/"].includes(url.pathname) || url.username || url.password ||
    url.search || url.hash || !/^l3b_checkpoint_qa_[a-f0-9]{12}$/.test(dbName) ||
    !/^[a-f0-9]{12}$/.test(runId)) throw Error("L3B requires isolated MongoDB");
const client = new MongoClient(url.toString(), { directConnection: true, serverSelectionTimeoutMS: 3000 });
await client.connect();
const db = client.db(dbName);
const marker = await db.collection("l3b_run").findOne({ _id: "marker" });
if (marker?.runId !== runId || marker.purpose !== "l3b_shared_checkpoint_qa") {
  await client.close(); throw Error("L3B run marker mismatch");
}
const coll = db.collection(CHECKPOINT_COLLECTION);
const token = "l3b-" + runId;
const server = http.createServer(async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json",
      "Cache-Control": "private, no-store" });
    res.end(JSON.stringify(data));
  };
  if (req.headers["x-l3b-token"] !== token) return send(403, { error: "denied" });
  const scope = { projectId: String(req.headers["x-project-id"] ?? ""),
    chatId: String(req.headers["x-chat-id"] ?? "") };
  try {
    if (req.method === "GET") return send(200, {
      entries: await listSharedCheckpoints(coll, scope) });
    if (req.method === "DELETE") return send(200, {
      deleted: await deleteSharedCheckpoints(coll, scope) });
    if (req.method !== "POST") return send(405, { error: "method" });
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 5000) return send(413, { error: "large" });
    }
    return send(200, { recorded: await appendSharedCheckpoint(coll, scope, JSON.parse(body)) });
  } catch (err) { return send(400, { error: "invalid checkpoint" }); }
});
server.listen(0, "127.0.0.1", () => {
  process.send?.({ event: "ready", port: server.address().port });
});
process.on("disconnect", () => server.close(() => void client.close()));

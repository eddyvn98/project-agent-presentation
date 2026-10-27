import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

export const newId = () => randomBytes(6).toString("hex");
export const mongoAddress = port => {
  assert.equal(process.env.P2_ISOLATED_QA, "1", "P2 opt-in required");
  assert.ok([27019, 27029].includes(port), "Unexpected QA port");
  const u = new URL(process.env.P2_MONGO_URI || "");
  assert.equal(u.protocol, "mongodb:");
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, String(port));
  assert.ok(["", "/"].includes(u.pathname));
  assert.ok(!u.username && !u.password && !u.search && !u.hash);
  return u.toString();
};
export const connect = (url, timeout = 2500) => new MongoClient(url, {
  directConnection: true, serverSelectionTimeoutMS: timeout,
  connectTimeoutMS: timeout, socketTimeoutMS: timeout,
});
export async function isolatedDb(port, purpose, fn) {
  const url = mongoAddress(port), client = connect(url, 5000);
  const runId = newId(), name = "p2_" + purpose + "_qa_" + runId;
  assert.ok(["fuzz", "outage"].includes(purpose));
  let db, marked = false;
  try {
    await client.connect();
    db = client.db(name);
    assert.equal((await db.listCollections().toArray()).length, 0,
      "Refusing to touch an existing P2 database");
    await db.collection("p2_qa_marker").insertOne({
      _id: "marker", runId, purpose, scope: "project-agent-isolated-p2",
    });
    marked = true;
    return await fn({ db, client, url, runId, name });
  } finally {
    try {
      if (marked) {
        const marker = await db.collection("p2_qa_marker").findOne({ _id: "marker" });
        if (marker?.runId !== runId || marker.purpose !== purpose ||
            marker.scope !== "project-agent-isolated-p2")
          throw Error("QA marker mismatch; database not deleted");
        await db.dropDatabase();
      }
    } finally { await client.close(); }
  }
}

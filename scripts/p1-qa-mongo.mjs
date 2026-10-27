import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

export function qaConnection() {
  assert.equal(process.env.P1_ISOLATED_QA, "1", "Explicit P1 QA opt-in required");
  assert.equal(process.env.P1_MONGO_QA, "1", "Explicit Mongo QA opt-in required");
  const url = new URL(process.env.P1_MONGO_URI || "");
  assert.equal(url.protocol, "mongodb:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "27019");
  assert.ok(["", "/"].includes(url.pathname));
  assert.ok(!url.username && !url.password && !url.search && !url.hash);
  return url.toString();
}
export const newQaId = () => randomBytes(6).toString("hex");

export async function withQaDb(kind, action) {
  const url = qaConnection(), runId = newQaId();
  assert.ok(["stress", "chaos"].includes(kind));
  const name = "p1_" + kind + "_qa_" + runId;
  const client = new MongoClient(url, { directConnection: true, serverSelectionTimeoutMS: 5000 });
  let db, created = false;
  try {
    await client.connect();
    db = client.db(name);
    assert.equal((await db.listCollections().toArray()).length, 0,
      "Refusing to overwrite an existing database");
    await db.collection("p1_test_marker").insertOne({
      _id: "marker", runId, kind, purpose: "isolated_p1_agent_qa",
    });
    created = true;
    return await action({ db, client, runId, name, url });
  } finally {
    try {
      if (created) {
        const marker = await db.collection("p1_test_marker").findOne({ _id: "marker" });
        if (marker?.runId !== runId || marker?.kind !== kind ||
            marker?.purpose !== "isolated_p1_agent_qa")
          throw Error("QA marker changed; refusing database deletion");
        await db.dropDatabase();
      }
    } finally { await client.close(); }
  }
}

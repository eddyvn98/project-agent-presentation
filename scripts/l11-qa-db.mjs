import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

export async function isolatedMemoryQa(purpose, fn) {
  assert.equal(process.env.L11_ISOLATED_QA, "1", "Explicit QA isolation required");
  assert.ok(["l11l13", "l12"].includes(purpose));
  const uri = new URL(process.env.L11_MONGO_URI ?? "");
  assert.ok(uri.protocol === "mongodb:" && uri.hostname === "127.0.0.1" &&
    uri.port === "27019" && ["", "/"].includes(uri.pathname) &&
    !uri.username && !uri.password && !uri.search && !uri.hash,
    "Refusing non-QA MongoDB endpoint");
  const runId = randomBytes(6).toString("hex");
  const name = "l11_" + purpose + "_qa_" + runId;
  const client = new MongoClient(uri.toString(), {
    directConnection: true, serverSelectionTimeoutMS: 4000,
  });
  let db, created = false;
  try {
    await client.connect();
    db = client.db(name);
    assert.equal((await db.listCollections().toArray()).length, 0);
    await db.collection("l11_marker").insertOne({ _id: "marker", runId,
      purpose, scope: "isolated_memory_regression" });
    created = true;
    return await fn({ db, client, runId });
  } finally {
    try {
      if (created) {
        const marker = await db.collection("l11_marker").findOne({ _id: "marker" });
        assert.equal(marker?.runId, runId, "QA marker mismatch: refusing cleanup");
        assert.equal(marker?.purpose, purpose);
        await db.dropDatabase();
      }
    } finally { await client.close(); }
  }
}

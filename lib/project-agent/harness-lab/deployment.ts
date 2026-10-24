import { getMongoAiDb } from "@/services/mongodb/client";
interface Deployment { _id: string; variantId: string; updatedAt: string }
const key = (owner: string, domain: string, dimension: string) =>
  owner.trim().toLowerCase() + ":" + domain + ":" + dimension;
async function collection() {
  const db = await getMongoAiDb();
  return db.collection<Deployment>("projectAgentHarnessDeployments");
}
/** A unique Mongo _id is the cross-worker, cross-request deployment lock. */
export async function reserveHarnessDeployment(owner: string, domain: string,
  dimension: string, variantId: string) {
  const collection = await collection(), _id = key(owner,domain,dimension);
  try {
    const state = await collection.findOneAndUpdate({
      _id, $or: [{ variantId }, { variantId: { $exists: false } }],
    }, { $set: { variantId, updatedAt: new Date().toISOString() } },
    { upsert: true, returnDocument: "after" });
    if (!state || state.variantId !== variantId) throw new Error("A competing canary is deployed");
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new Error("A different harness revision is already deployed in this domain");
    throw error;
  }
}
export async function releaseHarnessDeployment(owner: string, domain: string,
  dimension: string, variantId: string) {
  await (await collection()).deleteOne({
    _id: key(owner,domain,dimension), variantId,
  });
}
export async function isHarnessDeployed(owner: string, domain: string,
  dimension: string, variantId: string) {
  return Boolean(await (await collection()).findOne({
    _id: key(owner,domain,dimension), variantId,
  }));
}

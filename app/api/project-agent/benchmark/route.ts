import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { runIsolatedBrowserBenchmark } from "@/lib/project-agent/benchmark/browser-runner";
import { runModelBrowserBenchmark } from "@/lib/project-agent/benchmark/model-runner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
async function owner(req: NextRequest) {
  const t = await getToken({ req });
  return typeof t?.email === "string" ? t.email.trim().toLowerCase() : "";
}
async function collection() { return (await getMongoAiDb()).collection("projectAgentBrowserBenchmarks"); }
export async function GET(req: NextRequest) {
  const email = await owner(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const rows = await (await collection()).find({ owner: email })
      .sort({ createdAt: -1 }).limit(10).toArray();
    return NextResponse.json({ reports: rows }, { headers });
  } catch { return NextResponse.json({ error: "Benchmark history unavailable" }, { status: 503, headers }); }
}
export async function POST(req: NextRequest) {
  const email = await owner(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try { if (new URL(req.headers.get("origin") || "").origin !== req.nextUrl.origin)
    return NextResponse.json({ error: "Origin denied" }, { status: 403, headers }); }
  catch { return NextResponse.json({ error: "Origin required" }, { status: 403, headers }); }
  if (process.env.PROJECT_AGENT_REALWORLD_BENCHMARK !== "1")
    return NextResponse.json({ error: "Isolated benchmark disabled" }, { status: 409, headers });
  const payload = await req.json().catch(() => null) as { mode?: unknown } | null;
  const mode = payload?.mode === "model" ? "model" : "browser";
  if (mode === "model" && process.env.PROJECT_AGENT_BENCHMARK_MODEL_OPT_IN !== "1")
    return NextResponse.json({ error: "Charged model benchmark disabled" }, { status: 409, headers });
  const db = await getMongoAiDb(), leases = db.collection("projectAgentBrowserBenchmarkLeases");
  const token = randomUUID(), now = new Date(), expiry = new Date(now.getTime() + 300_000);
  const lease = await leases.findOneAndUpdate({
    _id: email, $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
  }, { $set: { token, expiresAt: expiry } }, { upsert: true, returnDocument: "after" })
    .catch(error => { if ((error as { code?: number }).code === 11000) return null; throw error; });
  if (!lease || lease.token !== token)
    return NextResponse.json({ error: "A benchmark is already running for this account" }, { status: 409, headers });
  try {
    const report = mode === "model" ? await runModelBrowserBenchmark(5) :
      await runIsolatedBrowserBenchmark(40);
    await (await collection()).insertOne({ _id: randomUUID(), owner: email,
      createdAt: new Date().toISOString(), mode, report });
    return NextResponse.json({ report, mode }, { headers });
  } catch { return NextResponse.json({ error: "Isolated Chromium benchmark failed" }, { status: 503, headers }); }
  finally { await leases.deleteOne({ _id: email, token }).catch(() => {}); }
}

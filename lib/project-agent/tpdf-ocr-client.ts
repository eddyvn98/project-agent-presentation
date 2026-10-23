import { createHmac, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

type Identity = { email: string; projectId: string };
type OcrJob = { id: string; status: string; error?: string | null };
const MAX_OCR_OUTPUT_BYTES = 1024 * 1024 * 1024;

function config() {
  const base = process.env.TPDF_AGENT_WEB_BASE_URL?.trim().replace(/\/$/, "");
  const secret = process.env.TPDF_AGENT_WEB_BRIDGE_SECRET?.trim();
  if (!base || !secret) throw new Error("TPDF OCR is unavailable: the Agent Web bridge is not configured.");
  const url = new URL(base);
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("TPDF OCR is unavailable: TPDF_AGENT_WEB_BASE_URL must be a plain HTTP(S) service URL.");
  }
  if (secret.length < 32) throw new Error("TPDF OCR is unavailable: the bridge secret is invalid.");
  return { base, secret };
}

function identityToken(identity: Identity, method: string, pathname: string, secret: string) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: "agent-web", aud: "tpdf", email: identity.email,
    projectId: identity.projectId, method, path: pathname,
    iat, exp: iat + 60, jti: randomUUID(),
  })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export type TpdfIdentity = Identity;
export async function request(identity: Identity, path: string, init: RequestInit = {}, timeoutMs = 30_000, signal?: AbortSignal) {
  const { base, secret } = config();
  const method = String(init.method || "GET").toUpperCase();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      "x-tpdf-agent-web-identity": identityToken(identity, method, path.split("?")[0], secret),
    },
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    ...(init.body && typeof init.body !== "string" && !(init.body instanceof Uint8Array)
      ? { duplex: "half" } as RequestInit
      : {}),
  });
  return response;
}

async function assertOk(response: Response) {
  if (response.ok) return;
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json() as { error?: string };
    if (payload.error) message = payload.error;
  } catch { /* Keep status fallback. */ }
  throw new Error(`TPDF OCR failed: ${message}`);
}

async function readJob(response: Response): Promise<OcrJob> {
  await assertOk(response);
  return response.json() as Promise<OcrJob>;
}

async function saveResponsePdf(response: Response, path: string) {
  await assertOk(response);
  if (!response.body) throw new Error("TPDF OCR returned an empty output stream.");
  let received = 0;
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received > MAX_OCR_OUTPUT_BYTES ? new Error("TPDF OCR output exceeded the 1 GiB safety limit.") : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as never), limit, createWriteStream(path, { flags: "wx" }));
  if (!received) throw new Error("TPDF OCR returned an empty PDF.");
}

export async function withTpdfOcrPdf<T>(input: {
  sourcePath?: string;
  sourceBytes?: Uint8Array;
  fileId: string;
  fileName: string;
  identity: Identity;
  language?: string;
  signal?: AbortSignal;
  work: (ocrPdfPath: string) => Promise<T>;
}): Promise<T> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.fileId)) throw new Error("TPDF OCR source reference is invalid.");
  const email = input.identity.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("TPDF OCR requires an authenticated Agent Web user.");
  const projectId = input.identity.projectId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) throw new Error("TPDF OCR requires an Agent Web project.");
  if (!input.sourcePath && !input.sourceBytes) throw new Error("TPDF OCR requires the original PDF bytes.");
  const root = await mkdtemp(join(tmpdir(), "agent-web-tpdf-ocr-"));
  const sourcePath = input.sourcePath || join(root, "source.pdf");
  const outputPath = join(root, "searchable.pdf");
  let jobId = "";
  let completed = false;
  try {
    if (input.sourceBytes) await writeFile(sourcePath, input.sourceBytes, { mode: 0o600 });
    const sourceSize = (await stat(sourcePath)).size;
    if (sourceSize < 5) throw new Error("TPDF OCR source PDF is empty.");
    const created = await readJob(await request(input.identity, "/api/tpdf/ocr/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: input.fileId, language: input.language || "eng+vie" }),
    }, 30_000, input.signal));
    jobId = created.id;
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("TPDF returned an invalid OCR job id.");

    const runResponse = await request(input.identity, `/api/tpdf/ocr/jobs/${jobId}/run`, {
      method: "POST",
      headers: { "content-type": "application/pdf", "content-length": String(sourceSize) },
      body: createReadStream(sourcePath) as unknown as BodyInit,
    }, 30_000, input.signal);
    const started = await readJob(runResponse);
    if (started.status === "failed" || started.status === "cancelled") {
      throw new Error(`TPDF OCR ${started.status}: ${started.error || "no details"}`);
    }

    const deadline = Date.now() + Math.max(60_000, Math.min(Number(process.env.TPDF_AGENT_WEB_OCR_TIMEOUT_MS || 30 * 60_000), 30 * 60_000));
    while (Date.now() < deadline) {
      const job = await readJob(await request(input.identity, `/api/tpdf/ocr/jobs/${jobId}`, {}, 30_000, input.signal));
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(`TPDF OCR ${job.status}: ${job.error || "no details"}`);
      }
      if (job.status === "done") {
        await saveResponsePdf(await request(input.identity, `/api/tpdf/ocr/jobs/${jobId}/output`, {}, 60_000, input.signal), outputPath);
        const result = await input.work(outputPath);
        completed = true;
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("TPDF OCR is still running. Retry the page read after the job finishes.");
  } finally {
    if (jobId && !completed) {
      await request(input.identity, `/api/tpdf/ocr/jobs/${jobId}/cancel`, { method: "POST" }, 5_000).catch(() => {});
    }
    await rm(root, { recursive: true, force: true });
  }
}

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { test, expect, request as newRequest } from "@playwright/test";
import { projectId } from "./qa-helpers";

const vars = ["CAD_QA_TASK_ID", "CAD_QA_SOURCE_FILE_ID", "P7_NONMEMBER_STORAGE_STATE"];
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test.beforeAll(() => {
  const missing = vars.filter(name => !process.env[name]);
  if (missing.length) throw Error(
    "CAD signed-in host acceptance requires " + missing.join(", ") +
    ". Use an isolated QA Project; never run against real customer tasks.");
  if (!existsSync(process.env.P7_NONMEMBER_STORAGE_STATE!))
    throw Error("Nonmember Playwright state file does not exist");
});
test("signed-in Project owner approves, saves, reopens, verifies bytes; nonmember denied", async ({ request, baseURL }) => {
  const p = encodeURIComponent(projectId()), task = encodeURIComponent(process.env.CAD_QA_TASK_ID!);
  const source = encodeURIComponent(process.env.CAD_QA_SOURCE_FILE_ID!);
  const root = "/api/projects/" + p + "/agent";
  const taskRoot = root + "/tasks/" + task;
  const approvalUrl = taskRoot + "/design-approvals/" + source;
  const sourceUrl = taskRoot + "/files/" + source;
  const archiveUrl = root + "/design-archives";
  const origin = new URL(baseURL!).origin;
  const outsiders = await newRequest.newContext({
    baseURL: origin, storageState: process.env.P7_NONMEMBER_STORAGE_STATE,
  });
  try {
    const raw = await request.get(sourceUrl);
    expect(raw.status(), await raw.text()).toBe(200);
    const originalBytes = await raw.body();
    expect(originalBytes.length).toBeGreaterThan(20);
    const state = await request.get(approvalUrl);
    expect(state.status(), await state.text()).toBe(200);
    const body = await state.json() as { sha256: string; status: string; review: { blockers: number } };
    expect(body.sha256).toBe(sha(originalBytes));
    expect(body.review.blockers, "AI geometry warnings must be repaired before approval").toBe(0);

    for (const endpoint of [sourceUrl, approvalUrl, archiveUrl]) {
      const unauthorized = await outsiders.get(endpoint, { failOnStatusCode: false });
      expect([401, 403, 404], "nonmember read blocked: " + endpoint)
        .toContain(unauthorized.status());
    }
    const oldApproval = await outsiders.post(approvalUrl, {
      headers: { Origin: origin }, data: { approve: true, sha256: body.sha256 },
      failOnStatusCode: false,
    });
    expect([401, 403, 404]).toContain(oldApproval.status());

    const approve = await request.post(approvalUrl, {
      headers: { Origin: origin }, data: { approve: true, sha256: body.sha256 },
      failOnStatusCode: false,
    });
    expect(approve.status(), await approve.text()).toBe(201);
    const save = await request.post(sourceUrl + "/save", {
      headers: { Origin: origin }, data: {}, failOnStatusCode: false,
    });
    expect(save.status(), await save.text()).toBe(200);
    const result = await save.json() as { archiveId: string };
    expect(result.archiveId).toMatch(/^cad_[a-f0-9]{24}$/);

    const retry = await request.post(sourceUrl + "/save", {
      headers: { Origin: origin }, data: {}, failOnStatusCode: false,
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json() as { archiveId: string }).archiveId).toBe(result.archiveId);

    const listing = await request.get(archiveUrl);
    expect(listing.status()).toBe(200);
    const { versions } = await listing.json() as { versions: { id: string }[] };
    expect(versions.some(v => v.id === result.archiveId)).toBe(true);

    const detailUrl = archiveUrl + "/" + result.archiveId;
    const detail = await request.get(detailUrl);
    expect(detail.status()).toBe(200);
    const { version } = await detail.json() as {
      version: { files: { name: string; sha256: string; size: number }[]; sourceName: string };
    };
    expect(version.files.length).toBeGreaterThanOrEqual(4);
    for (const file of version.files) {
      const url = detailUrl + "/files/" + encodeURIComponent(file.name);
      const payload = await request.get(url);
      expect(payload.status(), file.name + ": " + await payload.text().catch(() => "")).toBe(200);
      const bytes = await payload.body();
      expect(bytes.length).toBe(file.size);
      expect(sha(bytes)).toBe(file.sha256);
      const outsider = await outsiders.get(url, { failOnStatusCode: false });
      expect([401, 403, 404]).toContain(outsider.status());
    }
    const sourceFile = version.files.find(f => f.name === version.sourceName);
    expect(sourceFile?.sha256).toBe(sha(originalBytes));
    console.log("CAD_HOST_APPROVAL_ARCHIVE_PASS", result.archiveId);
  } finally {
    await outsiders.dispose();
  }
});

import { test, expect, request as http } from "@playwright/test";
import { projectId, taskBase } from "./qa-helpers";

const fixture = () => "/api/projects/" + encodeURIComponent(projectId()) + "/agent/p7-qa";
const header = (origin: string) => ({ Origin: origin });
test("G2 two Next processes: single browser owner, takeover, remote Stop", async ({
  request, baseURL,
}) => {
  test.skip(process.env.G2_QA_ALLOW_CLOSEOUT !== "1",
    "Two isolated Next.js QA processes with common Mongo required");
  const aOrigin = new URL(baseURL!).origin;
  const bOrigin = process.env.G2_QA_OTHER_ORIGIN ?? "";
  expect(aOrigin).toBe("http://127.0.0.1:3005");
  expect(bOrigin).toBe("http://127.0.0.1:3006");
  const second = await http.newContext({
    baseURL: bOrigin, storageState: process.env.P7_OWNER_STORAGE_STATE!,
  });
  const outsider = await http.newContext({
    baseURL: aOrigin, storageState: process.env.P7_NONMEMBER_STORAGE_STATE!,
  });
  const created = await request.post(fixture(), {
    headers: header(aOrigin), data: { kind: "p8_browser" }, failOnStatusCode: false,
  });
  expect(created.status(), await created.text()).toBe(201);
  const { taskId } = await created.json() as { taskId: string };
  const control = taskBase() + "/" + taskId + "/browser/control";
  const watch = taskBase() + "/" + taskId + "/browser";
  const onA = (data: object) => request.post(control, {
    headers: header(aOrigin), data, failOnStatusCode: false,
  });
  const onB = (data: object) => second.post(control, {
    headers: header(bOrigin), data, failOnStatusCode: false,
  });
  try {
    // Warm both Next route bundles before the session is allocated.
    expect((await onA({ op: "qa_probe" })).status()).toBe(200);
    expect((await onB({ op: "qa_probe" })).status()).toBe(200);
    const ready = await onA({ op: "qa_prepare" });
    expect(ready.status(), await ready.text()).toBe(200);
    const prepared = await ready.json() as {
      connected: boolean; clickPoint: { x: number; y: number };
    };
    expect(prepared.connected).toBe(true);
    const otherOwner = await onB({ op: "qa_prepare" });
    expect(otherOwner.status(), "Worker B cannot create second Chromium owner").toBe(409);
    expect((await onB({ op: "takeover" })).status()).toBe(409);
    expect((await outsider.get(watch, { failOnStatusCode: false })).status()).toBe(404);

    const first = await onA({ op: "qa_step", kind: "click" });
    expect(first.status(), await first.text()).toBe(200);
    expect((await first.json() as { count: number }).count).toBe(1);

    const took = await onA({ op: "takeover" });
    expect(took.status(), await took.text()).toBe(200);
    expect((await took.json() as { paused: boolean }).paused).toBe(true);
    expect((await onB({ op: "takeover" })).status()).toBe(409);
    const watchState = await (await request.get(watch)).json() as {
      preview: { sequence: number };
    };
    const manual = await onA({ op: "click", frame: watchState.preview.sequence,
      x: prepared.clickPoint.x, y: prepared.clickPoint.y });
    expect(manual.status(), await manual.text()).toBe(200);
    expect((await manual.json() as { ok: boolean }).ok).toBe(true);
    expect((await onA({ op: "release" })).status()).toBe(200);
    const resumed = await onA({ op: "qa_step", kind: "click" });
    expect(resumed.status(), await resumed.text()).toBe(200);
    expect((await resumed.json() as { count: number }).count).toBe(3);

    // Remote Stop must win terminal Mongo CAS and revoke the browser token.
    const stopped = await second.post(taskBase() + "/" + taskId + "/stop",
      { failOnStatusCode: false });
    expect(stopped.status(), await stopped.text()).toBe(200);
    expect((await onA({ op: "qa_step", kind: "click" })).status()).toBe(409);
    const inspected = await request.get(fixture() + "?taskId=" + taskId);
    expect((await inspected.json() as { count: string }).count).toBe("3");
  } finally {
    await onA({ op: "qa_cleanup" }).catch(() => {});
    const removed = await request.delete(fixture(), { headers: header(aOrigin),
      data: { taskId }, failOnStatusCode: false });
    expect(removed.status(), await removed.text()).toBe(200);
    await outsider.dispose();
    await second.dispose();
  }
});

import { test, expect, request as http } from "@playwright/test";
import { projectId, taskBase } from "./qa-helpers";

const enabled = () => process.env.P8_QA_ALLOW_CLOSEOUT === "1";
const fixture = () => `/api/projects/${encodeURIComponent(projectId())}/agent/p7-qa`;
const originHeaders = (url: string) => ({ Origin: new URL(url).origin });

/** Real Chromium, same Next control route, in-memory synthetic HTML. No Dify. */
test("P8 isolated Watch loop and human takeover/handback closeout", async ({ request, baseURL }) => {
  test.skip(!enabled(), "Explicit P8_QA_ALLOW_CLOSEOUT=1 required for synthetic mutation");
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(["http://127.0.0.1:3005", "http://127.0.0.1:3006",
    "http://localhost:3005", "http://localhost:3006"]).toContain(origin);
  expect(process.env.P8_QA_ALLOWED_ORIGIN).toBe(origin);
  expect(["0", "1"]).toContain(process.env.P8_QA_EXPECT_REPORT_ONLY);
  const ownerHeaders = originHeaders(origin);
  const outsider = process.env.P7_NONMEMBER_STORAGE_STATE;
  expect(outsider, "Require synthetic nonmember storage state").toBeTruthy();

  const created = await request.post(fixture(), {
    headers: ownerHeaders, data: { kind: "p8_browser" }, failOnStatusCode: false,
  });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json() as { taskId: string; prepared: boolean }).taskId;
  expect(taskId).toMatch(/^pat_[a-f0-9]{12}$/);
  const browser = taskBase() + "/" + encodeURIComponent(taskId) + "/browser";
  const control = browser + "/control";
  const send = (data: object) => request.post(control, {
    headers: ownerHeaders, data, failOnStatusCode: false,
  });
  let nonmember: Awaited<ReturnType<typeof http.newContext>> | undefined;
  try {
    // Compile the control route before allocating the one live session.
    const warm = await send({ op: "qa_probe" });
    expect(warm.status(), await warm.text()).toBe(200);
    expect((await warm.json() as { connected: boolean }).connected).toBe(false);
    const prep = await send({ op: "qa_prepare" });
    expect(prep.status(), await prep.text()).toBe(200);
    const ready = await prep.json() as { connected: boolean; hasFrame: boolean;
      pid: number; clickPoint: { x: number; y: number } | null };
    expect(ready).toMatchObject({ connected: true, hasFrame: true });
    expect(ready.clickPoint).not.toBeNull();

    const initial = await request.get(browser);
    expect(initial.status()).toBe(200);
    expect(initial.headers()["cache-control"]).toBe("private, no-store");
    const payload = await initial.json() as { loop: { phase: string; actions: number };
      preview: { hasImage: boolean; sequence: number }; control: { paused: boolean; revision: number } };
    expect(payload.preview.hasImage).toBe(true);
    expect(payload.loop).toBeTruthy();
    expect((await request.get(browser + "?image=1")).status()).toBe(200);

    nonmember = await http.newContext({ baseURL: origin, storageState: outsider });
    for (const url of [browser, browser + "?image=1"]) {
      const denied = await nonmember.get(url, { failOnStatusCode: false });
      expect(denied.status(), "Nonmember must not see browser/watch/loop").toBe(404);
    }
    const deniedControl = await nonmember.post(control, {
      headers: ownerHeaders, data: { op: "takeover" }, failOnStatusCode: false,
    });
    expect(deniedControl.status()).toBe(404);

    const clicked = await send({ op: "qa_step", kind: "click" });
    expect(clicked.status(), await clicked.text()).toBe(200);
    const first = await clicked.json() as { ok: boolean; count: number;
      loop: { verified: number; actions: number }; pid: number };
    expect(first.ok).toBe(true); expect(first.count).toBe(1);
    expect(first.loop.verified).toBeGreaterThanOrEqual(1);
    expect(first.pid).toBe(ready.pid);

    const noopResults: Array<{ ok: boolean; blocked?: boolean;
      loop: { phase: string; unverified: number } }> = [];
    for (let i = 0; i < 4; i++) {
      const reply = await send({ op: "qa_step", kind: "no_progress" });
      expect(reply.status(), await reply.text()).toBe(200);
      noopResults.push(await reply.json());
    }
    const reportOnly = process.env.P8_QA_EXPECT_REPORT_ONLY === "1";
    expect(noopResults[2].loop.unverified).toBeGreaterThanOrEqual(3);
    if (reportOnly) expect(noopResults[3].blocked ?? false).toBe(false);
    else expect(noopResults[3].blocked).toBe(true);

    const takeover = await send({ op: "takeover" });
    expect(takeover.status(), await takeover.text()).toBe(200);
    expect((await takeover.json() as { paused: boolean }).paused).toBe(true);
    const during = await (await request.get(browser)).json() as {
      preview: { sequence: number }; control: { paused: boolean };
      loop: { phase: string; interventions: number } };
    expect(during.control.paused).toBe(true);
    expect(during.loop).toMatchObject({ phase: "human_control", interventions: 1 });
    const manual = await send({ op: "click", frame: during.preview.sequence,
      x: ready.clickPoint!.x, y: ready.clickPoint!.y });
    expect(manual.status(), await manual.text()).toBe(200);
    expect((await manual.json() as { ok: boolean }).ok).toBe(true);

    const release = await send({ op: "release" });
    expect(release.status(), await release.text()).toBe(200);
    const post = await (await request.get(browser)).json() as {
      control: { paused: boolean; revision: number };
      loop: { phase: string; interventions: number;
        events: Array<{ kind: string }> } };
    expect(post.control.paused).toBe(false);
    expect(post.control.revision).toBeGreaterThan(payload.control.revision);
    expect(post.loop.interventions).toBe(1);
    expect(post.loop.events.map(entry => entry.kind)).toEqual(
      expect.arrayContaining(["takeover", "handback"]));

    const resumed = await send({ op: "qa_step", kind: "click" });
    expect(resumed.status(), await resumed.text()).toBe(200);
    const done = await resumed.json() as { ok: boolean; count: number; pid: number };
    expect(done.ok).toBe(true); expect(done.count).toBe(3);
    expect(done.pid).toBe(ready.pid);
    const probe = await send({ op: "qa_probe" });
    const same = await probe.json() as { pid: number; connected: boolean };
    expect(same).toMatchObject({ pid: ready.pid, connected: true });
  } finally {
    await nonmember?.dispose();
    await send({ op: "qa_cleanup" }).catch(() => {});
    const removed = await request.delete(fixture(), {
      headers: ownerHeaders, data: { taskId }, failOnStatusCode: false,
    });
    expect(removed.status(), "Synthetic fixture must be deleted").toBe(200);
  }
});

import { getBrowserSession, withBrowserOp, scheduleIdleClose } from "./session";
import { captureBrowserWatch, setBrowserWatch, browserWatchStatus } from "./watch";
import { runBrowserAction } from "./index";

/** No request, navigation or external resource: this fixture exists only in Chromium memory. */
const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; connect-src 'none'; img-src 'none';">
<title>P7 Synthetic Browser Fixture</title><style>
body {font:16px system-ui;padding:24px;background:#f8fafc;color:#0f172a}
main {max-width:720px;margin:auto}button,input {padding:12px;margin:8px 0}
section {height:950px;background:linear-gradient(#fff,#e2e8f0)}
</style></head><body><main data-p7-synthetic="true">
<h1>Isolated P7 Browser Fixture</h1>
<p>This document is entirely in Chromium memory. No network request or form submission is used.</p>
<button id="qa-count" type="button">Increase counter</button>
<output id="qa-output" aria-live="polite">0</output>
<label>Safe local note <input type="text" id="qa-note" autocomplete="off"></label>
<label>Private value <input type="text" data-private value="MASKED_QA_ONLY"></label>
<section aria-label="Scroll fixture"><p>Scroll to find the bottom marker.</p></section>
<p id="qa-bottom">P7 synthetic scroll marker</p></main></body></html>`;

export async function prepareP7BrowserFixture(taskId: string, owner: string) {
  const session = await getBrowserSession(taskId, undefined, owner);
  session.chatId = taskId;
  await withBrowserOp(session, async () => {
    await session.page.setContent(HTML, { waitUntil: "domcontentloaded" });
    await session.page.evaluate(() => {
      let count = 0;
      document.getElementById("qa-count")!.addEventListener("click", () => {
        document.getElementById("qa-output")!.textContent = String(++count);
      });
    });
    session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
  }, false);
  setBrowserWatch(taskId, true);
  const snapshot = await runBrowserAction({ chatId: taskId, taskId, user: owner,
    ownerEmail: owner, query: "P7 synthetic fixture" }, { action: "browser", op: "snapshot" }, 1);
  if (snapshot.failed) throw new Error("P7 browser snapshot failed: " + snapshot.text.slice(0, 160));
  if (!browserWatchStatus(taskId)?.hasImage) await captureBrowserWatch(taskId, session.page, "p7_qa_open");
  scheduleIdleClose(session, taskId);
  const button = await session.page.locator("#qa-count").boundingBox();
  const viewport = session.page.viewportSize() ?? { width: 1280, height: 800 };
  const clickPoint = button ? { x: (button.x + button.width / 2) / viewport.width,
    y: (button.y + button.height / 2) / viewport.height } : null;
  return { hasFrame: Boolean(browserWatchStatus(taskId)?.hasImage),
    page: session.page.url(), clickPoint, snapshot: snapshot.text.slice(0, 400) };
}

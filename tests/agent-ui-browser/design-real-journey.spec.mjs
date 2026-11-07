import { test, expect } from "@playwright/test";

const root = "/agent-ui-qa.html?view=design-real";
const modelId = "design-abcdefabcdef";
const getFiles = async page => page.request.get("/api/qa/design-real/models").then(r => r.json());

test.beforeEach(async ({ page }) => {
  await page.goto(root);
  await expect(page.getByRole("region", { name: "Real CAD BIM user journey QA" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Design handoff " + modelId })).toBeVisible();
});

test("real exporter files are non-empty and GLB has valid binary header", async ({ page }) => {
  const files = await getFiles(page);
  const initial = files.files.filter(file => file.name.startsWith(modelId + "."));
  expect(initial.map(file => file.name)).toEqual(expect.arrayContaining(
    ["design-abcdefabcdef.pdf", "design-abcdefabcdef.glb", "design-abcdefabcdef.web.html",
      "design-abcdefabcdef.design.json", "design-abcdefabcdef.dxf", "design-abcdefabcdef.preview.png"]));
  for (const ext of ["pdf", "glb", "design.json", "preview.png", "dxf"]) {
    const res = await page.request.get("/api/qa/design-real/files/" + modelId + "." + ext);
    expect(res.ok()).toBe(true);
    const b = await res.body();
    expect(b.length).toBeGreaterThan(80);
    if (ext === "glb") expect(b.subarray(0, 4).toString("ascii")).toBe("glTF");
    if (ext === "pdf") expect(b.subarray(0, 5).toString()).toBe("%PDF-");
    if (ext === "preview.png") expect(b.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  }
});

test("real model viewer loads GLB into WebGL, changes perspective and toggles walls", async ({ page }) => {
  const handoff = page.getByRole("region", { name: "Design handoff " + modelId });
  await handoff.getByRole("button", { name: "View 3D" }).click();
  const frame = page.frameLocator('iframe[title="Real 3D concept preview"]');
  await expect(frame.getByRole("status")).toContainText("Model loaded", { timeout: 25_000 });
  await frame.getByRole("button", { name: "Plan 2D" }).click();
  await expect(frame.getByRole("button", { name: "Plan 2D" })).toHaveAttribute("aria-pressed", "true");
  await frame.getByRole("button", { name: "3D", exact: true }).click();
  await expect(frame.getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await frame.getByRole("button", { name: "Walls" }).click();
  const walls = frame.getByRole("button", { name: "Walls" });
  await expect(walls).toHaveAttribute("aria-pressed", "false");
  const toggled = Number(await walls.getAttribute("data-wall-mesh-count"));
  expect(toggled).toBeGreaterThan(0);
  await expect(frame.getByRole("status")).not.toHaveAttribute("data-error", "true");
  await frame.getByRole("button", { name: "Fit" }).click();
  await expect(frame.getByRole("button", { name: "Fit" })).toBeEnabled();
});

test("actual touch-friendly edits create a NEW binary design revision with source immutability", async ({ page, isMobile }) => {
  const posts = [];
  page.on("request", request => {
    if (request.url().includes("/api/qa/design-real/revise") && request.method() === "POST") posts.push(request);
  });
  const originalJson = await page.request.get("/api/qa/design-real/files/" + modelId + ".design.json").then(r => r.text());
  const originalGlb = await page.request.get("/api/qa/design-real/files/" + modelId + ".glb").then(r => r.body());
  const handoff = page.getByRole("region", { name: "Design handoff " + modelId });
  await handoff.getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  await expect(editor.getByText("Position: 3,000, 2,200 mm")).toBeVisible();
  const node = editor.getByRole("button", { name: "Meeting table furniture" });
  await node.scrollIntoViewIfNeeded();
  const box = await node.boundingBox();
  expect(box).toBeTruthy();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x, y, id: 1 }],
    });
    for (let i = 1; i <= 5; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x: x + i * 7, y, id: 1 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 35, y, { steps: 6 });
    await page.mouse.up();
  }
  await expect(editor.getByText("Position: 3,000, 2,200 mm")).not.toBeVisible();
  await editor.getByRole("button", { name: "Move right" }).click();
  await editor.getByRole("button", { name: "width plus 100 mm" }).click();
  await editor.getByRole("button", { name: "Prepare new revision in chat" }).click();
  const draft = page.getByRole("textbox", { name: "Design change draft" });
  await expect(draft).toContainText('"action":"design_edit"');
  expect(posts.length).toBe(0);
  await page.getByRole("button", { name: "Submit revision and export" }).click();
  await expect(page.getByTestId("real-revision-result")).toContainText("the original files remain available");
  expect(posts.length).toBe(1);
  const text = await page.getByTestId("real-revision-result").textContent();
  const newId = text.match(/design-[a-f0-9]{12}/)[0];
  expect(newId).not.toBe(modelId);
  const newJson = await page.request.get("/api/qa/design-real/files/" + newId + ".design.json").then(r => r.json());
  expect(newJson.furniture[0].width).toBe(1600);
  expect(newJson.furniture[0].x).toBeGreaterThan(3000);
  const newGlb = await page.request.get("/api/qa/design-real/files/" + newId + ".glb").then(r => r.body());
  expect(newGlb.subarray(0, 4).toString("ascii")).toBe("glTF");
  expect(newGlb.equals(originalGlb)).toBe(false);
  expect(await page.request.get("/api/qa/design-real/files/" + modelId + ".design.json").then(r => r.text())).toBe(originalJson);
  const originalGlbAfter = await page.request.get("/api/qa/design-real/files/" + modelId + ".glb").then(r => r.body());
  expect(originalGlbAfter.equals(originalGlb)).toBe(true);
  await expect(page.getByRole("region", { name: "Design handoff " + newId })).toBeVisible();
});

test("unsafe revision source cannot overwrite the original", async ({ page }) => {
  const bad = await page.request.post("/api/qa/design-real/revise", { data: {
    action: "design_edit", source: "outputs/../design-abcdefabcdef.design.json",
    edits: [{ type: "move_furniture", index: 0, x: 1000, y: 1000 }],
  } });
  expect(bad.status()).toBe(400);
  await page.getByRole("region", { name: "Design handoff " + modelId })
    .getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  await editor.getByRole("button", { name: "Reset draft" }).isDisabled();
  await expect(editor.getByRole("button", { name: "Prepare new revision in chat" })).toBeDisabled();
});
